'use client';

/**
 * useGuardianState — Ballast's ONLY window into the engine.
 *
 * Where the engine lives depends on where this page is served:
 *  - On your PC (localhost dev): the standalone guardian on :4300 (SSE).
 *  - Deployed (Vercel etc.): the engine rides along in the SAME app at
 *    /api/guardian, so no localhost is needed — we poll its snapshot, which is
 *    serverless-friendly and still animates a running storm.
 * Set NEXT_PUBLIC_GUARDIAN_URL to force a specific engine (e.g. a future real
 * live guardian). The screen never calls Aave or KeeperHub itself.
 *
 * A caller may pass `engineBase` to point at a specific engine namespace (e.g.
 * "/api/guardian/sim" for the synthetic sandbox on a live-armed deploy). When
 * omitted, guardianBase() picks the default: the standalone guardian on this PC,
 * or the same-origin /api/guardian on the deployed app.
 *
 * Switching engines (the LIVE ⇄ SIM switch) swaps `engineBase`. A generation
 * counter makes that switch atomic: responses that arrive from the PREVIOUS
 * engine after the switch are ignored, so the LIVE and SIM interfaces can never
 * overwrite each other mid-flip.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InstrumentState } from './types';

export function guardianBase(): string {
  const override = process.env.NEXT_PUBLIC_GUARDIAN_URL;
  if (override) return override.replace(/\/+$/, '');
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return `${window.location.origin}/api/guardian`; // cloud demo: engine beside the UI
  }
  return 'http://localhost:4300'; // this PC: standalone guardian
}

export function useGuardianState(engineBase?: string) {
  // `base` may differ from guardianBase() when the page is showing a specific
  // engine (SIM on a live deploy). Effects below re-subscribe when it changes.
  const base = engineBase ?? guardianBase();
  const [state, setState] = useState<InstrumentState | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  // Bumped on every stop/start. Async work captures the generation it started
  // under and bails if it has moved on — so a late response from the engine we
  // just left cannot clobber the engine we switched to.
  const genRef = useRef(0);

  /** Adopt a full state snapshot (from SSE, a poll, or a scenario POST body). */
  const ingest = useCallback((s: InstrumentState | null) => {
    if (!s) return;
    setState(s);
    setConnected(true);
    setReconnecting(false);
  }, []);

  const fetchState = useCallback(async () => {
    const gen = genRef.current;
    try {
      const r = await fetch(`${base}/state`);
      if (gen !== genRef.current) return; // engine switched while this was in flight
      if (r.ok) {
        const d = (await r.json()) as { state?: InstrumentState | null };
        if (gen !== genRef.current) return;
        if (d?.state) ingest(d.state);
      } else {
        setConnected(false);
        setReconnecting(true);
      }
    } catch {
      if (gen !== genRef.current) return;
      setConnected(false);
      setReconnecting(true);
    }
  }, [base, ingest]);

  const stop = useCallback(() => {
    genRef.current++; // invalidate anything still in flight from the old engine
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (typeof window === 'undefined') return;
    stop();
    const gen = genRef.current;

    if (base.startsWith(window.location.origin)) {
      // Cloud: engine is in this app — poll its snapshot. Cheap, reliable on
      // serverless, and a running storm still streams through the states.
      setReconnecting(false);
      void fetchState();
      pollRef.current = window.setInterval(() => void fetchState(), 350);
      return;
    }

    // Standalone guardian (this PC, or a NEXT_PUBLIC_GUARDIAN_URL override): SSE.
    const es = new EventSource(`${base}/events`);
    esRef.current = es;
    es.onopen = () => {
      if (gen !== genRef.current) return;
      setConnected(true);
      setReconnecting(false);
    };
    es.onmessage = (e) => {
      if (gen !== genRef.current) return;
      if (e.data && e.data[0] === '{') {
        try {
          ingest(JSON.parse(e.data) as InstrumentState);
        } catch {
          /* ignore malformed frames */
        }
      }
    };
    es.onerror = () => {
      if (gen !== genRef.current) return;
      setConnected(false);
      setReconnecting(true);
    };
  }, [base, stop, fetchState, ingest]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  const retry = useCallback(() => {
    stop();
    setConnected(false);
    setReconnecting(false);
    start();
  }, [stop, start]);

  return { state, connected, reconnecting, retry, ingest };
}
