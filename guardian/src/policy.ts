/**
 * Policy = the DETERMINISTIC decision math (no AI in this file).
 *
 * `repayBaseToTarget` works out how much debt (in USD base units) we must pay
 * down so the position's health factor climbs back up to `targetHF`.
 *
 * Rearranging the HF formula: targetDebt = collateral × threshold / (1e4 × targetHF)
 */
import type { Position } from './types';
import { healthFactorOf, hf, toUsd } from './aave';

const WAD = 10n ** 18n;
const BP = 10_000n; // basis points in full

/** How much debt to repay (in base units) to reach targetHF. 0n if already safe. */
export function repayBaseToTarget(
  collateralBase: bigint,
  liqThresholdBps: bigint,
  debtBase: bigint,
  targetHF: number,
): bigint {
  const denom = BigInt(Math.round(1e4 * targetHF));
  const targetDebt = (collateralBase * liqThresholdBps) / denom;
  return debtBase > targetDebt ? debtBase - targetDebt : 0n;
}

/**
 * Convert a base-unit repay amount into debt-asset token units.
 * A ~$1 stablecoin (USDC, 6 decimals) is assumed: 1e8 base ≈ 1 token.
 */
export function baseToTokenUnits(repayBase: bigint, decimals: number): bigint {
  const scale = 10n ** BigInt(8 - decimals);
  return repayBase / scale;
}

/** Opposite direction — token units back to base units (used by the guard's cap). */
export function tokenUnitsToBase(units: bigint, decimals: number): bigint {
  return units * 10n ** BigInt(8 - decimals);
}

/** A small planner the risk analyst can read — plain numbers, no model needed. */
export function planRepay(p: Position, targetHF: number): { repayBase: bigint; units: bigint; toUsd: number } {
  const repayBase = repayBaseToTarget(p.collateralBase, p.liqThresholdBps, p.debtBase, targetHF);
  const units = baseToTokenUnits(repayBase, p.decimals);
  return { repayBase, units, toUsd: toUsd(repayBase) };
}

/** After repaying, the debt shrinks — give back the updated position. */
export function afterRepay(p: Position, repaidBase: bigint): Position {
  return {
    ...p,
    debtBase: p.debtBase > repaidBase ? p.debtBase - repaidBase : 0n,
  };
}

export { healthFactorOf, hf, toUsd, WAD };
