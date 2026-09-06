'use client';

import type { InstrumentState } from '../lib/types';

/**
 * Where a real tx hash opens. This deploy is Sepolia, so that is the default;
 * set NEXT_PUBLIC_EXPLORER_URL when a deploy ever points at another chain.
 * Sim-mode hashes are synthetic — they are never linked.
 */
const EXPLORER = (process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://sepolia.etherscan.io').replace(/\/+$/, '');

const WORD = {
  STEADY: { color: 'var(--safe)', line: 'all plain sailing' },
  LISTING: { color: 'var(--warn)', line: 'heeled over — keeping watch' },
  CAPSIZING: { color: 'var(--danger)', line: 'below action threshold — rescue in motion' },
  RESCUED: { color: 'var(--safe)', line: 'needle back to green — debt repaid' },
  FOUNDERED: { color: 'var(--danger)', line: 'rescue could not land — position lost' },
} as const;

export default function StatusPlate({ state }: { state: InstrumentState }) {
  const w = WORD[state.status];
  const hf = state.healthFactor;
  return (
    <div className="statusplate">
      <div className="statusplate-word" style={{ color: w.color }} data-status={state.status}>
        {state.status}
      </div>
      <div className="statusplate-hf">
        <span className="mono" aria-label="health factor">
          {hf.toFixed(2)}
        </span>
        <span className="hf-caption">HEALTH FACTOR</span>
      </div>
      <div className="statusplate-line">{w.line}</div>
      <div className="statusplate-thresholds mono">
        warn&nbsp;{state.thresholds.warnHF.toFixed(2)} · act&nbsp;{state.thresholds.actHF.toFixed(2)} · target&nbsp;
        {state.thresholds.targetHF.toFixed(2)}
      </div>
      {state.rationale ? <div className="rationale">“{state.rationale}”</div> : null}
      {state.lastTx ? (
        <div className="lasttx mono">
          <span className="lasttx-label">TX</span>
          {state.engineMode === 'live' && state.lastTx.hash ? (
            <a
              className="lasttx-hash tx-link"
              href={`${EXPLORER}/tx/${state.lastTx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {state.lastTx.hash}
            </a>
          ) : (
            <span className="lasttx-hash">{state.lastTx.hash}</span>
          )}
          {state.lastTx.auditUrl ? (
            <a className="audit-link" href={state.lastTx.auditUrl} target="_blank" rel="noreferrer">
              audit ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
