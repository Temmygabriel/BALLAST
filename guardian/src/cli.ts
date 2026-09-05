/**
 * guardian CLI — the engine's front door.
 *
 *   guardian sim                  start the SSE server in offline/sim mode (idle bridge)
 *   guardian sim --storm          run one full storm, then exit  (headless / CI / video)
 *   guardian sim --scenario NAME  run one chaos row, then exit   (NAME: gas-spike, …)
 *   guardian live                 poll a REAL Aave position and rescue through KeeperHub
 *   guardian storm                shortcut for `sim --storm`
 *
 * Options: --json (print every state as a JSON line), --port N (default 4300).
 */
import { StateBus } from './bus';
import { loadLiveConfig } from './config';
import { loadEnvFile } from './env';
import { startLiveMonitor } from './monitor';
import { startServer } from './server';
import { SimEngine } from './simulator';
import type { AdversityId } from './types';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const value = (f: string, dflt?: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : dflt;
};

const cmd = args[0] ?? 'sim';
const port = Number(value('--port') ?? process.env.GUARDIAN_PORT ?? process.env.PORT ?? 4300);
const jsonOut = has('--json');

function makeSim() {
  const bus = new StateBus();
  const sim = new SimEngine();
  sim.subscribe((s) => bus.publish(s));
  if (jsonOut) sim.subscribe((s) => console.log(JSON.stringify(s)));

  const dispatch = (name: string): boolean => {
    switch (name) {
      case 'storm':
        void sim.runStorm();
        return true;
      case 'price-crash':
      case 'crash':
        void sim.quickCrash();
        return true;
      case 'price-blip':
      case 'blip':
        void sim.runBlip(); // single-block scare → confirmation window holds, NO rescue
        return true;
      case 'reset':
        sim.reset();
        return true;
      default:
        if (sim.getState().conditions.some((r) => r.id === name)) {
          void sim.runRow(name as AdversityId);
          return true;
        }
        return false;
    }
  };
  return { bus, sim, dispatch };
}

async function main() {
  if (cmd === 'sim' || cmd === 'storm') {
    const { bus, sim, dispatch } = makeSim();

    if (has('--storm') || cmd === 'storm') {
      await sim.runStorm();
      console.log('\n[guardian] storm complete — last state:');
      console.log(JSON.stringify(sim.getState(), null, 2));
      process.exit(0);
    }

    const sc = value('--scenario');
    if (sc) {
      if (sc === 'price-blip' || sc === 'blip') await sim.runBlip();
      else await sim.runRow(sc as AdversityId);
      console.log(JSON.stringify(sim.getState(), null, 2));
      process.exit(0);
    }

    startServer({ bus, dispatch }, port);
    console.log('⚓ Ballast guardian — SIM mode (offline, no keys needed)');
    console.log(`   state feed   http://localhost:${port}/events`);
    console.log(`   snapshot     http://localhost:${port}/state`);
    console.log(`   start storm  →  http POST /scenario  { "name": "storm" }`);
    console.log('   e.g.  curl -X POST http://localhost:' + port + '/scenario -H "Content-Type: application/json" -d \'{"name":"storm"}\'');
  } else if (cmd === 'live') {
    loadEnvFile(); // reads guardian/.env so RPC + keys never sit in code
    const cfg = loadLiveConfig();
    const bus = new StateBus();
    startLiveMonitor({ publish: (s) => bus.publish(s) }, cfg);
    startServer({ bus, dispatch: () => false }, port);
    console.log('⚓ Ballast guardian — LIVE mode');
    console.log(`   watching ${cfg.protectedWallet} on chain ${cfg.chainId}`);
    console.log(`   state feed   http://localhost:${port}/events`);
  } else {
    console.error(`[guardian] unknown command "${cmd}" (try sim | live | storm)`);
    process.exit(1);
  }
}

void main();
