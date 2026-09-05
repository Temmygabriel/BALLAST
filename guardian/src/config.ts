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
  /**
   * Dashboard pastes often drag in a trailing `  # comment` or stray whitespace —
   * a real footgun that silently breaks a call. Strip comments/space, and force
   * ADDRESSES to lowercase: the all-lowercase form passes every parser, so a wrongly
   * checksummed mixed-case paste can never bite again.
   */
  const val = (k: string): string => need(k).replace(/\s+#.*$/, '').trim();
  const addr = (k: string): string => val(k).toLowerCase();
  const decRaw = (process.env.DEBT_ASSET_DECIMALS ?? String(DEFAULTS.debtAssetDecimals)).replace(/\s+#.*$/, '').trim();
  const dec = Number(decRaw);
  const pollRaw = (process.env.POLL_MS ?? String(DEFAULTS.pollMs)).replace(/\s+#.*$/, '').trim();
  const poll = Number(pollRaw);
  return {
    rpcUrl: val('RPC_URL'),
    chainId: val('CHAIN_ID'),
    aavePool: addr('AAVE_POOL'),
    debtAsset: addr('DEBT_ASSET'),
    debtAssetDecimals: Number.isFinite(dec) ? dec : DEFAULTS.debtAssetDecimals,
    protectedWallet: addr('PROTECTED_WALLET'),
    keeperhubMcpUrl: process.env.KEEPERHUB_MCP_URL,
    keeperhubApiKey: process.env.KEEPERHUB_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL,
    deepseekModel: process.env.DEEPSEEK_MODEL,
    pollMs: Number.isFinite(poll) ? poll : DEFAULTS.pollMs,
  };
}
