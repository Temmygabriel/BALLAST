'use client';

/** A plumb-line mark: the keel weight that keeps a ship from heeling over. */
function PlumbMark() {
  return (
    <svg className="wordmark-mark" viewBox="-14 -14 28 28" aria-hidden>
      <circle r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="0" y1="3.4" x2="0" y2="8.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="0" cy="10.5" r="2.6" fill="currentColor" />
      <line x1="-6" y1="-4" x2="6" y2="-4" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

export default function TopBar({
  engineMode,
  connected,
  tick,
  view,
  canSim,
  onView,
}: {
  engineMode?: 'sim' | 'live';
  connected: boolean;
  tick: number;
  /** Which engine the gauge is reading: 'auto' = this deploy's default, 'sim' = sandbox. */
  view?: 'auto' | 'sim';
  /** Show the LIVE ⇄ SIM switch once a real engine was seen on this deploy. */
  canSim?: boolean;
  onView?: (v: 'live' | 'sim') => void;
}) {
  return (
    <header className="topbar">
      <div className="wordmark">
        <span className="wordmark-mark-wrap">
          <PlumbMark />
        </span>
        <span className="wordmark-name">BALLAST</span>
        <span className="wordmark-tag">liquidation guardian</span>
      </div>
      <div className="topbar-right">
        {canSim ? (
          <div className="mode-switch mono" role="group" aria-label="which engine to show">
            <button
              type="button"
              className="mode-btn"
              data-mode="live"
              data-active={view !== 'sim'}
              onClick={() => onView?.('live')}
            >
              LIVE
            </button>
            <button
              type="button"
              className="mode-btn"
              data-mode="sim"
              data-active={view === 'sim'}
              onClick={() => onView?.('sim')}
            >
              SIM
            </button>
          </div>
        ) : null}
        {engineMode ? <span className="pill mono">engine · {engineMode}</span> : null}
        <span className="conn" data-on={connected} title={connected ? 'feed live' : 'feed down'}>
          <span className="conn-dot" />
          <span className="mono">{connected ? (engineMode ? 'link' : '…') : 'no link'}</span>
        </span>
        {engineMode ? <span className="tick mono">tick {tick}</span> : null}
      </div>
    </header>
  );
}
