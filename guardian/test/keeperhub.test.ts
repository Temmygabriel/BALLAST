import { describe, expect, it } from 'vitest';
import { MockKeeperHub } from '../src/keeperhub';

const call = {
  network: '11155111',
  contractAddress: '0xPool',
  abiFunction: 'repay(address,uint256,uint256,address)',
  args: ['0xUSDC', '62500000', '2', '0xUser'],
};

describe('MockKeeperHub', () => {
  it('dry-runs clean by default', async () => {
    const sim = await new MockKeeperHub().simulate(call);
    expect(sim).toEqual({ success: true, wouldRevert: false });
  });

  it('reports WOULD REVERT when the oracle says so', async () => {
    const sim = await new MockKeeperHub({
      wouldRevert: (c) => c.abiFunction.startsWith('repay'),
    }).simulate(call);
    expect(sim.success).toBe(false);
    expect(sim.wouldRevert).toBe(true);
  });

  it('is idempotent — the same key re-sends the SAME tx, never double-executes', async () => {
    const keeper = new MockKeeperHub();
    const a = await keeper.execute(call, 'ballast-key-1');
    const b = await keeper.execute(call, 'ballast-key-1'); // retry after a timeout
    expect(b.txHash).toBe(a.txHash);
    expect(b.executionId).toBe(a.executionId);
  });

  it('gives every fresh execution its own audit link', async () => {
    const keeper = new MockKeeperHub();
    const a = await keeper.execute(call, 'key-a');
    const b = await keeper.execute(call, 'key-b');
    expect(a.txHash).not.toBe(b.txHash);
    expect(a.auditUrl).toContain('/audit/');
  });
});
