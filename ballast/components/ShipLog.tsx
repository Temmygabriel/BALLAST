'use client';

import { useEffect, useRef } from 'react';
import type { LogEntry, Status } from '../lib/types';

const EVENT_COLOR: Record<string, string> = {
  RESCUED: 'var(--safe)',
  FOUNDERED: 'var(--danger)',
  STORM: 'var(--brass)',
  rescue: 'var(--brass)',
};

function colorOf(e: LogEntry['event']): string {
  if (EVENT_COLOR[e]) return EVENT_COLOR[e]!;
  if (e === 'PRICE') return 'var(--warn)';
  return 'var(--ivoryDim)';
}

/** The ship's log — chronological, oldest at top, auto-sails to the newest line. */
export default function ShipLog({ entries }: { entries: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [entries.length]);

  const fmt = (s: Status | string) => s;

  return (
    <section className="card logcard">
      <header className="card-head">
        <h2 className="card-title">SHIP&rsquo;S LOG</h2>
        <span className="card-count mono">{entries.length} entries</span>
      </header>
      <div className="log-list mono">
        {entries.length === 0 ? <div className="log-empty">— no entries yet —</div> : null}
        {entries.map((e, i) => (
          <div className="log-line" key={i}>
            <span className="log-t">{e.t}</span>
            <span className="log-event" style={{ color: colorOf(e.event) }}>
              {fmt(e.event)}
            </span>
            <span className="log-detail">{e.detail}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
