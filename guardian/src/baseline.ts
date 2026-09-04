/**
 * The NAIVE BASELINE — the "what a normal script would do" that fails the storm.
 *
 * A plain `eth_sendTransaction` loop has none of the things KeeperHub gives you:
 * no dry-run, no nonce management, no smart gas, no retries, no multi-RPC failover,
 * no private routing. So when chaos hits, it is the one that breaks.
 *
 * In offline/sim mode we can't broadcast to a real chain, so `baselineFailureFor`
 * states what the naive path WOULD do under each injected failure. The real chain
 * version of this lives in `chaos/` once we're on an anvil fork.
 */
import type { AdversityId } from './types';

export interface BaselineResult {
  outcome: 'fail';
  note: string;
}

const NOTES: Record<AdversityId, string> = {
  none: 'no failure injected',
  'price-crash': 'never even detects the slide in time',
  'nonce-collision': 'sent approve + repay at the same nonce → the second one wedges',
  'gas-spike': 'broadcast underpriced → stuck in the mempool while the price keeps falling',
  'would-be-revert': 'sent the bad call anyway → it reverts and burns gas',
  'rpc-failure': 'single endpoint dies → the naive script has no failover and stops',
  'mev-sandwich': 'lands in the public mempool → a bot front-runs it and steals the value',
};

/** What the naive script does under a given failure. It always fails. */
export function baselineFailureFor(adversity: AdversityId): BaselineResult {
  return { outcome: 'fail', note: NOTES[adversity] ?? 'unknown failure' };
}
