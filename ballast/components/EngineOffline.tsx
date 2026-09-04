'use client';

import { guardianBase } from '../lib/useGuardianState';

/** Shown while the engine isn't answering — "bridge dark". No fake data, ever. */
export default function EngineOffline({ retry }: { retry: () => void }) {
  return (
    <div className="offline">
      <div className="offline-lamp">
        <span className="offline-pillar" />
        <div className="offline-bulb" />
      </div>
      <h1 className="offline-title">BRIDGE DARK</h1>
      <p className="offline-sub">The guardian engine is not answering on this feed.</p>
      <p className="offline-code mono">
        {guardianBase() || 'NEXT_PUBLIC_GUARDIAN_URL (unset)'} · /events
      </p>
      <p className="offline-how">
        Start it from the repo root and this dial lights up:
        <br />
        <code className="mono">npm install --registry=https://registry.npmjs.org/</code>
        <br />
        <code className="mono">npm run dev</code>
      </p>
      <button className="btn btn-ghost" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
