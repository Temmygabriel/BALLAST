/**
 * The instrument state — a JSON-friendly snapshot the screen can draw.
 *
 * Every change produces a brand-new object with `tick` bumped by 1, so the UI
 * can simply re-render whenever a new one arrives. Nothing here is secret; the
 * screen may read ALL of it, but it may never change any of it.
 */
import { healthFactorOf, hf, toUsd } from './aave';
import type { ConditionRow, InstrumentState, LogEntry, Position, Status, Thresholds } from './types';

export const DEFAULT_THRESHOLDS: Thresholds = { warnHF: 1.15, actHF: 1.05, targetHF: 1.3 };

export function clock(): string {
  return new Date().toISOString().slice(11, 19); // "HH:MM:SS"
}

/** The starting (simulated) position: healthy, mid-green. */
export function initialPosition(): Position {
  return {
    label: 'SIM · Aave v3 USDC',
    collateralBase: 500n * 10n ** 8n, // $500.00
    debtBase: 300n * 10n ** 8n, // $300.00
    liqThresholdBps: 8000n, // 80% → HF = 500·0.8/300 ≈ 1.33
    decimals: 6,
    debtAssetName: 'USDC',
  };
}

export function snapshotOf(p: Position): { healthFactor: number; collateralUSD: number; debtUSD: number } {
  return {
    healthFactor: hf(healthFactorOf(p)),
    collateralUSD: toUsd(p.collateralBase),
    debtUSD: toUsd(p.debtBase),
  };
}

const ROW_DEFS: Array<{ id: string; name: string; note?: string; mainnetOnly?: boolean }> = [
  { id: 'nonce-collision', name: 'nonce collision', note: 'two transactions sent with the same nonce → one wedges' },
  { id: 'gas-spike', name: 'gas spike', note: 'base fee spikes 10× during the crash' },
  { id: 'would-be-revert', name: 'would-be revert', note: 'a call that would fail is sent anyway, burning gas' },
  { id: 'rpc-failure', name: 'RPC failure', note: 'the node endpoint dies mid-rescue' },
  { id: 'mev-sandwich', name: 'MEV sandwich', note: 'a bot front-runs the public-mempool rescue', mainnetOnly: true },
];

function freshRows(): ConditionRow[] {
  return ROW_DEFS.map((d) => ({
    id: d.id,
    name: d.name,
    note: d.note,
    baseline: 'pending',
    ballast: d.mainnetOnly ? 'skip' : 'pending',
    mainnetOnly: d.mainnetOnly,
  }));
}

export function initialState(opts: { position: Position; engineMode: 'sim' | 'live'; thresholds?: Thresholds }): InstrumentState {
  const snap = snapshotOf(opts.position);
  return {
    mode: 'bridge',
    status: 'STEADY',
    healthFactor: snap.healthFactor,
    thresholds: opts.thresholds ?? DEFAULT_THRESHOLDS,
    collateralUSD: snap.collateralUSD,
    debtUSD: snap.debtUSD,
    positionLabel: opts.position.label,
    conditions: freshRows(),
    log: [{ t: clock(), event: 'ENGINE ON', detail: `watching ${opts.position.label}` }],
    stormActive: false,
    engineMode: opts.engineMode,
    tick: 0,
  };
}

/** Push a new log line and return an updated state. */
export function withLog(s: InstrumentState, event: string, detail: string): InstrumentState {
  const entry: LogEntry = { t: clock(), event, detail };
  return { ...s, log: [...s.log, entry], tick: s.tick + 1 };
}

/** Apply a partial patch, bumping the tick so listeners see a change. */
export function patch(s: InstrumentState, part: Partial<InstrumentState>): InstrumentState {
  return { ...s, ...part, tick: s.tick + 1 };
}

/** Update one row of the conditions table. */
export function setRow(
  s: InstrumentState,
  id: string,
  side: 'baseline' | 'ballast',
  outcome: ConditionRow['baseline'],
  note?: string,
): InstrumentState {
  const next = s.conditions.map((row) => {
    if (row.id !== id) return row;
    return side === 'baseline'
      ? { ...row, baseline: outcome, baselineNote: note }
      : { ...row, ballast: outcome, ballastNote: note };
  });
  return { ...s, conditions: next, tick: s.tick + 1 };
}

export const STATUS_WORDS: Status[] = ['STEADY', 'LISTING', 'CAPSIZING', 'RESCUED', 'FOUNDERED'];

/** Human label for a position's status line in the log. */
export function statusOfHealthFactor(hfNum: number, t: Thresholds): Status {
  if (hfNum >= t.warnHF) return 'STEADY';
  if (hfNum >= t.actHF) return 'LISTING';
  return 'CAPSIZING';
}
