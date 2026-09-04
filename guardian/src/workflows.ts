/**
 * Turn a decision into KeeperHub work.
 *
 * KeeperHub has generic web3 nodes — we don't need an "Aave plugin". We compose
 * the raw Aave calls (approve the pool, then repay) and KeeperHub executes them
 * reliably. This file only builds JSON/call shapes; it never talks to KeeperHub.
 */
import type { ContractCall } from './types';

export interface RepayParams {
  network: string; // chain id as a string
  pool: string; // Aave v3 Pool address
  debtAsset: string;
  /** amount in debt-asset token units (already clamped by the guard) */
  amountUnits: bigint;
  onBehalfOf: string;
  rateMode?: 1 | 2; // 1 stable, 2 variable (default)
}

/** Direct calls (approve → repay). Used for the live demo rescue. */
export function buildRepayCalls(o: RepayParams): ContractCall[] {
  const amt = o.amountUnits.toString();
  return [
    {
      network: o.network,
      contractAddress: o.debtAsset,
      abiFunction: 'approve(address,uint256)',
      args: [o.pool, amt],
    },
    {
      network: o.network,
      contractAddress: o.pool,
      abiFunction: 'repay(address,uint256,uint256,address)',
      args: [o.debtAsset, amt, String(o.rateMode ?? 2), o.onBehalfOf],
    },
  ];
}

/* ── Optional: a self-running KeeperHub workflow graph (the "scheduled guardian") ── */

interface WfNode {
  id: string;
  type: string;
  data: { label: string; description: string; type: string; config: Record<string, unknown>; status: string };
}
interface WfEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface GuardianWorkflow {
  name: string;
  description: string;
  enabled: boolean;
  nodes: WfNode[];
  edges: WfEdge[];
}

export function buildGuardianWorkflow(o: {
  network: string;
  pool: string;
  user: string;
  debtAsset: string;
  amountUnits: bigint;
  actHF1e18: string;
}): GuardianWorkflow {
  const n = (id: string, type: string, config: Record<string, unknown>, label: string): WfNode => ({
    id,
    type,
    data: { label, description: label, type, config, status: 'idle' },
  });
  const amt = o.amountUnits.toString();

  return {
    name: `ballast-guardian-${o.user.slice(0, 8)}`,
    description: 'Repay an Aave v3 position when its health factor drops below the threshold',
    enabled: true,
    nodes: [
      n('trigger-1', 'trigger', { triggerType: 'Block', network: o.network }, 'Every N blocks'),
      n(
        'read-hf',
        'action',
        {
          actionType: 'web3/read-contract',
          network: o.network,
          contractAddress: o.pool,
          abiFunction: 'getUserAccountData',
          functionArgs: [o.user],
        },
        'Read health factor',
      ),
      n(
        'cond-1',
        'condition',
        { left: '{{read-hf.healthFactor}}', operator: 'lt', right: o.actHF1e18 },
        'HF < actHF ?',
      ),
      n(
        'approve',
        'action',
        {
          actionType: 'web3/write-contract',
          network: o.network,
          contractAddress: o.debtAsset,
          abiFunction: 'approve',
          functionArgs: [o.pool, amt],
        },
        'Approve pool',
      ),
      n(
        'repay',
        'action',
        {
          actionType: 'web3/write-contract',
          network: o.network,
          contractAddress: o.pool,
          abiFunction: 'repay',
          functionArgs: [o.debtAsset, amt, '2', o.user],
        },
        'Repay debt',
      ),
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'read-hf' },
      { id: 'e2', source: 'read-hf', target: 'cond-1' },
      { id: 'e3', source: 'cond-1', target: 'approve', sourceHandle: 'true' },
      { id: 'e4', source: 'approve', target: 'repay' },
    ],
  };
}
