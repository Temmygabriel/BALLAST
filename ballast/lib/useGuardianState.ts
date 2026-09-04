'use client';

/**
 * useGuardianState — Ballast's ONLY window into the engine.
 *
 * Opens an EventSource to the guardian's state feed and replays the latest
 * snapshot. The screen never calls Aave or KeeperHub; it just listens.
 *
 * Returns `state` (latest InstrumentState or null) and `connected`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InstrumentState } from './types';

export const DEFAULT_GUARDIAN = process.env.NEXT_PUBLIC_GUARDIAN_URL ?? 'http://localhost:4300';
export const guardianBase = () => (DEFAULT_GUARDIAN || '').replace(/\/$/, '');

export function useGuardianState() {
  const [state, setState] = useState<InstrumentState | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const open = useCallback(() => {
    if (typeof window === 'undefined') return;
    const base = guardianBase();
    if (!base || esRef.current) return;
    const es = new EventSource(`${base}/events`);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setReconnecting(false);
    };
    es.onmessage = (e) => {
      if (e.data && e.data[0] === '{') {
        try {
          setState(JSON.parse(e.data) as InstrumentState);
        } catch {
          /* ignore malformed frames */
        }
      }
    };
    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects; track that we're in a retry lull.
      setReconnecting(true);
    };

    // Prime the pump with the latest snapshot so first paint isn't waiting on SSE.
    fetch(`${base}/state`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.state) setState(d.state as InstrumentState);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    open();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [open]);

  // Manual "try again" for the offline plate — tear down and reconnect.
  const retry = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setReconnecting(false);
    open();
  }, [open]);

  return { state, connected, reconnecting, retry };
}
