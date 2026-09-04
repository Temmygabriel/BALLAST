/**
 * LIVE monitor — the real guardian when creds + a funded wallet exist.
 *
 * Polls Aave for the protected position. When the health factor drops under the
 * action threshold it runs the exact same rescue flow as the simulator, but with
 * a REAL KeeperHub client. Emits instrument states onto the bus like the sim does.
 */
import { healthFactorOf, hf, liveAaveSource } from './aave';
import { makeAnalyst } from './composer';
import type { LiveConfig } from './config';
import { pickKeeper } from './keeperhub';
import { attemptRescue } from './rescue';
import { initialState, patch, snapshotOf, statusOfHealthFactor } from './state';
import type { InstrumentState, Thresholds } from './types';

const num = (v: string | undefined, dflt: number) => (v === undefined ? dflt : Number(v));

function envThresholds(): Thresholds {
  return {
    warnHF: num(process.env.WARN_HF, 1.15),
    actHF: num(process.env.ACT_HF, 1.05),
    targetHF: num(process.env.TARGET_HF, 1.3),
  };
}

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

  let state: InstrumentState | null = null;
  let busy = false;
  let running = true;

  const tick = async () => {
    if (busy || !running) return;
    busy = true;
    try {
      const pos = await source.getPosition();

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

      if (snap.healthFactor < thresholds.actHF) {
        console.log(`[live] HF ${snap.healthFactor.toFixed(3)} < ${thresholds.actHF} — rescuing`);
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
        } else {
          next = patch(next, { status: 'FOUNDERED', rationale: out.reason });
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
