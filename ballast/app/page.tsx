'use client';

/**
 * The whole instrument on one page.
 *
 * Ballast never calls Aave or KeeperHub — it only reads state the guardian
 * computed. When the engine is silent the page honestly says "bridge dark";
 * there is no fake data hiding in this UI.
 *
 * On a LIVE-armed deploy the same URL also hosts the SIM sandbox (a synthetic
 * storm demo under /api/guardian/sim). Once the real engine is seen, a small
 * LIVE ⇄ SIM switch appears in the top bar: SIM points the gauge at the sandbox,
 * LIVE points it back at the real position. Sim state is always labelled sim.
 */
import { useEffect, useState } from 'react';
import { useGuardianState, guardianBase } from '../lib/useGuardianState';
import type { InstrumentState } from '../lib/types';
import TopBar from '../components/TopBar';
import Inclinometer from '../components/Inclinometer';
import StatusPlate from '../components/StatusPlate';
import Telemetry from '../components/Telemetry';
import StormConditions from '../components/StormConditions';
import ShipLog from '../components/ShipLog';
import DevDeck from '../components/DevDeck';
import LivePanel from '../components/LivePanel';
import EngineOffline from '../components/EngineOffline';

function Bridge({
  state,
  onScenario,
  base,
}: {
  state: InstrumentState;
  onScenario: (s: InstrumentState) => void;
  base: string;
}) {
  const isLive = state.engineMode === 'live';
  return (
    <>
      <div className="instrument-column">
        <div className="instrument-frame" data-mode={state.mode} data-storm={state.stormActive}>
          <Inclinometer hf={state.healthFactor} thresholds={state.thresholds} status={state.status} />
        </div>
        <StatusPlate state={state} />
        <Telemetry state={state} />
      </div>

      <div className="side-column">
        {isLive ? <LivePanel onState={onScenario} /> : <DevDeck base={base} onScenario={onScenario} />}
        {isLive ? null : <StormConditions state={state} />}
        <ShipLog entries={state.log} />
      </div>
    </>
  );
}

export default function Page() {
  // 'auto' = the default engine for this deploy (LIVE when armed, SIM otherwise).
  // 'sim'  = the synthetic sandbox, reachable under /api/guardian/sim.
  const [view, setView] = useState<'auto' | 'sim'>('auto');
  // Becomes true once we've seen the real engine at the default endpoint — only
  // then does a LIVE ⇄ SIM switch make sense on this deploy.
  const [sawLive, setSawLive] = useState(false);

  const base = guardianBase();
  const active = view === 'sim' ? `${base}/sim` : base;
  const { state, connected, retry, ingest } = useGuardianState(active);

  useEffect(() => {
    if (state?.engineMode === 'live') setSawLive(true);
  }, [state]);

  const onView = (v: 'live' | 'sim') => setView(v === 'live' ? 'auto' : 'sim');

  const hasEngine = Boolean(state);

  // A panel may only be drawn once its snapshot actually belongs to the engine
  // the switch points at. Right after a toggle the old engine's snapshot is still
  // in the dial for a beat — showing its panel then is what made LIVE and SIM look
  // like they were crashing into each other. So while the requested engine is
  // lining up, we hold a quiet "switching" card instead of a mismatched panel.
  const asksSim = view === 'sim';
  const asksLive = view === 'auto' && sawLive;
  const mismatched =
    Boolean(state) &&
    ((asksSim && state!.engineMode !== 'sim') || (asksLive && state!.engineMode !== 'live'));

  return (
    <div className="app" data-storm={state?.stormActive ? 'true' : undefined}>
      <TopBar
        engineMode={state?.engineMode}
        connected={connected && hasEngine}
        tick={state?.tick ?? 0}
        view={view}
        canSim={sawLive}
        onView={onView}
      />
      <main className="console">
        {!hasEngine ? (
          <div className="offline-wrap">
            <EngineOffline retry={retry} />
          </div>
        ) : mismatched ? (
          <div className="offline-wrap" style={{ minHeight: '46vh' }}>
            <div className="offline">
              <p className="offline-code mono">
                {asksSim ? 'switching to the SIM engine…' : 'switching to the LIVE engine…'}
              </p>
              <p className="offline-sub">lining up — the dial will settle in a second</p>
            </div>
          </div>
        ) : (
          <Bridge state={state as InstrumentState} onScenario={ingest} base={active} />
        )}
      </main>
      <footer className="foot mono">
        Ballast — a liquidation guardian on <span className="k">KeeperHub</span> · the screen reads only
        what the engine computed
      </footer>
    </div>
  );
}
