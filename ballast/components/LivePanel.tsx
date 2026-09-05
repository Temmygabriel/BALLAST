'use client';

/**
 * LivePanel — what replaces the sim DevDeck when the deployed engine is LIVE
 * (real Aave position). It can sync the position and, with the operator key,
 * trigger a real KeeperHub rescue. The screen still never computes anything and
 * never talks to Aave/KeeperHub directly — every button just asks the engine.
 *
 * Honesty rules built in:
 *  - "RESCUE NOW" needs the operator key (x-ballast-key == BALLAST_LIVE_KEY). The key
 *    lives only in the request header; it is never stored here.
 *  - A rescue only fires when the engine says the position is below the act line. If
 *    the position is healthy the engine answers "nothing to rescue" — no pretending.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { guardianBase } from '../lib/useGuardianState';
import type { InstrumentState } from '../lib/types';

interface RescueReply {
  landed: boolean;
  status?: InstrumentState['status'];
  reason?: string;
  txHash?: string;
  auditUrl?: string;
}

type Msg = { kind: 'ok' | 'err' | 'info'; text: string } | null;

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontFamily: 'var(--mono)',
  fontSize: 12,
  color: 'inherit',
  background: 'transparent',
  border: '1px solid var(--panel-line)',
  borderRadius: 4,
  padding: '6px 8px',
};

const noteStyle: CSSProperties = { marginTop: 6, fontSize: 12, color: 'var(--ivory-dim)', lineHeight: 1.5 };

export default function LivePanel({ onState }: { onState?: (s: InstrumentState) => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [armed, setArmed] = useState<boolean | null>(null);

  // Is the operator rescue armed on this deployment? (read-only /health call)
  useEffect(() => {
    let alive = true;
    fetch(`${guardianBase()}/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setArmed(d.engine === 'live' && Boolean(d.armed));
      })
      .catch(() => {
        /* engine still waking — leave armed as null */
      });
    return () => {
      alive = false;
    };
  }, []);

  const sync = async () => {
    try {
      const r = await fetch(`${guardianBase()}/state`);
      if (!r.ok) return setMsg({ kind: 'err', text: `engine answered ${r.status}` });
      const d = (await r.json()) as { state?: InstrumentState | null };
      if (d?.state) {
        onState?.(d.state);
        setMsg({ kind: 'ok', text: 'position synced from chain' });
      }
    } catch {
      setMsg({ kind: 'err', text: 'could not reach the engine' });
    }
  };

  const rescue = async () => {
    if (!key.trim()) return setMsg({ kind: 'err', text: 'enter the operator key to arm a rescue' });
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`${guardianBase()}/rescue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ballast-key': key.trim() },
      });
      const d = (await r.json()) as {
        ok?: boolean;
        error?: string;
        state?: InstrumentState | null;
        rescue?: RescueReply;
      };
      if (!r.ok || !d.ok) {
        setMsg({ kind: 'err', text: d.error ?? `engine answered ${r.status}` });
        return;
      }
      if (d.state) onState?.(d.state);
      const rep = d.rescue;
      if (!rep) return setMsg({ kind: 'info', text: 'engine acknowledged the request' });
      if (rep.landed) {
        setMsg({
          kind: 'ok',
          text: `RESCUED · ${rep.reason ?? 'tx confirmed'}${rep.txHash ? ' · ' + rep.txHash : ''}`,
        });
      } else {
        setMsg({ kind: 'info', text: rep.reason ?? 'standing by — nothing broadcast' });
      }
    } catch {
      setMsg({ kind: 'err', text: 'could not reach the engine' });
    } finally {
      setBusy(false);
      setKey('');
    }
  };

  return (
    <section className="card devdeck">
      <header className="card-head">
        <h2 className="card-title">LIVE POSITION</h2>
        <span className="tag mono" style={{ color: 'var(--safe)' }}>
          real chain
        </span>
      </header>
      <p style={noteStyle}>
        This reads a real Aave v3 position on Sepolia. The needle is its live health
        factor — the engine reports it, the screen only draws it.
      </p>
      <div className="deck-buttons">
        <button className="btn btn-ghost" onClick={() => void sync()} disabled={busy}>
          ⟳ Sync position
        </button>
      </div>
      <div className="rescue-row" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={armed === null ? 'operator key…' : armed ? 'operator key…' : 'rescue disarmed on this deployment'}
          disabled={busy || armed === false}
          style={inputStyle}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn btn-storm" onClick={() => void rescue()} disabled={busy || armed === false}>
          {busy ? '…' : 'RESCUE NOW'}
        </button>
      </div>
      <p style={noteStyle}>
        {armed === false
          ? 'The operator key + KeeperHub creds are not set in this deployment, so the money path stays off.'
          : 'Only fires below the act line (red) — a healthy position answers "nothing to rescue". The key travels in the request header and is never stored here.'}
      </p>
      {msg ? (
        <p
          className="mono"
          style={{
            marginTop: 8,
            fontSize: 12,
            color: msg.kind === 'err' ? 'var(--danger)' : msg.kind === 'ok' ? 'var(--safe)' : 'inherit',
            overflowWrap: 'anywhere',
          }}
        >
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
