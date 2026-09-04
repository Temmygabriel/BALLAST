/**
 * Settings. `DEFAULTS` are the numbers used in offline/sim mode so nothing is
 * required to get going. Live mode reads real values from the environment.
 */

export const DEFAULTS = {
  warnHF: 1.15,
  actHF: 1.05,
  targetHF: 1.3,
  pollMs: 12000,
  chainId: '11155111',
  debtAssetDecimals: 6,
} as const;

export interface RiskConfig {
  warnHF: number;
  actHF: number;
  targetHF: number;
  /**
   * Hard cap on a single repay, in RAW debt-asset units
   * (e.g. USDC with 6 decimals: 1 token = 1_000_000).
   */
  maxUnits: bigint;
}

export interface LiveConfig {
  rpcUrl: string;
  chainId: string;
  aavePool: string;
  debtAsset: string;
  debtAssetDecimals: number;
  protectedWallet: string;
  keeperhubMcpUrl?: string;
  keeperhubApiKey?: string;
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
  pollMs: number;
}

export function defaultsRisk(maxUsd = 1000, decimals = 6): RiskConfig {
  return {
    warnHF: DEFAULTS.warnHF,
    actHF: DEFAULTS.actHF,
    targetHF: DEFAULTS.targetHF,
    // "1000 max" means 1000 whole tokens → 1000 × 10^decimals raw units.
    maxUnits: BigInt(maxUsd) * 10n ** BigInt(decimals),
  };
}

/** Reads .env for live mode. Throws a clear message if something vital is missing. */
export function loadLiveConfig(): LiveConfig {
  const need = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`[config] missing ${k} — copy guardian/.env.example to guardian/.env`);
    return v;
  };
  return {
    rpcUrl: need('RPC_URL'),
    chainId: need('CHAIN_ID'),
    aavePool: need('AAVE_POOL'),
    debtAsset: need('DEBT_ASSET'),
    debtAssetDecimals: Number(process.env.DEBT_ASSET_DECIMALS ?? DEFAULTS.debtAssetDecimals),
    protectedWallet: need('PROTECTED_WALLET'),
    keeperhubMcpUrl: process.env.KEEPERHUB_MCP_URL,
    keeperhubApiKey: process.env.KEEPERHUB_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL,
    deepseekModel: process.env.DEEPSEEK_MODEL,
    pollMs: Number(process.env.POLL_MS ?? DEFAULTS.pollMs),
  };
}
