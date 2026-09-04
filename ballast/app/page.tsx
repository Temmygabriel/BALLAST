'use client';

/**
 * The whole instrument on one page.
 *
 * Ballast never calls Aave or KeeperHub — it only reads state the guardian
 * computed. When the engine is silent the page honestly says "bridge dark";
 * there is no fake data hiding in this UI.
 */
import { useGuardianState } from '../lib/useGuardianState';
import type { InstrumentState } from '../lib/types';
import TopBar from '../components/TopBar';
import Inclinometer from '../components/Inclinometer';
import StatusPlate from '../components/StatusPlate';
import Telemetry from '../components/Telemetry';
import StormConditions from '../components/StormConditions';
import ShipLog from '../components/ShipLog';
import DevDeck from '../components/DevDeck';
import EngineOffline from '../components/EngineOffline';

function Bridge({ state }: { state: InstrumentState }) {
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
        {state.engineMode === 'sim' ? <DevDeck /> : null}
        <StormConditions state={state} />
        <ShipLog entries={state.log} />
      </div>
    </>
  );
}

export default function Page() {
  const { state, connected, retry } = useGuardianState();
  const hasEngine = Boolean(state);

  return (
    <div className="app" data-storm={state?.stormActive ? 'true' : undefined}>
      <TopBar
        engineMode={state?.engineMode}
        connected={connected && hasEngine}
        tick={state?.tick ?? 0}
      />
      <main className="console">
        {hasEngine ? (
          <Bridge state={state as InstrumentState} />
        ) : (
          <div className="offline-wrap">
            <EngineOffline retry={retry} />
          </div>
        )}
      </main>
      <footer className="foot mono">
        Ballast — a liquidation guardian on <span className="k">KeeperHub</span> · the screen reads only
        what the engine computed
      </footer>
    </div>
  );
}
