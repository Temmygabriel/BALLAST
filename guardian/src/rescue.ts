/**
 * attemptRescue — the money path, shared by live mode and the simulator.
 *
 * Order is sacred and is the demo's whole point:
 *   1. policy computes a safe repay amount            (deterministic)
 *   2. the analyst PROPOSES (may be an LLM)            (probabilistic)
 *   3. the guard CLAMPS the proposal                  (deterministic — nothing unsafe passes)
 *   4. KeeperHub DRY-RUNS every call                  (nothing bad is broadcast)
 *   5. KeeperHub EXECUTES + we wait for the tx        (real money moves)
 */
import { deterministicAnalyst, makeAnalyst, type Analyst } from './composer';
import { healthFactorOf, hf } from './aave';
import { guard, type Proposal } from './guard';
import { afterRepay, planRepay, tokenUnitsToBase } from './policy';
import { buildRepayCalls } from './workflows';
import type { KeeperHub, Position, RescueOutcome, Thresholds } from './types';

export interface RescueDeps {
  position: Position;
  thresholds: Thresholds;
  /** Already-clamped allowed asset + cap come from here. */
  allowedAssets: string[];
  maxUnits: bigint;
  targetHF: number;
  network: string;
  pool: string;
  user: string; // the wallet on whose behalf we repay
  debtAsset: string; // debt-asset contract address
  keeper: KeeperHub;
  analyst?: Analyst;
  onStep?: (msg: string) => void;
}

export async function attemptRescue(deps: RescueDeps): Promise<RescueOutcome> {
  const trail: string[] = [];
  const step = (m: string) => {
    trail.push(m);
    deps.onStep?.(m);
  };

  const analyst = deps.analyst ?? makeAnalyst();

  // 1. Policy — how much must go down for the position to be safe again?
  const health = hf(healthFactorOf(deps.position));
  const plan = planRepay(deps.position, deps.targetHF);
  step(`health factor ${health.toFixed(3)} — repay plan ≈ $${plan.toUsd.toFixed(2)} (${plan.units.toString()} units)`);

  if (plan.units <= 0n) {
    return { ok: true, landed: false, status: 'STEADY', reason: 'position already above target', trail };
  }

  // 2. Analyst proposes.
  let raw: { rationale: string; amountUnits: string; debtAsset: string };
  try {
    raw = await analyst.propose({
      healthFactor: health,
      totalDebtBase: deps.position.debtBase.toString(),
      totalCollateralBase: deps.position.collateralBase.toString(),
      suggestedUnits: plan.units.toString(),
      debtAsset: deps.debtAsset,
      debtAssetName: deps.position.debtAssetName,
    });
  } catch (e) {
    // If the LLM is unreachable, fall back to the deterministic planner — never stall a rescue.
    step(`analyst unavailable (${(e as Error).message}) — using deterministic plan`);
    raw = await deterministicAnalyst().propose({
      healthFactor: health,
      totalDebtBase: deps.position.debtBase.toString(),
      totalCollateralBase: deps.position.collateralBase.toString(),
      suggestedUnits: plan.units.toString(),
      debtAsset: deps.debtAsset,
      debtAssetName: deps.position.debtAssetName,
    });
  }

  // 3. Guard clamps.
  let safe: Proposal;
  try {
    safe = guard(
      { debtAsset: raw.debtAsset || deps.debtAsset, amountUnits: BigInt(raw.amountUnits || '0') },
      { allowedAssets: deps.allowedAssets, maxUnits: deps.maxUnits },
    );
  } catch (e) {
    step(`guard REJECTED proposal: ${(e as Error).message}`);
    return {
      ok: true, // refusing to broadcast an unsafe call IS the safe behaviour
      landed: false,
      status: 'STEADY',
      reason: `guard rejected proposal: ${(e as Error).message}`,
      trail,
    };
  }
  step(`guard approved ${safe.amountUnits.toString()} units of ${safe.debtAsset}`);

  const repaidBase = tokenUnitsToBase(safe.amountUnits, deps.position.decimals);
  const calls = buildRepayCalls({
    network: deps.network,
    pool: deps.pool,
    debtAsset: deps.debtAsset,
    amountUnits: safe.amountUnits,
    onBehalfOf: deps.user,
  });

  // 4 + 5. Dry-run, then execute, call by call.
  const runId = `ballast-${deps.user.slice(0, 8)}-${Date.now()}`;
  let lastTx: { hash: string; auditUrl?: string } | undefined;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]!;
    const sim = await deps.keeper.simulate(call);
    if (!sim.success || sim.wouldRevert) {
      step(`dry-run BLOCKED ${call.abiFunction} before broadcast (${sim.error ?? 'would revert'})`);
      return {
        ok: true, // nothing bad hit the chain
        landed: false,
        status: 'STEADY',
        reason: `dry-run blocked ${call.abiFunction}: ${sim.error ?? 'would revert'}`,
        repaidUnits: 0n,
        rationale: safe.rationale,
        trail,
      };
    }
    step(`dry-run ok for ${call.abiFunction} — executing`);

    const exec = await deps.keeper.execute(call, `${runId}-${i}`);
    const done = await deps.keeper.waitForTx(exec.executionId);
    if (done.status !== 'completed') {
      step(`${call.abiFunction} FAILED (${done.status}${done.error ? ': ' + done.error : ''})`);
      return {
        ok: false,
        landed: false,
        status: 'FOUNDERED',
        reason: `${call.abiFunction} ${done.status}${done.error ? ': ' + done.error : ''}`,
        repaidUnits: 0n,
        trail,
      };
    }
    step(`${call.abiFunction} landed → ${done.txHash}`);
    lastTx = { hash: done.txHash ?? '', auditUrl: done.auditUrl };
  }

  // All calls landed. Bring the position up to date.
  const newPos = afterRepay(deps.position, repaidBase);
  const newHF = hf(healthFactorOf(newPos));
  step(`repay complete — health factor ${health.toFixed(3)} → ${newHF.toFixed(3)} (target ${deps.targetHF})`);

  return {
    ok: true,
    landed: true,
    status: 'RESCUED',
    reason: 'rescue tx confirmed',
    txHash: lastTx?.hash,
    auditUrl: lastTx?.auditUrl,
    repaidUnits: safe.amountUnits,
    rationale: safe.rationale,
    trail,
    finalPosition: newPos,
  };
}
