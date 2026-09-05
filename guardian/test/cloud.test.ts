import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveArmed, liveCfgFromEnv, publicOutcome, rescueArmed } from '../src/cloud';
import type { RescueOutcome } from '../src/types';

/**
 * The cloud-live surface (guardian/src/cloud.ts) is what makes the DEPLOYED app able
 * to show a real Aave position and run a gated KeeperHub rescue. These tests pin the
 * two safety rails:
 *  - armed()/rescueArmed() gates: reading a position needs chain env; MOVING MONEY
 *    additionally needs KeeperHub creds AND an operator key (BALLAST_LIVE_KEY).
 *  - publicOutcome() must never leak a bigint onto the wire (JSON can't carry them).
 */

const chainEnv = {
  RPC_URL: 'https://rpc.test',
  CHAIN_ID: '11155111',
  AAVE_POOL: '0x0000000000000000000000000000000000000001',
  DEBT_ASSET: '0x0000000000000000000000000000000000000002',
  DEBT_ASSET_DECIMALS: '6',
  PROTECTED_WALLET: '0x0000000000000000000000000000000000000003',
};

const ENV_KEYS = [
  'RPC_URL',
  'CHAIN_ID',
  'AAVE_POOL',
  'DEBT_ASSET',
  'DEBT_ASSET_DECIMALS',
  'PROTECTED_WALLET',
  'KEEPERHUB_MCP_URL',
  'KEEPERHUB_API_KEY',
  'BALLAST_LIVE_KEY',
];

const saved = new Map<string, string | undefined>();
beforeEach(() => {
  for (const k of ENV_KEYS) saved.set(k, process.env[k]);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('cloud-live arming gates', () => {
  it('not armed without chain env', () => {
    expect(liveArmed()).toBe(false);
    expect(liveCfgFromEnv()).toBeNull();
  });

  it('armed when the five chain vars exist', () => {
    Object.assign(process.env, chainEnv);
    expect(liveArmed()).toBe(true);
    const cfg = liveCfgFromEnv();
    expect(cfg?.protectedWallet).toBe(chainEnv.PROTECTED_WALLET);
    expect(cfg?.debtAssetDecimals).toBe(6);
  });

  it('reading never requires the money-path secrets', () => {
    Object.assign(process.env, chainEnv);
    expect(rescueArmed()).toBe(false); // no KeeperHub creds / operator key
  });

  it('rescue arms only with chain + KeeperHub creds + operator key', () => {
    Object.assign(process.env, chainEnv);
    Object.assign(process.env, {
      KEEPERHUB_MCP_URL: 'https://app.keeperhub.com/mcp',
      KEEPERHUB_API_KEY: 'kh_test_123',
    });
    expect(rescueArmed()).toBe(false); // still missing the operator key
    process.env.BALLAST_LIVE_KEY = 'op-secret';
    expect(rescueArmed()).toBe(true);
  });
});

describe('publicOutcome (wire-safe rescue reply)', () => {
  it('strips bigint fields so the JSON route never throws', () => {
    const outcome: RescueOutcome = {
      ok: true,
      landed: true,
      status: 'RESCUED',
      reason: 'rescue tx confirmed',
      txHash: '0xabc',
      auditUrl: 'https://audit/x',
      repaidUnits: 1_000_000n,
      finalPosition: {
        label: 'x',
        collateralBase: 1n,
        debtBase: 1n,
        liqThresholdBps: 1n,
        decimals: 6,
        debtAssetName: 'USDC',
      },
      verification: { improved: true, note: 'verified' },
    };
    const reply = publicOutcome(outcome);
    expect(() => JSON.stringify(reply)).not.toThrow();
    expect(reply.txHash).toBe('0xabc');
    expect(reply.verification?.improved).toBe(true);
    expect((reply as { repaidUnits?: unknown }).repaidUnits).toBeUndefined();
    expect((reply as { finalPosition?: unknown }).finalPosition).toBeUndefined();
  });
});
