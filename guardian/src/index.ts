/**
 * Guardian public entry — what other packages (e.g. the Ballast UI's cloud
 * engine routes) import. The sim engine + bus back the keyless demo; the
 * cloud-live service is the on-demand twin of the CLI's always-on monitor.
 */
export { SimEngine } from './simulator';
export type { StateListener } from './bus';
export { StateBus } from './bus';
export { LiveService, liveArmed, liveCfgFromEnv, rescueArmed } from './cloud';
export type { RescueReply } from './cloud';
export type { LiveConfig } from './config';
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
