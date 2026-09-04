import { describe, expect, it } from 'vitest';
import { buildGuardianWorkflow, buildRepayCalls } from '../src/workflows';

const USDC = '0x0A0b00c0dEadBeeF00CaFe000BEEf000000000001';
const POOL = '0xPool000000000000000000000000000000000001';
const USER = '0xUser000000000000000000000000000000000001';

describe('buildRepayCalls', () => {
  const calls = buildRepayCalls({
    network: '11155111',
    pool: POOL,
    debtAsset: USDC,
    amountUnits: 62_500_000n, // $62.50 of a 6-decimals token
    onBehalfOf: USER,
  });

  it('starts with approve(pool) then repay(asset, amount)', () => {
    expect(calls).toHaveLength(2);
    expect(calls[0]!.abiFunction).toBe('approve(address,uint256)');
    expect(calls[0]!.contractAddress).toBe(USDC);
    expect(calls[0]!.args).toEqual([POOL, '62500000']);

    expect(calls[1]!.abiFunction).toBe('repay(address,uint256,uint256,address)');
    expect(calls[1]!.contractAddress).toBe(POOL);
    expect(calls[1]!.args).toEqual([USDC, '62500000', '2', USER]);
  });

  it('carries the network on every call', () => {
    for (const c of calls) expect(c.network).toBe('11155111');
  });

  it('serializes amounts as decimal strings, never numbers', () => {
    for (const c of calls) {
      expect(typeof c.args![1]).toBe('string');
      expect(c.args![1]).toMatch(/^\d+$/);
    }
  });
});

describe('buildGuardianWorkflow (the self-running keeper graph)', () => {
  const wf = buildGuardianWorkflow({
    network: '8453',
    pool: POOL,
    user: USER,
    debtAsset: USDC,
    amountUnits: 1_000_000n,
    actHF1e18: '1050000000000000000', // 1.05
  });

  it('is a trigger → read → condition → approve → repay graph', () => {
    expect(wf.name).toContain('ballast-guardian');
    expect(wf.nodes.map((n) => n.type)).toEqual(['trigger', 'action', 'condition', 'action', 'action']);
    expect(wf.nodes[2]!.data.config.left).toBe('{{read-hf.healthFactor}}');
    expect(wf.nodes[2]!.data.config.operator).toBe('lt');
    expect(wf.edges.map((e) => `${e.source}->${e.target}`)).toEqual([
      'trigger-1->read-hf',
      'read-hf->cond-1',
      'cond-1->approve',
      'approve->repay',
    ]);
  });
});
