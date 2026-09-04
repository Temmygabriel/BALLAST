import { describe, expect, it } from 'vitest';
import { deterministicAnalyst } from '../src/composer';
import { MockKeeperHub } from '../src/keeperhub';
import { attemptRescue } from '../src/rescue';
import type { Position } from '../src/types';

const USDC = '0x0A0b00c0dEadBeeF00CaFe000BEEf000000000001';
const POOL = '0xPool000000000000000000000000000000000001';
const USER = '0xUser000000000000000000000000000000000001';
const caps = { maxUnits: 1_000_000_000n }; // $1,000 of 6-dec token

function pos(collateralUSD: number, debtUSD: number): Position {
  return {
    label: 'test',
    collateralBase: BigInt(Math.round(collateralUSD * 1e8)),
    debtBase: BigInt(Math.round(debtUSD * 1e8)),
    liqThresholdBps: 8000n,
    decimals: 6,
    debtAssetName: 'USDC',
  };
}

const baseDeps = {
  position: pos(386, 300), // HF ≈ 1.03 → needs rescuing
  thresholds: { warnHF: 1.15, actHF: 1.05, targetHF: 1.3 },
  allowedAssets: [USDC],
  targetHF: 1.3,
  network: '11155111',
  pool: POOL,
  user: USER,
  debtAsset: USDC,
  analyst: deterministicAnalyst(),
};

describe('attemptRescue (the money path)', () => {
  it('lands a rescue and returns the repaired position', async () => {
    const out = await attemptRescue({ ...baseDeps, ...caps, keeper: new MockKeeperHub() });

    expect(out.ok).toBe(true);
    expect(out.landed).toBe(true);
    expect(out.status).toBe('RESCUED');
    expect(out.txHash).toBeTruthy();
    expect(out.auditUrl).toContain('mock.keeperhub.local/audit/');
    expect(out.repaidUnits).toBeGreaterThan(0n);
    expect(out.finalPosition).toBeDefined();
    // Debt went down and HF climbed back toward the target.
    expect(out.finalPosition!.debtBase).toBeLessThan(baseDeps.position.debtBase);
    expect(out.trail!.join('\n')).toContain('landed');
  });

  it('dry-run BLOCKS a bad repay before anything is broadcast', async () => {
    // The mock "chain" refuses any repay (as if the wallet were empty).
    const keeper = new MockKeeperHub({
      wouldRevert: (call) => call.abiFunction.startsWith('repay'),
      onStep: () => {},
    });
    const out = await attemptRescue({ ...baseDeps, ...caps, keeper });

    // Refusing to broadcast an unsafe call is the SAFE outcome — no rescue "landed",
    // nothing bad hit the chain, and the guardian reports it honestly.
    expect(out.landed).toBe(false);
    expect(out.trail!.some((l) => l.includes('dry-run BLOCKED repay'))).toBe(true);
    expect(out.trail!.some((l) => l.includes('executed repay'))).toBe(false);
  });

  it('falls back to the deterministic analyst and still lands if the guard is happy', async () => {
    const out = await attemptRescue({ ...baseDeps, ...caps, keeper: new MockKeeperHub() });
    expect(out.landed).toBe(true);
    expect(out.rationale).toContain('Health factor 1.029');
  });

  it('refuses to move money when the guard rejects the proposal', async () => {
    // No whitelisted asset → the guard must refuse.
    const out = await attemptRescue({
      ...baseDeps,
      ...caps,
      allowedAssets: [],
      keeper: new MockKeeperHub(),
    });
    expect(out.landed).toBe(false);
    expect(out.reason).toContain('guard rejected proposal');
  });
});
