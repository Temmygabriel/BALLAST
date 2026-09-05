/**
 * Cloud live service — the on-demand twin of the CLI's always-on live monitor.
 *
 * The CLI (`npm run live`) polls a real Aave position forever. Serverless can't run
 * forever, so this service answers on demand:
 *   - getState()  → returns the REAL position each call, throttling fresh RPC reads
 *                   to POLL_MS so a polling client never hammers the node.
 *   - rescueNow() → runs the EXACT money path a monitor tick would (policy → analyst
 *                   → guard → dry-run → TOCTOU re-read → execute → verify) under an
 *                   explicit operator command.
 *
 * Honesty, kept deliberately:
 *   - There is NO hidden automatic cloud trigger here. A real auto-rescue needs the
 *     TriggerGate's TWO-BLOCK confirmation over an ALWAYS-ON watcher; this service is
 *     on-demand, so none of that is fabricated. The gated /rescue endpoint is a human
 *     pressing a button (or calling an endpoint) with fresh eyes.
 *   - rescueNow still refuses a healthy position, still dry-runs every call, still
 *     re-reads the chain right before each broadcast (TOCTOU) and verifies the health
 *     factor moved afterwards. Only the flash-loan TWO-BLOCK rule is relaxed — and only
 *     for this explicit human command, never for an automated tick.
 */
import { liveAaveSource } from './aave';
import { makeAnalyst } from './composer';
import { loadLiveConfig, type LiveConfig } from './config';
import { pickKeeper } from './keeperhub';
import { attemptRescue } from './rescue';
import { initialState, patch, snapshotOf, statusOfHealthFactor, withLog } from './state';
import type { InstrumentState, KeeperHub, Position, RescueOutcome, Thresholds } from './types';

const num = (v: string | undefined, dflt: number) => (v === undefined ? dflt : Number(v));

function envThresholds(): Thresholds {
  return {
    warnHF: num(process.env.WARN_HF, 1.15),
    actHF: num(process.env.ACT_HF, 1.05),
    targetHF: num(process.env.TARGET_HF, 1.3),
  };
}

/** True when the live chain-read env is present (RPC + pool + asset + wallet). */
export function liveArmed(): boolean {
  return Boolean(
    process.env.RPC_URL &&
      process.env.CHAIN_ID &&
      process.env.AAVE_POOL &&
      process.env.DEBT_ASSET &&
      process.env.PROTECTED_WALLET,
  );
}

/** The live config, or null when not armed (caller falls back to the sim engine). */
export function liveCfgFromEnv(): LiveConfig | null {
  if (!liveArmed()) return null;
  return loadLiveConfig();
}

/** True when the money path is safe to arm: live chain AND KeeperHub creds AND an operator key. */
export function rescueArmed(): boolean {
  return (
    liveArmed() &&
    Boolean(
      process.env.KEEPERHUB_MCP_URL && process.env.KEEPERHUB_API_KEY && process.env.BALLAST_LIVE_KEY,
    )
  );
}

/** A JSON-safe slice of a RescueOutcome (no bigints — the wire shape for /rescue). */
export interface RescueReply {
  landed: boolean;
  status: InstrumentState['status'];
  reason?: string;
  txHash?: string;
  auditUrl?: string;
  rationale?: string;
  verification?: RescueOutcome['verification'];
}

export function publicOutcome(o: RescueOutcome): RescueReply {
  return {
    landed: o.landed,
    status: o.status,
    reason: o.reason,
    txHash: o.txHash,
    auditUrl: o.auditUrl,
    rationale: o.rationale,
    verification: o.verification,
  };
}

export class LiveService {
  private readonly cfg: LiveConfig;
  private readonly source;
  private readonly keeper: KeeperHub;
  private readonly analyst;
  private readonly thresholds: Thresholds;
  private readonly maxUnits: bigint;
  private state: InstrumentState | null = null;
  private lastRead = 0;
  private syncing: Promise<InstrumentState> | null = null;
  private readonly subs = new Set<(s: InstrumentState) => void>();

  constructor(cfg: LiveConfig) {
    this.cfg = cfg;
    this.source = liveAaveSource({
      rpcUrl: cfg.rpcUrl,
      pool: cfg.aavePool,
      user: cfg.protectedWallet,
      decimals: cfg.debtAssetDecimals,
      assetName: process.env.DEBT_ASSET_NAME ?? 'USDC',
      label: `Aave v3 · ${cfg.protectedWallet.slice(0, 6)}`,
    });
    this.thresholds = envThresholds();
    this.maxUnits = BigInt(num(process.env.MAX_REPAY_UNITS, 1000)) * 10n ** BigInt(cfg.debtAssetDecimals);
    this.keeper = pickKeeper(cfg);
    this.analyst = makeAnalyst(cfg);
  }

  subscribe(cb: (s: InstrumentState) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  current(): InstrumentState | null {
    return this.state;
  }

  private publish(s: InstrumentState): void {
    this.state = s;
    for (const cb of this.subs) {
      try {
        cb(s);
      } catch {
        /* a listener broke — don't let it kill the engine */
      }
    }
  }

  private async buildFrom(pos: Position, prev: InstrumentState | null): Promise<InstrumentState> {
    const snap = snapshotOf(pos);
    const status = statusOfHealthFactor(snap.healthFactor, this.thresholds);
    if (!prev) {
      const s = initialState({ position: pos, engineMode: 'live', thresholds: this.thresholds });
      s.conditions = []; // live has no chaos storm — clear the sim rows honestly
      s.status = status;
      s.healthFactor = snap.healthFactor;
      s.collateralUSD = snap.collateralUSD;
      s.debtUSD = snap.debtUSD;
      s.positionLabel = pos.label;
      return s;
    }
    return patch(prev, {
      healthFactor: snap.healthFactor,
      collateralUSD: snap.collateralUSD,
      debtUSD: snap.debtUSD,
      positionLabel: pos.label,
      status,
    });
  }

  /** One fresh chain read → instrument state, published (serialized if already running). */
  async sync(): Promise<InstrumentState> {
    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      const pos = await this.source.getPosition();
      const s = await this.buildFrom(pos, this.state);
      this.lastRead = Date.now();
      this.publish(s);
      return s;
    })().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  /** Latest state, refreshing the chain read at most once per pollMs. */
  async getState(): Promise<InstrumentState> {
    if (this.state && Date.now() - this.lastRead < this.cfg.pollMs) return this.state;
    return this.sync();
  }

  /** Operator-initiated rescue (human-in-the-loop — see file header for the honesty rules). */
  async rescueNow(): Promise<{ state: InstrumentState; reply: RescueReply }> {
    const pos = await this.source.getPosition();
    const block = await this.source.getBlockNumber?.().catch(() => undefined);
    const health = snapshotOf(pos).healthFactor;

    // Log + surface a reason without lying about the position's own status.
    const note = async (reason: string) => {
      const s0 = await this.sync();
      const s1 = withLog(s0, 'RESCUE', reason);
      const s2 = patch(s1, { rationale: reason });
      this.publish(s2);
      return { state: s2, reply: { landed: false, status: s2.status, reason } };
    };

    if (!(health < this.thresholds.actHF)) {
      return note(
        `position healthy — HF ${health.toFixed(3)} ≥ act line ${this.thresholds.actHF.toFixed(2)} — nothing to rescue`,
      );
    }
    if (!this.cfg.keeperhubMcpUrl || !this.cfg.keeperhubApiKey) {
      return note('KeeperHub creds are not set on this deployment — rescue disarmed');
    }

    // Episode anchored to this wallet + this block. A deliberate operator command may
    // start on one fresh low read; every downstream safety still runs.
    const episodeId = `ballast-${this.cfg.protectedWallet.slice(0, 6)}-${block ?? 'op'}`;

    const outcome = await attemptRescue({
      position: pos,
      thresholds: this.thresholds,
      allowedAssets: [this.cfg.debtAsset],
      maxUnits: this.maxUnits,
      targetHF: this.thresholds.targetHF,
      network: this.cfg.chainId,
      pool: this.cfg.aavePool,
      user: this.cfg.protectedWallet,
      debtAsset: this.cfg.debtAsset,
      keeper: this.keeper,
      analyst: this.analyst,
      episodeId,
      revalidate: () => this.source.getPosition(),
    });

    const reply = publicOutcome(outcome);
    const base = await this.sync(); // current chain state, for an honest log/HF baseline

    if (outcome.landed && outcome.finalPosition) {
      const fin = snapshotOf(outcome.finalPosition);
      const noteText = outcome.verification?.note ?? 'tx confirmed';
      const s1 = withLog(base, 'RESCUED', `${noteText}${outcome.txHash ? ' · ' + outcome.txHash : ''}`);
      const s2 = patch(s1, {
        mode: 'rescue',
        status: 'RESCUED',
        healthFactor: fin.healthFactor,
        collateralUSD: fin.collateralUSD,
        debtUSD: fin.debtUSD,
        rationale: outcome.rationale,
        lastTx: outcome.txHash
          ? { hash: outcome.txHash, auditUrl: outcome.auditUrl, at: new Date().toISOString() }
          : undefined,
      });
      this.publish(s2);
      return { state: s2, reply };
    }

    // Didn't land. FOUNDERED means a broadcast genuinely failed; STEADY is a safe
    // refusal (dry-run blocked / guard rejected / position moved) — the gauge keeps
    // showing the position's real status, with the why on the plate.
    const failed = outcome.status === 'FOUNDERED';
    const s1 = withLog(base, failed ? 'RESCUE FAILED' : 'STANDING BY', outcome.reason ?? '');
    const s2 = patch(s1, {
      status: failed ? 'FOUNDERED' : s1.status,
      rationale: outcome.reason,
    });
    this.publish(s2);
    return { state: s2, reply };
  }
}
