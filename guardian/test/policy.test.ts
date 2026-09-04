import { describe, expect, it } from 'vitest';
import { healthFactorOf, hf, toUsd } from '../src/aave';
import { afterRepay, baseToTokenUnits, planRepay, repayBaseToTarget, tokenUnitsToBase } from '../src/policy';
import { initialPosition } from '../src/state';

/** A position with the given whole-dollar collateral/debt, 80% threshold, USDC (6 dec). */
function pos(collateralUSD: number, debtUSD: number) {
  return {
    label: 'test',
    collateralBase: BigInt(Math.round(collateralUSD * 1e8)),
    debtBase: BigInt(Math.round(debtUSD * 1e8)),
    liqThresholdBps: 8000n,
    decimals: 6,
    debtAssetName: 'USDC',
  };
}

describe('health-factor math', () => {
  it('computes HF ≈ 1.33 for the starting position', () => {
    const p = initialPosition();
    const n = hf(healthFactorOf(p));
    expect(n).toBeGreaterThan(1.3);
    expect(n).toBeLessThan(1.36);
  });

  it('goes below 1 (liquidatable) when collateral collapses', () => {
    const p = pos(350, 300); // HF = 350·0.8/300 ≈ 0.933
    expect(hf(healthFactorOf(p))).toBeLessThan(1);
  });
});

describe('repay policy', () => {
  it('needs NO repay while the position is already above target HF', () => {
    const plan = planRepay(initialPosition(), 1.3); // already ≈1.33
    expect(plan.repayBase).toBe(0n);
    expect(plan.units).toBe(0n);
  });

  it('plans ≈$62.5 to bring a 1.03-HF position back to 1.30', () => {
    const p = pos(386, 300); // HF = 386·0.8/300 ≈ 1.029
    const plan = planRepay(p, 1.3);
    expect(plan.units).toBeGreaterThan(0n);
    // target debt ≈ $237.54 → repay ≈ $62.46
    expect(plan.toUsd).toBeGreaterThan(60);
    expect(plan.toUsd).toBeLessThan(65);
    expect(toUsd(repayBaseToTarget(p.collateralBase, p.liqThresholdBps, p.debtBase, 1.3))).toBeCloseTo(62.46, 0);
  });

  it('converts raw units back and forth (round trip)', () => {
    const base = 62_460_000_000n; // $624.60 in base units
    const units = baseToTokenUnits(base, 6); // /100 → raw 6-dec units
    expect(units).toBe(624_600_000n);
    expect(tokenUnitsToBase(units, 6)).toBe(base);
  });

  it('shrinks debt after a repay', () => {
    const p = pos(386, 300);
    const plan = planRepay(p, 1.3);
    const after = afterRepay(p, plan.repayBase);
    expect(after.debtBase).toBeLessThan(p.debtBase);
    expect(toUsd(after.debtBase)).toBeCloseTo(300 - plan.toUsd, 0);
    // and the position is now SAFE again
    expect(hf(healthFactorOf(after))).toBeGreaterThanOrEqual(1.29);
  });
});
