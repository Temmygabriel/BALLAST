/**
 * TriggerGate — decides WHEN a rescue may fire, and gives that rescue a STABLE identity.
 *
 * Security hardening (ballast-security-hardening.md §P0-1, §P1-5):
 *
 *  1. One unhealthy reading is NOT enough to trigger a normal rescue. A position must
 *     be below the action threshold on TWO observations at DIFFERENT blocks. A
 *     single-block price blip (flash-loan manipulation) therefore cannot fire a rescue
 *     — it reverts before a second, later block ever confirms the low reading.
 *
 *  2. Below an explicit EMERGENCY threshold the two-block window is bypassed. Being too
 *     slow at the real edge (health factor critically close to 1.0) is its own risk, so
 *     that threshold is stated here in code, not left implicit.
 *
 *  3. The rescue EPISODE is a stable identity anchored to the block where the unhealthy
 *     state was confirmed. It is reused for every retry of the same episode until the
 *     position is healthy again — that anchor is what KeeperHub's idempotency key hangs
 *     off (see rescue.ts). It changes only when a genuinely new unhealthy episode starts.
 */
import type { Thresholds } from './types';

export type GateReason = 'two-block' | 'emergency';

export type GateAction =
  | { action: 'none'; reason: 'healthy' | 'first-observation' | 'same-block' }
  | { action: 'rescue'; reason: GateReason; episodeId: string };

export interface TriggerGateConfig {
  thresholds: Thresholds;
  /** Below this the confirmation window is skipped (explicit emergency edge). */
  emergencyHF: number;
  /** The protected wallet — used to namespace the episode id. */
  user: string;
}

export class TriggerGate {
  private readonly actHF: number;
  private readonly emergencyHF: number;
  private readonly prefix: string;
  /** Block of the first below-action-threshold observation in the current run. */
  private firstLowBlock: number | null = null;
  private episode: string | null = null;
  private episodeReason: GateReason | null = null;
  /** Fallback counter so blockless episodes still get a unique, stable id. */
  private seq = 0;

  constructor(cfg: TriggerGateConfig) {
    this.actHF = cfg.thresholds.actHF;
    this.emergencyHF = cfg.emergencyHF;
    this.prefix = `ballast-${cfg.user.slice(0, 8)}`;
  }

  /** Forget any in-progress episode (fresh storm / position healthy again). */
  reset(): void {
    this.firstLowBlock = null;
    this.episode = null;
    this.episodeReason = null;
  }

  /**
   * Feed one observation of the health factor (read at `block`). Returns the action
   * the guardian should take: `none` (stand by) or `rescue` (with the episode id).
   * An active episode keeps returning `rescue` for the SAME id every unhealthy
   * observation, so a retried rescue stays idempotent.
   */
  observe(hfNum: number, block?: number): GateAction {
    // Healthy again (at or above the action threshold) ends any episode.
    if (hfNum >= this.actHF) {
      this.reset();
      return { action: 'none', reason: 'healthy' };
    }

    // Already mid-episode and still unhealthy → keep retrying the same episode.
    if (this.episode) {
      return { action: 'rescue', reason: this.episodeReason!, episodeId: this.episode };
    }

    // Emergency edge: act now, no confirmation window.
    if (hfNum < this.emergencyHF) {
      this.episode = this.idFor(block);
      this.episodeReason = 'emergency';
      return { action: 'rescue', reason: 'emergency', episodeId: this.episode };
    }

    // First low observation of a possible episode → remember it, do nothing yet.
    if (this.firstLowBlock === null) {
      this.firstLowBlock = block ?? 0;
      return { action: 'none', reason: 'first-observation' };
    }

    // A second reading on the SAME block is not confirmation (flash-loan window).
    if (block !== undefined && block > 0 && this.firstLowBlock > 0 && block <= this.firstLowBlock) {
      return { action: 'none', reason: 'same-block' };
    }

    // Second observation on a later block → confirmed. Anchor the episode to it.
    this.episode = this.idFor(this.firstLowBlock);
    this.episodeReason = 'two-block';
    return { action: 'rescue', reason: 'two-block', episodeId: this.episode };
  }

  /** Are we currently inside an active rescue episode? */
  get active(): boolean {
    return this.episode !== null;
  }

  /** The active episode id, if any. */
  get episodeId(): string | null {
    return this.episode;
  }

  private idFor(block: number | null | undefined): string {
    if (block !== null && block !== undefined && block > 0) return `${this.prefix}-${block}`;
    return `${this.prefix}-s${++this.seq}`;
  }
}
