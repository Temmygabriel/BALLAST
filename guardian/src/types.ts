/**
 * Shared types for the whole Ballast engine.
 *
 * There are two kinds of objects here:
 *  - POSITION: the "real" numbers behind the scenes (big integers, Aave-style
 *    USD base units with 8 decimals). Used for the math.
 *  - STATE: a plain JSON-friendly snapshot the UI can read. Used to draw the screen.
 */

export type Status = 'STEADY' | 'LISTING' | 'CAPSIZING' | 'RESCUED' | 'FOUNDERED';
export type Mode = 'bridge' | 'storm' | 'rescue';
/** How one side (naive baseline OR Ballast) did on one chaos row. */
export type RowOutcome = 'pass' | 'fail' | 'pending' | 'skip';

export interface Thresholds {
  warnHF: number;   // below this → LISTING (amber)
  actHF: number;    // below this → rescue must act (red)
  targetHF: number; // where a rescue brings you back to
}

/** One row of the chaos "conditions" table shown during Storm Mode. */
export interface ConditionRow {
  id: string;
  name: string;
  /** What the injected failure actually is (plain words). */
  note?: string;
  baseline: RowOutcome;
  baselineNote?: string;
  ballast: RowOutcome;
  ballastNote?: string;
  /** True when this failure only exists on mainnet (e.g. MEV sandwiching). */
  mainnetOnly?: boolean;
}

export interface LogEntry {
  t: string;       // HH:MM:SS UTC
  event: string;   // e.g. "HF 1.34 -> 1.05"
  detail: string;
}

export interface LastTx {
  hash: string;
  auditUrl?: string;
  at: string;
}

/** What the screen draws. The guardian emits a fresh one whenever anything changes. */
export interface InstrumentState {
  mode: Mode;
  status: Status;
  healthFactor: number;
  thresholds: Thresholds;
  collateralUSD: number;
  debtUSD: number;
  positionLabel?: string;
  /** The risk analyst's plain-language explanation (after the guard clamps it). */
  rationale?: string;
  lastTx?: LastTx;
  conditions: ConditionRow[];
  log: LogEntry[];
  stormActive: boolean;
  engineMode: 'sim' | 'live';
  /** Bumped every update so the UI can tell changes apart. */
  tick: number;
}

/** The Aave-style position the math runs on. */
export interface Position {
  label: string;
  /** Total collateral value in Aave USD base units (8 decimals). */
  collateralBase: bigint;
  /** Total debt in Aave USD base units (8 decimals). */
  debtBase: bigint;
  /** Collateralization threshold in basis points (e.g. 8250 = 82.5%). */
  liqThresholdBps: bigint;
  /** Decimals of the debt asset (6 for USDC). ~$1 per token is assumed. */
  decimals: number;
  debtAssetName: string;
}

/** Result of a single rescue attempt through the keeper. */
export interface RescueOutcome {
  ok: boolean;
  /** True only when at least one rescue tx actually landed on the chain. */
  landed: boolean;
  status: Status; // RESCUED on success, FOUNDERED when the keeper couldn't land it
  reason?: string;
  txHash?: string;
  auditUrl?: string;
  rationale?: string;
  /** How much debt (token units) was actually repaid. */
  repaidUnits?: bigint;
  /** Human list of what happened, in order. */
  trail?: string[];
  /** The position AFTER a successful repay (for the engine to store). */
  finalPosition?: Position;
}

/** Something that can tell us the current position (live Aave OR the simulator). */
export interface PositionSource {
  getPosition(): Promise<Position>;
}

/* ── KeeperHub adapter surface (implemented live in keeperhub.ts, offline as MockKeeperHub) ── */

/** One contract call KeeperHub will dry-run then execute. */
export interface ContractCall {
  network: string; // chain id as a STRING: "1" | "11155111" | "8453" | ...
  contractAddress: string;
  abiFunction: string; // full signature, e.g. "repay(address,uint256,uint256,address)"
  args: unknown[];
  value?: string;
}

export type ExecStatus = 'pending' | 'running' | 'unconfirmed' | 'completed' | 'failed' | 'timeout';

export interface SimResult {
  success: boolean;
  wouldRevert: boolean;
  error?: string;
}

export interface ExecResult {
  executionId: string;
  status: ExecStatus;
  txHash?: string;
  auditUrl?: string;
  error?: string;
}

/** The one seam Ballast uses to reach KeeperHub (mock OR live). */
export interface KeeperHub {
  simulate(call: ContractCall): Promise<SimResult>;
  /** Execute one call; retry/backoff/private-routing live inside an implementation. */
  execute(call: ContractCall, idempotencyKey: string): Promise<ExecResult>;
  waitForTx(executionId: string): Promise<ExecResult>;
}

/** An injected disaster the naive baseline trips over but Ballast survives. */
export type AdversityId =
  | 'none'
  | 'price-crash'
  | 'nonce-collision'
  | 'gas-spike'
  | 'would-be-revert'
  | 'rpc-failure'
  | 'mev-sandwich';
