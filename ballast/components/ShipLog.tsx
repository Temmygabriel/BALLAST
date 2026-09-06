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
  const listRef = useRef<HTMLDivElement | null>(null);
  // Whether the reader is already at the newest line. We only auto-sail while
  // they are — never yank the box away from someone reading older entries.
  const stickRef = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (stickRef.current && listRef.current) {
      // Scroll only this box to its newest line. Never scrollIntoView — that
      // scrolls every ancestor (the whole page) to reveal the line, which made
      // the screen roll down on its own while a storm streamed log entries.
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length]);

  const fmt = (s: Status | string) => s;

  return (
    <section className="card logcard">
      <header className="card-head">
        <h2 className="card-title">SHIP&rsquo;S LOG</h2>
        <span className="card-count mono">{entries.length} entries</span>
      </header>
      <div className="log-list mono" ref={listRef}>
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
      </div>
    </section>
  );
}
