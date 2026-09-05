/**
 * Reading a live Aave v3 position, plus the health-factor math.
 *
 * Health factor is Aave's "how close am I to being liquidated" number:
 *   HF = (value of your collateral × the liquidation threshold) / (your debt)
 *   HF ≥ 1   → fine
 *   HF < 1   → liquidatable (anyone can now seize your collateral at a discount)
 * A crash lowers the collateral's value, so HF drops. The guardian acts before it hits ~1.
 */
import type { PublicClient } from 'viem';
import type { Position, PositionSource } from './types';

// viem (the RPC client) is imported lazily inside liveAaveSource so the offline
// sim path and the cloud demo never pull the whole library into their bundle.
type Viem = typeof import('viem');
let viemPromise: Promise<Viem> | null = null;
const loadViem = () => (viemPromise ??= import('viem'));

export const poolAbi = [
  {
    type: 'function',
    name: 'getUserAccountData',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' }, // basis points (1e4)
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' }, // 1e18-scaled; <1e18 = liquidatable
    ],
  },
] as const;

const WAD = 10n ** 18n; // 1e18 — HF is scaled by this

/** Turns a bigint HF (1e18) into a normal number. */
export const hf = (x: bigint) => Number(x) / 1e18;

/**
 * Compute the health factor from the pieces Aave exposes.
 * HF = (collateralBase * liqThresholdBps) / (debtBase * 1e4), kept at 1e18 scale.
 */
export function healthFactorOf(p: Position): bigint {
  if (p.debtBase <= 0n) return 10n ** 27n; // no debt → effectively infinite/safe
  const scaled = (p.collateralBase * p.liqThresholdBps * WAD) / (p.debtBase * 10_000n);
  return scaled;
}

/** Aave base units (8-decimal USD) → a human "$1,234.56" number. */
export const toUsd = (base: bigint) => Number(base) / 1e8;

/** Build a live Aave reader for one RPC + pool. */
export function liveAaveSource(opts: {
  rpcUrl: string;
  pool: string;
  user: string;
  decimals: number;
  assetName: string;
  label?: string;
}): PositionSource {
  let client: PublicClient | null = null;
  const ensure = async () => {
    if (!client) {
      const { createPublicClient, http } = await loadViem();
      client = createPublicClient({ transport: http(opts.rpcUrl) });
    }
    return client;
  };
  return {
    async getPosition(): Promise<Position> {
      const c = await ensure();
      const r = await c.readContract({
        address: opts.pool as `0x${string}`,
        abi: poolAbi,
        functionName: 'getUserAccountData',
        args: [opts.user as `0x${string}`],
      });
      return {
        label: opts.label ?? `Aave v3 · ${opts.user.slice(0, 6)}`,
        collateralBase: r[0],
        debtBase: r[1],
        liqThresholdBps: r[3],
        decimals: opts.decimals,
        debtAssetName: opts.assetName,
      };
    },
    async getBlockNumber(): Promise<number> {
      const c = await ensure();
      return Number(await c.getBlockNumber());
    },
  };
}
