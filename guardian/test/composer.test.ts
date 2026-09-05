import { describe, expect, it } from 'vitest';
import { deterministicAnalyst, validateAnalystReply, type RiskContext } from '../src/composer';

/**
 * An analyst (the LLM included) is treated as HOSTILE (hardening §P1-8): its reply
 * must survive strict schema validation before anything else reads it, and the
 * rationale is display-only — it can never change what moves money.
 */
const ctx: RiskContext = {
  healthFactor: 1.029,
  totalDebtBase: '30000000000',
  totalCollateralBase: '38600000000',
  suggestedUnits: '7000000', // the policy's safe cap
  debtAsset: '0x00000000000000000000000000000000000000aa',
  debtAssetName: 'USDC',
};

const clean = {
  rationale: 'Health factor 1.029 is below the action threshold.',
  amountUnits: '6500000', // within the suggestion
  debtAsset: ctx.debtAsset,
};

describe('validateAnalystReply (hostile-LLM defence)', () => {
  it('accepts a well-formed reply and returns it unchanged', () => {
    expect(validateAnalystReply(clean, ctx)).toEqual(clean);
  });

  it('rejects anything that is not a plain object', () => {
    for (const bad of [null, 'x', 42, true, ['a'], undefined]) {
      expect(() => validateAnalystReply(bad, ctx)).toThrow(/not an object/);
    }
  });

  it('rejects unexpected extra fields (schema is closed, not permissive)', () => {
    expect(() =>
      validateAnalystReply({ ...clean, onBehalfOf: ctx.debtAsset, price: 999 }, ctx),
    ).toThrow(/unexpected field "onBehalfOf"/);
  });

  it('rejects an amount ABOVE the policy suggestion', () => {
    expect(() => validateAnalystReply({ ...clean, amountUnits: '9000000' }, ctx)).toThrow(
      /exceeds the policy suggestion/,
    );
  });

  it('rejects a non-integer / non-digit amount', () => {
    expect(() => validateAnalystReply({ ...clean, amountUnits: '6.5' }, ctx)).toThrow(
      /non-negative integer string/,
    );
    expect(() => validateAnalystReply({ ...clean, amountUnits: 'abc' }, ctx)).toThrow(
      /non-negative integer string/,
    );
  });

  it('rejects a debtAsset that is not an address', () => {
    expect(() => validateAnalystReply({ ...clean, debtAsset: 'USDC' }, ctx)).toThrow(/must be an address/);
  });

  it('rejects an empty or absurdly long rationale', () => {
    expect(() => validateAnalystReply({ ...clean, rationale: '   ' }, ctx)).toThrow(/missing a rationale/);
    expect(() =>
      validateAnalystReply({ ...clean, rationale: 'x'.repeat(2001) }, ctx),
    ).toThrow(/too long/);
  });

  it('the deterministic analyst always emits a reply that passes its own validation', async () => {
    const reply = await deterministicAnalyst().propose(ctx);
    expect(() => validateAnalystReply(reply, ctx)).not.toThrow();
    expect(reply.amountUnits).toBe(ctx.suggestedUnits);
  });
});
