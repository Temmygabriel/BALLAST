'use client';

import type { InstrumentState } from '../lib/types';

/** A slim strip of hard numbers under the gauge. JetBrains Mono, all business. */
export default function Telemetry({ state }: { state: InstrumentState }) {
  const usd = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const cells: Array<[string, string]> = [
    ['COLLATERAL', usd(state.collateralUSD)],
    ['DEBT', usd(state.debtUSD)],
    ['ENGINE', state.engineMode.toUpperCase()],
    ['POSITION', state.positionLabel ?? '—'],
  ];
  return (
    <div className="telemetry">
      {cells.map(([k, v]) => (
        <div className="telemetry-cell" key={k}>
          <span className="telemetry-label">{k}</span>
          <span className="telemetry-value mono">{v}</span>
        </div>
      ))}
    </div>
  );
}
