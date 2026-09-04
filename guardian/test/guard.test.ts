import { describe, expect, it } from 'vitest';
import { defaultsRisk } from '../src/config';
import { guard } from '../src/guard';

const USDC = '0x0A0b00c0dEadBeeF00CaFe000BEEf000000000001';
const OTHER = '0x0000000000000000000000000000000000000002';
// A $1,000 cap on a 6-decimals token = 1,000 × 10^6 raw units.
const cfg = { allowedAssets: [USDC], maxUnits: 1_000_000_000n };

describe('the policy guard', () => {
  it('lets a whitelisted, in-budget proposal through unchanged', () => {
    const out = guard({ debtAsset: USDC, amountUnits: 500_000_000n }, cfg);
    expect(out.amountUnits).toBe(500_000_000n);
  });

  it('clamps an over-budget proposal down to the cap', () => {
    const out = guard({ debtAsset: USDC, amountUnits: 2_000_000_000n }, cfg);
    expect(out.amountUnits).toBe(cfg.maxUnits);
  });

  it('rejects a non-whitelisted asset outright', () => {
    expect(() => guard({ debtAsset: OTHER, amountUnits: 100n }, cfg)).toThrow(/not whitelisted/);
  });

  it('rejects a non-positive amount', () => {
    expect(() => guard({ debtAsset: USDC, amountUnits: 0n }, cfg)).toThrow(/non-positive/);
  });

  it('is case-insensitive about the whitelist', () => {
    const out = guard({ debtAsset: USDC.toUpperCase(), amountUnits: 100n }, cfg);
    expect(out.amountUnits).toBe(100n);
  });

  it('defaultsRisk turns "$1000 whole tokens" into raw units', () => {
    expect(defaultsRisk(1000, 6).maxUnits).toBe(1_000_000_000n);
  });
});
