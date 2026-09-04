/**
 * The POLICY GUARD — the whole point of the design.
 *
 * The AI risk analyst may PROPOSE anything. This tiny function makes sure the
 * proposal that actually reaches the chain is whitelisted + capped. Probabilistic
 * brains can suggest; only a deterministic clamp may decide what moves money.
 */
import type { RiskConfig } from './config';

export interface Proposal {
  debtAsset: string;
  /** Amount to repay, in debt-asset token units (e.g. USDC with 6 decimals). */
  amountUnits: bigint;
  rationale?: string;
}

export interface GuardConfig {
  allowedAssets: string[];
  maxUnits: bigint; // hard cap, debt-asset units
}

export function guard(p: Proposal, cfg: GuardConfig): Proposal {
  if (!cfg.allowedAssets.some((a) => a.toLowerCase() === p.debtAsset.toLowerCase())) {
    throw new Error(`guard: asset ${p.debtAsset} is not whitelisted`);
  }
  const amountUnits = p.amountUnits > cfg.maxUnits ? cfg.maxUnits : p.amountUnits;
  if (amountUnits <= 0n) throw new Error('guard: non-positive amount');
  return { ...p, amountUnits };
}

/** Convenience for callers that already parsed their risk config. */
export function guardAgainst(p: Proposal, risk: RiskConfig, debtAsset: string): Proposal {
  return guard(p, { allowedAssets: [debtAsset], maxUnits: risk.maxUnits });
}
