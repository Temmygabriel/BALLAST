/**
 * The contract between the guardian and the screen.
 *
 * The engine (guardian/) is the ONLY writer. Ballast mirrors the JSON shape so the
 * two packages never import each other — the SSE feed *is* the interface. If you
 * change fields on one side, change them here too.
 */

export type Status = 'STEADY' | 'LISTING' | 'CAPSIZING' | 'RESCUED' | 'FOUNDERED';
export type Mode = 'bridge' | 'storm' | 'rescue';
export type RowOutcome = 'pass' | 'fail' | 'pending' | 'skip';

export interface Thresholds {
  warnHF: number;
  actHF: number;
  targetHF: number;
}

export interface ConditionRow {
  id: string;
  name: string;
  note?: string;
  baseline: RowOutcome;
  baselineNote?: string;
  ballast: RowOutcome;
  ballastNote?: string;
  mainnetOnly?: boolean;
}

export interface LogEntry {
  t: string;
  event: string;
  detail: string;
}

export interface LastTx {
  hash: string;
  auditUrl?: string;
  at: string;
}

export interface InstrumentState {
  mode: Mode;
  status: Status;
  healthFactor: number;
  thresholds: Thresholds;
  collateralUSD: number;
  debtUSD: number;
  positionLabel?: string;
  rationale?: string;
  lastTx?: LastTx;
  conditions: ConditionRow[];
  log: LogEntry[];
  stormActive: boolean;
  engineMode: 'sim' | 'live';
  tick: number;
}
