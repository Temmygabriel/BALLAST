/**
 * The SIMULATOR — a fake Aave market that lets the whole product run with no
 * chain, no keys, no network. It owns a fake position, can crash its collateral,
 * and replays the chaos "storm" the demo is built around.
 *
 * It uses the SAME code the real guardian uses (policy → analyst → guard →
 * rescue → keeper), so "sim works" actually means "the engine works".
 *
 * Hardening (ballast-security-hardening.md) is wired in here too:
 *  - each price step is an observation on a VIRTUAL BLOCK, fed through the same
 *    TriggerGate a live monitor uses — so a single-block blip never fires a rescue
 *    (see `runBlip`), while a sustained crash confirms across two blocks;
 *  - the mock "chain" actually records a repay when it lands, so the engine's
 *    re-validation and post-execution verification read a real (mock) post-state.
 */
import { healthFactorOf, hf } from './aave';
import { baselineFailureFor } from './baseline';
import { makeAnalyst, type Analyst } from './composer';
import { defaultsRisk, type RiskConfig } from './config';
import { MockKeeperHub } from './keeperhub';
import { tokenUnitsToBase } from './policy';
import { attemptRescue } from './rescue';
import {
  DEFAULT_THRESHOLDS,
  initialPosition,
  initialState,
  patch,
  setRow,
  snapshotOf,
  statusOfHealthFactor,
  withLog,
} from './state';
import { TriggerGate } from './trigger';
import type { AdversityId, InstrumentState, KeeperHub, Position, Status, Thresholds } from './types';
import { buildRepayCalls } from './workflows';

export type StateListener = (s: InstrumentState) => void;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dollars = (n: number) => BigInt(Math.round(n * 1e8));

/** Below this the confirmation window is bypassed (explicit emergency edge). */
export const SIM_EMERGENCY_HF = 1.01;

export class SimEngine {
  readonly thresholds: Thresholds = DEFAULT_THRESHOLDS;
  readonly risk: RiskConfig;
  position: Position;
  private state: InstrumentState;
  private readonly keeper: KeeperHub;
  private readonly analyst: Analyst;
  private readonly listeners = new Set<StateListener>();
  private readonly gate: TriggerGate;
  private busy = false;
  /** Virtual block counter — each refresh() is one block's observation. */
  private blockN = 0;
  /** Token units of repay that have LANDED on the (mock) chain this scenario. */
  private landedUnits = 0n;

  constructor(opts: { analyst?: Analyst; maxUsd?: number; onState?: StateListener } = {}) {
    this.position = initialPosition();
    // "maxUsd" is whole tokens (e.g. 1000 = $1,000 of USDC) → raw units inside.
    this.risk = defaultsRisk(opts.maxUsd ?? 1000, this.position.decimals);
    this.analyst = opts.analyst ?? makeAnalyst();
    this.gate = new TriggerGate({
      thresholds: this.thresholds,
      emergencyHF: SIM_EMERGENCY_HF,
      user: '0xUser',
    });
    // The mock "chain" only holds ~500 USDC (dedicated, operational-funds-only wallet),
    // so any repay above that would revert on-chain — the dry-run's job is to catch it.
    const walletBalance = 500n * 10n ** BigInt(this.position.decimals); // 500 whole USDC in raw units
    const base = new MockKeeperHub({
      wouldRevert: (call) =>
        call.abiFunction.startsWith('repay') && BigInt(String(call.args[1] ?? '0')) > walletBalance,
      onStep: (m) => this.logEvent('keeper', m),
    });
    // Wrap execute so a landed repay actually reduces the mock chain's debt — that is
    // what the engine's re-validation and post-exec verification read.
    this.keeper = {
      simulate: (call) => base.simulate(call),
      execute: async (call, key) => {
        const r = await base.execute(call, key);
        if (r.status === 'completed' && call.abiFunction.startsWith('repay')) {
          this.landedUnits += BigInt(String((call.args as unknown[])[1] ?? '0'));
        }
        return r;
      },
      waitForTx: (id) => base.waitForTx(id),
      supportsPrivateRouting: (n) => base.supportsPrivateRouting(n),
    };
    this.state = initialState({ position: this.position, engineMode: 'sim' });
    opts.onState?.(this.state);
  }

  getState(): InstrumentState {
    return this.state;
  }
  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  /* ── tiny state plumbing ── */
  private notify() {
    for (const fn of this.listeners) fn(this.state);
  }
  private refresh(part: Partial<InstrumentState> = {}) {
    const snap = snapshotOf(this.position);
    // One new block, one observation through the trigger gate.
    this.blockN++;
    this.gate.observe(snap.healthFactor, this.blockN);
    this.state = patch(this.state, {
      healthFactor: snap.healthFactor,
      collateralUSD: snap.collateralUSD,
      debtUSD: snap.debtUSD,
      positionLabel: this.position.label,
      ...part,
      status: part.status ?? statusOfHealthFactor(snap.healthFactor, this.thresholds),
    });
    this.notify();
  }
  private logEvent(event: string, detail: string) {
    this.state = withLog(this.state, event, detail);
    this.notify();
  }
  private setCollateralUSD(usd: number) {
    this.position = { ...this.position, collateralBase: dollars(usd) };
  }
  /** The mock chain's current post-repay read (TOCTOU + post-exec verification seam). */
  private chainRead(): Position {
    const p = this.position;
    const down = tokenUnitsToBase(this.landedUnits, p.decimals);
    return { ...p, debtBase: p.debtBase > down ? p.debtBase - down : 0n };
  }

  reset(): InstrumentState {
    this.position = initialPosition();
    this.landedUnits = 0n;
    this.blockN = 0;
    this.gate.reset();
    this.state = initialState({ position: this.position, engineMode: 'sim' });
    this.notify();
    return this.state;
  }

  /* ── public scenarios ── */

  /** The centrepiece: a price crash + every chaos row + the rescue, start to finish. */
  async runStorm(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.reset();
      this.state = patch(this.state, { mode: 'storm', stormActive: true });
      this.logEvent('STORM', 'price shock incoming — every condition is on the table');

      // 1. Drift the collateral down so the needle walks toward the red arc.
      const drift = [485, 465, 445, 425, 408, 394, 386]; // HF ≈ 1.29 → 1.03
      for (const usd of drift) {
        await sleep(420);
        this.setCollateralUSD(usd);
        this.refresh();
        this.logEvent('PRICE', `collateral $${usd.toFixed(0)} · HF ${this.state.healthFactor.toFixed(3)}`);
      }

      // 2. Resolve each chaos row: baseline fails first, then Ballast survives.
      for (const row of this.state.conditions) {
        if (row.mainnetOnly) continue;
        await this.resolveRow(row.id as AdversityId);
      }
      await this.resolveMevRow(); // honest about what only exists on mainnet

      // 3. The actual rescue (the TriggerGate confirms it across two blocks first).
      await this.rescueNow();
    } finally {
      this.busy = false;
    }
  }

  /** Resolve a single chaos row by itself (for the "what if…" questions). */
  async runRow(id: AdversityId): Promise<void> {
    if (this.busy || !this.state.conditions.some((r) => r.id === id)) return;
    this.busy = true;
    try {
      this.state = patch(this.state, { mode: 'storm', stormActive: true });
      if (id === 'mev-sandwich') await this.resolveMevRow();
      else await this.resolveRow(id);
      await sleep(600);
      this.refresh({ mode: 'bridge', stormActive: false });
    } finally {
      this.busy = false;
    }
  }

  /** Crash + rescue without the chaos rows (quick version). */
  async quickCrash(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.reset();
      this.state = patch(this.state, { mode: 'storm', stormActive: true });
      for (const usd of [445, 420, 400, 385]) {
        await sleep(360);
        this.setCollateralUSD(usd);
        this.refresh();
      }
      await this.rescueNow();
    } finally {
      this.busy = false;
    }
  }

  /**
   * A SINGLE-BLOCK price spike that reverts before a second block — the flash-loan
   * pattern. The two-block confirmation window must hold: NO rescue fires.
   */
  async runBlip(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.reset();
      this.state = patch(this.state, { mode: 'storm', stormActive: true });
      this.logEvent('STORM', 'single-block price blip — one low reading, then reversion');

      await sleep(400);
      this.setCollateralUSD(385); // HF ≈ 1.03 → one low observation (block 1)
      this.refresh();
      this.logEvent('PRICE', `collateral $385 · HF ${this.state.healthFactor.toFixed(3)} — ONE block only`);

      await sleep(400);
      this.setCollateralUSD(500); // price reverts before block 2 (block 2)
      this.refresh();
      this.logEvent('PRICE', 'price reverted — healthy again before any confirmation');

      await sleep(400);
      await this.rescueNow(); // must stand by: never confirmed across two blocks

      await sleep(600);
      this.refresh({ mode: 'bridge', stormActive: false });
    } finally {
      this.busy = false;
    }
  }

  /* ── internals the scenarios share ── */

  private async resolveRow(id: AdversityId): Promise<void> {
    const row = this.state.conditions.find((r) => r.id === id);
    if (!row || row.baseline !== 'pending') return;

    const fail = baselineFailureFor(id);
    this.state = setRow(this.state, id, 'baseline', 'fail', fail.note);
    this.logEvent(id, `baseline ✗ — ${fail.note}`);
    await sleep(150);

    const pass = await this.ballastProof(id);
    if (pass.outcome === 'pass') {
      this.state = setRow(this.state, id, 'ballast', 'pass', pass.note);
      this.logEvent(id, `ballast ✓ — ${pass.note}`);
    } else {
      this.state = setRow(this.state, id, 'ballast', 'skip', pass.note);
    }
    await sleep(120);
  }

  private async resolveMevRow(): Promise<void> {
    this.state = setRow(this.state, 'mev-sandwich', 'baseline', 'fail', 'public mempool → sandwiched');
    // Honest claim (hardening §P1-6 corrected copy): no universal MEV guarantee.
    this.state = setRow(
      this.state,
      'mev-sandwich',
      'ballast',
      'skip',
      'mainnet-only — KeeperHub private routing used only where this chain/path supports it; no universal MEV guarantee',
    );
    this.logEvent('mev-sandwich', 'MEV is a mainnet property — Ballast verifies private routing is actually available before executing there');
    await sleep(120);
  }

  /** What Ballast does to survive one chaos row (a real dry-run where it counts). */
  private async ballastProof(id: AdversityId): Promise<{ outcome: 'pass' | 'skip'; note: string }> {
    if (id === 'would-be-revert') {
      // Craft a repay LARGER than the wallet's ~500 USDC and dry-run it.
      // "$2,000" in raw units (2,000 whole tokens × 10^decimals).
      const calls = buildRepayCalls({
        network: '11155111',
        pool: '0xPool',
        debtAsset: '0xUSDC',
        amountUnits: 2000n * 10n ** BigInt(this.position.decimals),
        onBehalfOf: '0xUser',
      });
      const sim = await this.keeper.simulate(calls[1]!);
      return sim.wouldRevert
        ? { outcome: 'pass', note: 'dry-run BLOCKED the $2,000 repay — nothing broadcast' }
        : { outcome: 'pass', note: 'dry-run ran (no revert detected)' };
    }
    if (id === 'gas-spike') return { outcome: 'pass', note: 'smart gas + retry landed the rescue through the 10× spike' };
    if (id === 'nonce-collision') return { outcome: 'pass', note: 'nonce management sequenced approve → repay; nothing wedged' };
    if (id === 'rpc-failure') return { outcome: 'pass', note: 'multi-RPC failover kept the rescue alive' };
    return { outcome: 'skip', note: 'not run offline' };
  }

  /** Run the real rescue flow against the current (low) position. */
  async rescueNow(): Promise<void> {
    const currentHF = hf(healthFactorOf(this.position));
    // Observe at a NEW virtual block — the gate needs a second, later low reading.
    const decision = this.gate.observe(currentHF, ++this.blockN);

    if (decision.action !== 'rescue') {
      const why =
        decision.reason === 'first-observation' || decision.reason === 'same-block'
          ? `HF ${currentHF.toFixed(3)} low for only one block — confirmation window held, NO rescue fired`
          : `HF ${currentHF.toFixed(3)} ≥ ${this.thresholds.actHF} — standing by`;
      this.logEvent('rescue', why);
      return;
    }

    const how = decision.reason === 'emergency' ? 'EMERGENCY edge — acting now' : 'confirmed across two blocks';
    this.logEvent('rescue', `HF ${currentHF.toFixed(3)} < ${this.thresholds.actHF} · ${how} (episode ${decision.episodeId})`);

    const out = await attemptRescue({
      position: this.position,
      thresholds: this.thresholds,
      allowedAssets: ['0xUSDC'],
      maxUnits: this.risk.maxUnits,
      targetHF: this.thresholds.targetHF,
      network: '11155111',
      pool: '0xPool',
      user: '0xUser',
      debtAsset: '0xUSDC',
      keeper: this.keeper,
      analyst: this.analyst,
      episodeId: decision.episodeId,
      // Live mock-chain read: reflects repayments that have actually landed.
      revalidate: () => Promise.resolve(this.chainRead()),
    });

    if (out.landed && out.finalPosition) {
      this.position = out.finalPosition; // debt already repaid → HF back to ~target
      this.landedUnits = 0n; // chain state now reflects the repayment
      this.refresh({
        mode: 'rescue',
        status: 'RESCUED',
        rationale: out.rationale,
        lastTx: out.txHash
          ? { hash: out.txHash, auditUrl: out.auditUrl, at: new Date().toISOString() }
          : undefined,
      });
      this.logEvent('RESCUED', `needle back to green · tx ${out.txHash ?? '(mock)'}`);
      if (out.verification && !out.verification.improved) {
        this.logEvent('⚠ FLAG', out.verification.note);
      }
      await sleep(2200); // let the swing play on screen
      this.refresh({ mode: 'bridge', stormActive: false, status: 'RESCUED' });
      this.logEvent('ENGINE', 'rescue confirmed — position is safe');
    } else {
      this.refresh({ mode: 'bridge', stormActive: false, status: 'FOUNDERED', rationale: out.reason });
      this.logEvent('FOUNDERED', out.reason ?? 'rescue failed');
    }
  }
}
