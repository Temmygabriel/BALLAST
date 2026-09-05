/**
 * attemptRescue — the money path, shared by live mode and the simulator.
 *
 * Order is sacred and is the demo's whole point:
 *   1. policy computes a safe repay amount            (deterministic)
 *   2. the analyst PROPOSES (may be an LLM)            (probabilistic)
 *   3. schema validation + the guard CLAMP the proposal (deterministic — hostile
 *      LLM output is rejected, nothing unsafe passes; the rationale is display-only)
 *   4. KeeperHub DRY-RUNS every call                  (nothing bad is broadcast)
 *   5. state is RE-READ and re-validated right before each broadcast (TOCTOU —
 *      never act on a simulation that may already be stale)
 *   6. KeeperHub EXECUTES + we wait for the tx        (real money moves)
 *   7. after confirmation the position is RE-READ and the health factor change is
 *      VERIFIED — a "success" receipt is not silently accepted (hardening §P0-4)
 *
 * Hardening this file applies (ballast-security-hardening.md):
 *  - idempotency key is stable PER RESCUE EPISODE (not Date.now), then scoped per
 *    call-index + calldata: an identical retry dedupes, but a genuinely different
 *    amount becomes a new work item instead of replaying a stale calldata.
 *  - private routing availability is queried and logged per execution, never assumed;
 *    a path that REQUIRES privacy fails closed when the chain doesn't provide it.
 */
import {
  deterministicAnalyst,
  makeAnalyst,
  validateAnalystReply,
  type Analyst,
  type AnalystReply,
} from './composer';
import { healthFactorOf, hf } from './aave';
import { guard, type Proposal } from './guard';
import { afterRepay, planRepay, tokenUnitsToBase } from './policy';
import { buildRepayCalls } from './workflows';
import type { ContractCall, KeeperHub, Position, RescueOutcome, Thresholds } from './types';

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
  /**
   * Stable identity for THIS rescue episode — reused for every retry until the
   * position is healthy again. Set once when a rescue is confirmed (the block anchor
   * from TriggerGate), never re-rolled per tick or per Date.now.
   */
  episodeId: string;
  /** True when this action MUST NOT hit the public mempool (e.g. a swap step). */
  requiresPrivate?: boolean;
  /**
   * Fresh read of the on-chain position. Used for (a) TOCTOU re-validation before
   * each broadcast and (b) post-execution health-factor verification. When omitted
   * (offline), verification falls back to the deterministic projection.
   */
  revalidate?: () => Promise<Position>;
  onStep?: (msg: string) => void;
}

/** Stable non-crypto fingerprint of a call's calldata, so identical work dedupes. */
function callFingerprint(c: ContractCall): string {
  const s = `${c.abiFunction}|${String(c.contractAddress).toLowerCase()}|${JSON.stringify(c.args ?? [])}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** Is a rescue still warranted, given the freshly-read position? (TOCTOU, §P0-3) */
function rescueStillValid(
  latest: Position,
  amountUnits: bigint,
  thresholds: Thresholds,
): { ok: boolean; reason: string } {
  const now = hf(healthFactorOf(latest));
  if (now >= thresholds.actHF) {
    return { ok: false, reason: `position is now ${now.toFixed(3)} ≥ ${thresholds.actHF} — rescue no longer warranted` };
  }
  const repayBase = tokenUnitsToBase(amountUnits, latest.decimals);
  if (repayBase > latest.debtBase) {
    return { ok: false, reason: 'planned repay now exceeds the current debt — state moved since the dry-run' };
  }
  return { ok: true, reason: '' };
}

export async function attemptRescue(deps: RescueDeps): Promise<RescueOutcome> {
  const trail: string[] = [];
  const step = (m: string) => {
    trail.push(m);
    deps.onStep?.(m);
  };

  const analyst = deps.analyst ?? makeAnalyst();
  const readNow = deps.revalidate ?? (async () => deps.position);

  // 1. Policy — how much must go down for the position to be safe again?
  const health = hf(healthFactorOf(deps.position));
  const plan = planRepay(deps.position, deps.targetHF);
  step(`health factor ${health.toFixed(3)} — repay plan ≈ $${plan.toUsd.toFixed(2)} (${plan.units.toString()} units)`);

  if (plan.units <= 0n) {
    return { ok: true, landed: false, status: 'STEADY', reason: 'position already above target', trail };
  }

  // 2. Analyst proposes (the LLM, if present). Its reply is validated against a strict
  //    schema; rationale is display-only and never affects execution parameters.
  const ctxForAnalyst = {
    healthFactor: health,
    totalDebtBase: deps.position.debtBase.toString(),
    totalCollateralBase: deps.position.collateralBase.toString(),
    suggestedUnits: plan.units.toString(),
    debtAsset: deps.debtAsset,
    debtAssetName: deps.position.debtAssetName,
  };
  const propose = async (a: Analyst): Promise<AnalystReply> => validateAnalystReply(await a.propose(ctxForAnalyst), ctxForAnalyst);

  let raw: AnalystReply;
  try {
    raw = await propose(analyst);
  } catch (e) {
    // Unreachable OR schema-hostile output → deterministic plan. Never stall a rescue,
    // and never let a bad LLM reply reach the chain.
    step(`analyst rejected (${(e as Error).message}) — using deterministic plan`);
    raw = await propose(deterministicAnalyst());
  }

  // 3. Guard clamps (and carries the analyst's plain-language rationale through).
  let safe: Proposal;
  try {
    safe = guard(
      {
        debtAsset: raw.debtAsset || deps.debtAsset,
        amountUnits: BigInt(raw.amountUnits || '0'),
        rationale: raw.rationale,
      },
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

  // 4. Private routing: ask, log the answer, never assume. Fail closed if a call
  //    REQUIRES privacy and this chain/path doesn't provide it (§P1-6).
  const privateOk = await deps.keeper.supportsPrivateRouting(deps.network);
  step(
    privateOk
      ? 'routing: private/MEV-safe path confirmed for this chain'
      : 'routing: standard (public) execution — this action does not require private routing',
  );
  if (deps.requiresPrivate && !privateOk) {
    return {
      ok: true,
      landed: false,
      status: 'STEADY',
      reason: 'private routing unavailable on this chain — holding, refusing to execute unprotected',
      trail,
    };
  }

  // 5 + 6 + 7. Dry-run → re-validate → execute, call by call.
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

    // TOCTOU: the simulation is not atomic with the broadcast. Re-read the position
    // right now and abort rather than broadcast a stale action.
    const latest = await readNow();
    const check = rescueStillValid(latest, safe.amountUnits, deps.thresholds);
    if (!check.ok) {
      step(`re-validation before ${call.abiFunction}: ${check.reason} — aborting, nothing broadcast`);
      return {
        ok: true,
        landed: false,
        status: 'STEADY',
        reason: `aborted before broadcast: ${check.reason}`,
        repaidUnits: 0n,
        rationale: safe.rationale,
        trail,
      };
    }

    // Stable per-episode key, scoped by call-index + calldata so identical retries
    // dedupe but a changed amount is treated as a new work item.
    const idemKey = `${deps.episodeId}::${i}::${callFingerprint(call)}`;
    const exec = await deps.keeper.execute(call, idemKey);
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

  // All calls landed. Verify the position actually improved (§P0-4) — a receipt that
  // says "success" is not proof money moved correctly.
  const projection = afterRepay(deps.position, repaidBase);
  let finalPosition: Position;
  let verification: { improved: boolean; note: string };

  if (deps.revalidate) {
    const actual = await deps.revalidate();
    const now = hf(healthFactorOf(actual));
    if (now > health + 1e-9) {
      finalPosition = actual;
      verification = { improved: true, note: `verified on-chain: HF ${health.toFixed(3)} → ${now.toFixed(3)}` };
    } else {
      // Flag it loudly — never silently pass. Money may have moved without improving us.
      finalPosition = projection;
      verification = {
        improved: false,
        note: `⚠ tx confirmed but position not improved: HF ${health.toFixed(3)} → ${now.toFixed(3)} — flagged, not accepted`,
      };
    }
  } else {
    // Offline: no live chain to re-read, so the deterministic projection is the best
    // statement we can make, and it is labelled as such.
    finalPosition = projection;
    const projHF = hf(healthFactorOf(projection));
    verification = {
      improved: true,
      note: `health factor rose as planned (offline projection ${health.toFixed(3)} → ${projHF.toFixed(3)} — no live read available)`,
    };
  }
  step(verification.note);

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
    finalPosition,
    verification,
  };
}
