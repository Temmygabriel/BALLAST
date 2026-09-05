/**
 * Headless render check — server-renders every client component with a fake
 * instrument state and asserts the expected markup appears. No browser needed.
 * Run (needs the scratch tsconfig so JSX uses the automatic runtime):
 *   TSX_TSCONFIG_PATH=ballast/scratch/tsconfig.json node node_modules/tsx/dist/cli.mjs ballast/scratch/render-check.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import type { InstrumentState } from '../lib/types';
import Inclinometer from '../components/Inclinometer';
import StatusPlate from '../components/StatusPlate';
import Telemetry from '../components/Telemetry';
import StormConditions from '../components/StormConditions';
import ShipLog from '../components/ShipLog';
import TopBar from '../components/TopBar';
import DevDeck from '../components/DevDeck';
import EngineOffline from '../components/EngineOffline';

const state: InstrumentState = {
  mode: 'rescue',
  status: 'RESCUED',
  healthFactor: 1.300000001,
  thresholds: { warnHF: 1.15, actHF: 1.05, targetHF: 1.3 },
  collateralUSD: 386,
  debtUSD: 237.54,
  positionLabel: 'SIM · Aave v3 USDC',
  rationale: 'Repaying ~$62.46 of USDC restores the position to a safe level.',
  lastTx: {
    hash: '0x43548ba5fbabca1a36f7431a34f399cb',
    auditUrl: 'https://mock.keeperhub.local/audit/mock_exec_92021ea5f6',
    at: '2026-09-04T03:10:39.371Z',
  },
  conditions: [
    { id: 'nonce-collision', name: 'nonce collision', note: 'x', baseline: 'fail', baselineNote: 'b', ballast: 'pass', ballastNote: 'a' },
    { id: 'gas-spike', name: 'gas spike', note: 'x', baseline: 'fail', ballast: 'pass' },
    { id: 'would-be-revert', name: 'would-be revert', note: 'x', baseline: 'fail', ballast: 'pass' },
    { id: 'rpc-failure', name: 'RPC failure', note: 'x', baseline: 'fail', ballast: 'pass' },
    { id: 'mev-sandwich', name: 'MEV sandwich', note: 'x', baseline: 'fail', ballast: 'skip', mainnetOnly: true },
  ],
  log: [
    { t: '03:15:01', event: 'STORM', detail: 'price shock incoming' },
    { t: '03:15:04', event: 'PRICE', detail: 'collateral $386 · HF 1.029' },
    { t: '03:15:06', event: 'RESCUED', detail: 'needle back to green · tx 0x1' },
  ],
  stormActive: false,
  engineMode: 'sim',
  tick: 45,
};

let fail = 0;
function check(name: string, cond: boolean) {
  if (!cond) {
    fail++;
    console.error('✗', name);
  } else {
    console.log('✓', name);
  }
}

const ink = renderToStaticMarkup(h(Inclinometer, { hf: state.healthFactor, thresholds: state.thresholds, status: state.status }));
check('gauge: renders the needle', ink.includes('needle'));
check('gauge: includes all three zone colours', ['#B23A2E', '#C98A3B', '#3B6E52'].every((c) => ink.includes(c)));
check('gauge: red raw hex absent (token hex used)', !ink.includes('red'));

const plate = renderToStaticMarkup(h(StatusPlate, { state }));
check('status plate: shows RESCUED', plate.includes('>RESCUED<'));
check('status plate: shows HF 1.30', plate.includes('1.30'));
check('status plate: shows rationale', plate.includes('Repaying ~$62.46'));
check('status plate: shows audit link', plate.includes('audit ↗'));

const tel = renderToStaticMarkup(h(Telemetry, { state }));
check('telemetry: shows collateral & debt', tel.includes('COLLATERAL') && tel.includes('DEBT'));

const table = renderToStaticMarkup(h(StormConditions, { state }));
check('storm table: has NAIVE SCRIPT header', table.includes('NAIVE SCRIPT'));
check('storm table: has pass + fail + skip chips', ['chip-pass', 'chip-fail', 'chip-skip'].every((c) => table.includes(c)));
check('storm table: flags mainnet-only', table.includes('mainnet-only'));

const log = renderToStaticMarkup(h(ShipLog, { entries: state.log }));
check('ship log: shows RESCUED line', log.includes('RESCUED') && log.includes('needle back to green'));

const bar = renderToStaticMarkup(h(TopBar, { engineMode: state.engineMode, connected: true, tick: state.tick }));
check('top bar: engine badge + tick', bar.includes('engine · sim') && bar.includes('tick 45'));

const deck = renderToStaticMarkup(h(DevDeck, {}));
check('dev deck: storm button', deck.includes('Run the full storm'));

const off = renderToStaticMarkup(h(EngineOffline, { retry: () => {} }));
check('offline plate: BRIDGE DARK', off.includes('BRIDGE DARK'));

console.log(fail === 0 ? '\nALL RENDER CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
