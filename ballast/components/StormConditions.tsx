'use client';

import type { ConditionRow, InstrumentState } from '../lib/types';

function Chip({ outcome }: { outcome: ConditionRow['ballast'] }) {
  if (outcome === 'pass') return <span className="chip chip-pass">✓ pass</span>;
  if (outcome === 'fail') return <span className="chip chip-fail">✗ fail</span>;
  if (outcome === 'skip') return <span className="chip chip-skip">—</span>;
  return <span className="chip chip-pending">…</span>;
}

/** The chaos "conditions" ledger: what the naive script does vs what Ballast does. */
export default function StormConditions({ state }: { state: InstrumentState }) {
  const decided = state.conditions.filter((c) => c.baseline !== 'pending' || c.ballast !== 'pending').length;
  const caption = state.stormActive
    ? 'storm live — the ledger is filling in'
    : decided > 0
      ? 'ledger from the last storm'
      : 'the ledger will fill when the storm breaks';

  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">CONDITIONS UNDER STORM</h2>
        <span className="card-count mono">
          {decided}/{state.conditions.length} resolved
        </span>
      </header>
      <p className="card-sub">{caption}</p>

      <div className="storm-table">
        <div className="storm-row storm-row-head mono">
          <span />
          <span>NAIVE SCRIPT</span>
          <span>BALLAST</span>
        </div>
        {state.conditions.map((row) => (
          <div className="storm-row" key={row.id}>
            <div className="cond">
              <span className="cond-name">{row.name}</span>
              {row.mainnetOnly ? <span className="tag mono">mainnet-only</span> : null}
              <span className="cond-note">{row.note}</span>
            </div>
            <div className="cond-cell">
              <Chip outcome={row.baseline} />
              {row.baselineNote ? <span className="cell-note">{row.baselineNote}</span> : null}
            </div>
            <div className="cond-cell">
              <Chip outcome={row.ballast} />
              {row.ballastNote ? <span className="cell-note">{row.ballastNote}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <p className="ledger-note">
        Each condition is a failure injected during the crash. The naive path has no dry-run, no
        nonce management, no smart gas and no failover — so it trips. Ballast runs the same calls
        through <span className="k">KeeperHub</span> and sails on.
      </p>
    </section>
  );
}
