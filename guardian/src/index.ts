/**
 * Guardian public entry — what other packages (e.g. the Ballast UI's cloud
 * engine routes) import. Only the sim engine + bus are exposed here; the live
 * Aave/KeeperHub path stays behind the guardian's own CLI.
 */
export { SimEngine } from './simulator';
export type { StateListener } from './bus';
export { StateBus } from './bus';
export type {
  AdversityId,
  ConditionRow,
  InstrumentState,
  LastTx,
  LogEntry,
  Mode,
  Position,
  RescueOutcome,
  RowOutcome,
  Status,
  Thresholds,
} from './types';
