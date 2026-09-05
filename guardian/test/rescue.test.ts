import { describe, expect, it } from 'vitest';
import { deterministicAnalyst, type Analyst } from '../src/composer';
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
  episodeId: 'test-episode',
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

describe('attemptRescue — hardening behaviours (TOCTOU, post-exec, routing, hostile LLM)', () => {
  it('ABORTS before broadcasting if the position recovered while we were simulating (TOCTOU)', async () => {
    // By the time the dry-run finished, the price came back and the position is
    // healthy (HF ≥ actHF). Acting on the stale simulation would over-repay / not
    // be needed — so the guardian must stop, having broadcast NOTHING.
    const healthy = pos(500, 300); // HF ≈ 1.33 ≥ 1.05
    const keeper = new MockKeeperHub();
    const out = await attemptRescue({
      ...baseDeps,
      ...caps,
      keeper,
      revalidate: async () => healthy,
    });

    expect(out.landed).toBe(false);
    expect(out.status).toBe('STEADY'); // refused cleanly, never FOUNDERED
    expect(out.reason).toContain('aborted before broadcast');
    expect(out.trail!.some((l) => l.includes('re-validation before approve'))).toBe(true);
    expect(out.trail!.some((l) => l.includes('executed'))).toBe(false); // nothing broadcast
  });

  it('FLAGS a confirmed tx that did not actually improve the position (§P0-4)', async () => {
    // The mock chain reports the tx landed, but a live re-read shows the position
    // did NOT improve. That must be surfaced loudly, never silently accepted.
    const stuck = baseDeps.position; // revalidate keeps returning the same low position
    const out = await attemptRescue({
      ...baseDeps,
      ...caps,
      keeper: new MockKeeperHub(),
      revalidate: async () => stuck,
    });

    expect(out.landed).toBe(true); // the receipt said success…
    expect(out.status).toBe('RESCUED');
    expect(out.verification?.improved).toBe(false); // …but the position didn't move
    expect(out.verification?.note).toContain('⚠');
  });

  it('fails CLOSED when an action REQUIRES private routing the chain cannot provide', async () => {
    const out = await attemptRescue({
      ...baseDeps,
      ...caps,
      keeper: new MockKeeperHub(), // no private routing available
      requiresPrivate: true,
    });

    expect(out.landed).toBe(false);
    expect(out.status).toBe('STEADY'); // holding, not FOUNDERED — refusing to run unprotected
    expect(out.reason).toContain('private routing unavailable');
    expect(out.trail!.some((l) => l.includes('executed'))).toBe(false);
  });

  it('proceeds on the standard (public) path when privacy is not required', async () => {
    const out = await attemptRescue({
      ...baseDeps,
      ...caps,
      keeper: new MockKeeperHub(),
      requiresPrivate: false,
    });
    expect(out.landed).toBe(true);
    expect(out.trail!.join('\n')).toContain('routing: standard (public) execution');
  });

  it('falls back to the deterministic plan when the analyst proposes an unsafe amount', async () => {
    // A hostile/degenerate analyst asks to repay far more than policy allows. The
    // schema validation rejects it and the deterministic plan carries the rescue —
    // a bad LLM reply can never stall a rescue NOR push an unsafe amount through.
    const hostile: Analyst = {
      kind: 'deepseek',
      propose: async () => ({
        rationale: 'trust me, overpay to be safe',
        amountUnits: '999999999999999', // ≫ policy suggestion
        debtAsset: USDC,
      }),
    };
    const out = await attemptRescue({ ...baseDeps, ...caps, keeper: new MockKeeperHub(), analyst: hostile });

    expect(out.landed).toBe(true); // deterministic plan rescued instead
    expect(out.trail!.some((l) => l.includes('analyst rejected'))).toBe(true);
    expect(out.rationale).toContain('Health factor'); // deterministic wording, not the hostile text
  });
});
