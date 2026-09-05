/**
 * LIVE monitor — the real guardian when creds + a funded wallet exist.
 *
 * Polls Aave for the protected position. Low health-factor readings go through the
 * SAME TriggerGate the simulator uses, so the rules hold identically in live mode:
 * one reading is never enough — the position must be low on TWO observations at
 * DIFFERENT blocks (flash-loan guard), unless it crosses the explicit EMERGENCY_HF
 * edge, which acts immediately. Once confirmed, the episode id anchors every retry
 * so KeeperHub idempotency keys stay stable until the position is healthy again.
 *
 * Emits instrument states onto the bus like the sim does.
 */
import { healthFactorOf, hf, liveAaveSource } from './aave';
import { makeAnalyst } from './composer';
import type { LiveConfig } from './config';
import { pickKeeper } from './keeperhub';
import { attemptRescue } from './rescue';
import { initialState, patch, snapshotOf, statusOfHealthFactor } from './state';
import { TriggerGate } from './trigger';
import type { InstrumentState, Thresholds } from './types';

const num = (v: string | undefined, dflt: number) => (v === undefined ? dflt : Number(v));

function envThresholds(): Thresholds {
  return {
    warnHF: num(process.env.WARN_HF, 1.15),
    actHF: num(process.env.ACT_HF, 1.05),
    targetHF: num(process.env.TARGET_HF, 1.3),
  };
}

/** Safety valve: how many times one episode may attempt a rescue before standing by. */
const MAX_EPISODE_TRIES = 5;

export function startLiveMonitor(bus: { publish: (s: InstrumentState) => void }, cfg: LiveConfig): () => void {
  const thresholds = envThresholds();
  const source = liveAaveSource({
    rpcUrl: cfg.rpcUrl,
    pool: cfg.aavePool,
    user: cfg.protectedWallet,
    decimals: cfg.debtAssetDecimals,
    assetName: cfg.debtAsset,
    label: `Aave v3 · ${cfg.protectedWallet.slice(0, 8)}`,
  });
  const keeper = pickKeeper(cfg);
  const analyst = makeAnalyst(cfg);
  // MAX_REPAY_UNITS is "max whole tokens in one rescue" (e.g. 1000 USDC),
  // so scale to raw token units using the debt asset's decimals.
  const maxUnits = BigInt(num(process.env.MAX_REPAY_UNITS, 1000)) * 10n ** BigInt(cfg.debtAssetDecimals);

  // The confirmation gate + episode identity (same class the simulator uses).
  const gate = new TriggerGate({
    thresholds,
    emergencyHF: num(process.env.EMERGENCY_HF, 1.01),
    user: cfg.protectedWallet,
  });

  let state: InstrumentState | null = null;
  let busy = false;
  let running = true;
  let triesFor: string | null = null; // which episode the try-count belongs to
  let tries = 0;

  const tick = async () => {
    if (busy || !running) return;
    busy = true;
    try {
      const pos = await source.getPosition();
      const block = await source.getBlockNumber?.().catch(() => undefined);

      if (!state) {
        state = initialState({ position: pos, engineMode: 'live' });
        bus.publish(state);
        return;
      }

      const snap = snapshotOf(pos);
      const status = statusOfHealthFactor(snap.healthFactor, thresholds);
      let next: InstrumentState = patch(state, {
        healthFactor: snap.healthFactor,
        collateralUSD: snap.collateralUSD,
        debtUSD: snap.debtUSD,
        positionLabel: pos.label,
        status,
      });

      const decision = gate.observe(snap.healthFactor, block);
      if (decision.action === 'rescue') {
        // Bound retries per episode so a genuinely stuck position can't spin forever.
        if (triesFor === decision.episodeId && tries >= MAX_EPISODE_TRIES) {
          console.log(`[live] episode ${decision.episodeId} tried ${tries}× without landing — standing by`);
        } else {
          if (triesFor !== decision.episodeId) {
            triesFor = decision.episodeId;
            tries = 0;
          }
          tries++;

          const how = decision.reason === 'emergency' ? 'EMERGENCY edge' : 'two-block confirmation';
          console.log(`[live] HF ${snap.healthFactor.toFixed(3)} < ${thresholds.actHF} · ${how} — rescuing (episode ${decision.episodeId})`);

          const out = await attemptRescue({
            position: pos,
            thresholds,
            allowedAssets: [cfg.debtAsset],
            maxUnits,
            targetHF: thresholds.targetHF,
            network: cfg.chainId,
            pool: cfg.aavePool,
            user: cfg.protectedWallet,
            debtAsset: cfg.debtAsset,
            keeper,
            analyst,
            episodeId: decision.episodeId,
            // TOCTOU re-read + post-execution verification read the live chain.
            revalidate: () => source.getPosition(),
          });

          if (out.landed && out.finalPosition) {
            const fin = snapshotOf(out.finalPosition);
            next = patch(next, {
              mode: 'rescue',
              status: 'RESCUED',
              healthFactor: hf(healthFactorOf(out.finalPosition)),
              collateralUSD: fin.collateralUSD,
              debtUSD: fin.debtUSD,
              rationale: out.rationale,
              lastTx: out.txHash
                ? { hash: out.txHash, auditUrl: out.auditUrl, at: new Date().toISOString() }
                : undefined,
            });
            console.log(`[live] RESCUED tx=${out.txHash}`);
            if (out.verification && !out.verification.improved) {
              console.log(`[live] ⚠ FLAG ${out.verification.note}`);
            }
            triesFor = null;
            tries = 0;
          } else {
            next = patch(next, { status: 'FOUNDERED', rationale: out.reason });
            console.log(`[live] rescue did not land: ${out.reason}`);
          }
        }
      }
      state = next;
      bus.publish(state);
    } catch (e) {
      console.error('[live] monitor tick failed', (e as Error).message);
    } finally {
      busy = false;
    }
  };

  const id = setInterval(tick, cfg.pollMs);
  void tick(); // run once immediately

  return () => {
    running = false;
    clearInterval(id);
  };
}
