'use client';

import { guardianBase } from '../lib/useGuardianState';

const SCENARIOS: Array<{ id: string; label: string; mainnetOnly?: boolean }> = [
  { id: 'storm', label: 'Full storm' },
  { id: 'price-crash', label: 'price crash' },
  { id: 'gas-spike', label: 'gas spike' },
  { id: 'nonce-collision', label: 'nonce clash' },
  { id: 'would-be-revert', label: 'bad repay' },
  { id: 'rpc-failure', label: 'RPC down' },
];

/** Demo controls — how a storm gets raised from the screen (sim mode only). */
export default function DevDeck() {
  const fire = async (name: string) => {
    const base = guardianBase();
    if (!base) return;
    try {
      await fetch(`${base}/scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    } catch {
      /* engine gone mid-click — fine, it reconnects */
    }
  };

  return (
    <section className="card devdeck">
      <header className="card-head">
        <h2 className="card-title">RAISE THE STORM</h2>
        <span className="tag mono">sim engine</span>
      </header>
      <div className="deck-buttons">
        <button className="btn btn-storm" onClick={() => fire('storm')}>
          ⚡ Run the full storm
        </button>
        <button className="btn btn-ghost" onClick={() => fire('reset')}>
          Reset to bridge
        </button>
      </div>
      <div className="deck-chips">
        {SCENARIOS.map((s) => (
          <button key={s.id} className="chip-btn mono" onClick={() => fire(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}
