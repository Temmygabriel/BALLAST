# Ballast — Security Hardening Addendum

**Read alongside:** `keeperhub-integration-research.md` (architecture source of truth)
and `ballast-design-spec.md` (UI/UX). This file **amends and hardens** those two — it
does not replace them. Where this file's rules conflict with a claim in the original
research doc (e.g. "private routing — never in public mempool"), **this file wins.**

Full review this was distilled from: `ballast-security-gameability-review.md`.

Every reference to the project's earlier working name ("Aegis") in any existing file
or code comment means **Ballast**. Do not create a second identity.

---

## Why this file exists

The architecture's core safety claim — "the LLM proposes, the guard clamps, KeeperHub
executes" — is directionally correct but was making several claims stronger than the
current implementation actually guarantees. This addendum closes those gaps with
concrete, code-level rules. Treat every item below as a build requirement, not a
suggestion.

---

## What's already right — keep these, don't "fix" them

- Ballast reads Aave's own reported `healthFactor` via `getUserAccountData()` instead
  of computing collateral value from DEX spot prices. **Do not add an independent
  price oracle.** Aave's own oracle (Chainlink-backed) is the correct source of truth
  — reinventing it would introduce a new flash-loan-manipulable surface Aave itself
  doesn't have.
- The LLM is a proposer only, never the signer.
- All KeeperHub interaction is isolated inside a single adapter module
  (`src/keeperhub.ts`).
- Dry-run (`simulate()`) happens before every execution.
- There's an explicit asset allowlist and amount cap in the guard.
- BigInt is used for token quantities, not floating point.
- The chaos-test mindset (testing failure modes, not just the happy path) stays
  central to the demo — this is a genuine strength, don't cut it under time pressure.

---

## P0 — Execution correctness (fix these first, they're bugs, not hardening)

### 1. Idempotency key is currently broken

Current code generates a new identity on every tick:
```ts
const run = await kh.execute(c, `aegis-${user}-${Date.now()}`);
```
This defeats KeeperHub's own duplicate-protection, because every retry gets a *new*
key instead of reusing the key for the *same* rescue attempt.

**Fix:** derive the key from the rescue episode, not the clock:
```ts
// Set once when a rescue episode is confirmed (see confirmation rule below),
// reused for every retry of that same episode until the position is healthy again.
const rescueEpisodeId = `ballast-${user}-${confirmedAtBlock}`;
const run = await kh.execute(c, rescueEpisodeId);
```
`confirmedAtBlock` is the block number at which the confirmation window (rule below)
completed — stable across retries, changes only when a genuinely new unhealthy episode
starts.

### 2. Overlapping monitor ticks

`setInterval()` can fire a new tick before the previous one finishes, allowing two
concurrent rescue evaluations.

**Fix:** add an in-flight lock:
```ts
let tickInFlight = false;
async function tick() {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    // existing tick logic
  } finally {
    tickInFlight = false;
  }
}
```

### 3. State can change between simulation and execution (TOCTOU)

A successful dry-run does not guarantee the transaction is still valid when broadcast
— treat simulation and execution as non-atomic.

**Fix:** immediately before calling `kh.execute()`, re-fetch `getUserAccountData()`
one more time and confirm the position is still unhealthy and the proposed repay
amount still makes sense. Abort the rescue (don't execute) if state has materially
changed since the dry-run.

### 4. No post-execution verification

A receipt saying "success" is not proof the position actually improved.

**Fix:** after execution confirms, re-read `getUserAccountData()` once more and assert
the health factor actually moved in the expected direction. Log and flag (don't
silently pass) if it didn't.

---

## P1 — Trigger integrity

### 5. Single-observation trigger

Right now, one unhealthy reading can fire a rescue. This is exploitable via a
flash-loan-induced single-block price distortion — a well-documented DeFi attack
pattern (manipulate price within one block, cause positions to appear liquidatable,
profit, revert before block end).

**Fix:** require the unhealthy condition to be confirmed across **two consecutive
blocks**, not one reading, before triggering a normal rescue. Track the block number
at which the unhealthy state was first observed; only proceed if it's still unhealthy
at a second, later block.

**Exception:** define an explicit emergency threshold (health factor critically close
to 1.0) that can bypass the confirmation window — being too slow at the real edge is
its own risk. State this threshold explicitly in code and in the pitch, don't leave it
implicit.

---

## P1 — MEV correctness (a claim to stop overstating)

### 6. "Private routing, never in public mempool" is too strong as currently written

KeeperHub's private/MEV-protected routing is conditional on the specific chain and
execution surface — not a universal guarantee across every network.

**Fix (code):** before executing, query KeeperHub's chain-capability info for the
target chain and record in the audit log whether private routing was actually used
for this specific execution — don't assume it.

**Fix (claim, use this instead in README/pitch):**
> "Private routing is used where the selected KeeperHub execution path and target
> chain explicitly support it; otherwise Ballast makes no private-MEV guarantee."

**Fail-closed rule:** if your target chain/action requires private routing to be safe
(e.g. a swap step that could be sandwiched) and it isn't available, don't execute —
surface a clear "routing unavailable, holding" state instead of executing unprotected.

---

## P1 — LLM containment

### 7. Strip the LLM's input down to structured data only

The LLM proposer should only ever receive clean numeric fields (health factor,
collateral, debt, asset symbol) — never raw external text, alerts, or arbitrary RPC
response fields that could carry attacker-influenced content.

### 8. Treat the LLM's output as hostile, not just "structured"

- Validate the LLM's response against a strict schema — reject anything with
  unexpected fields.
- The LLM's rationale/explanation text is **display-only** — it must never be parsed
  or used to determine execution parameters.
- Final money-moving parameters (asset, amount, target) come from the deterministic
  guard/policy layer, not from the LLM's proposal directly — the LLM's suggestion is
  an input to the guard, not the guard's output.

---

## P1 — Credential blast radius

### 9. A compromised KeeperHub API key can currently bypass Ballast's own guard entirely

Ballast's guard only constrains what *Ballast's own code* does — it does nothing to
protect against someone using a stolen KeeperHub `mcp:write` key directly. Don't
describe the guard as the final protection against credential compromise anywhere in
the README or pitch.

**Fix:**
- Use a dedicated KeeperHub wallet/account scoped only to Ballast's guardian function
  — don't reuse a wallet with broader permissions.
- Keep only operational rescue funds in that wallet — nothing else.
- Use the least-privilege API key scope available.
- **Never use unlimited token approvals** — approve only the specific amount needed
  for the specific repay action, not `type(uint256).max`.

---

## Corrected claims — use these exact replacements in README/pitch copy

| Too strong (don't use) | Use instead |
|---|---|
| "Private routing — never in public mempool." | "Private routing is used where the selected KeeperHub execution path and target chain explicitly support it; otherwise Ballast makes no private-MEV guarantee." |
| "Dry-run catches reverts, so the rescue cannot revert." | "Dry-run is a pre-broadcast check that catches many deterministic failure conditions; Ballast still re-validates state immediately before execution and treats execution as non-atomic with respect to simulation." |
| "Idempotency prevents duplicate rescue." | "KeeperHub provides idempotency primitives; Ballast maintains one stable idempotency key per rescue work item and suppresses concurrent rescue attempts." |
| "The guard makes the LLM safe." | "The LLM is untrusted. Deterministic policy, guard, current-state validation, and transaction-level assertions constrain what can reach execution." |

**Suggested README security statement (use as-is or adapt):**
> Ballast is intentionally designed so the LLM is not a trusted actor and is not the
> final authority over money movement. The guardian reads Aave's protocol-reported
> health factor rather than computing an independent DEX price oracle. Rescue
> candidates are validated through deterministic policy rules, an explicit
> asset/amount guard, current-state revalidation, and a pre-broadcast simulation.
> Each rescue has a stable idempotency identity and is independently verified onchain
> after execution. KeeperHub private routing is used only where the selected chain
> and execution path explicitly support it; Ballast does not claim universal MEV
> protection.

---

## Definition of Done — check every box before calling this submission-ready

- [ ] Idempotency key is stable per rescue episode, not `Date.now()`
- [ ] Monitor tick has an in-flight lock, no overlapping evaluations
- [ ] State is re-validated immediately before execution (not just at dry-run)
- [ ] Post-execution, health factor is re-read and verified to have improved
- [ ] Unhealthy condition requires two-block confirmation, except an explicit
      emergency threshold that bypasses it
- [ ] Private routing availability is checked and logged per execution, never assumed
- [ ] LLM input is structured-data-only; LLM output is schema-validated; rationale
      text is display-only
- [ ] Dedicated, least-privilege KeeperHub wallet/API key; no unlimited approvals
- [ ] README/pitch copy uses the corrected claims table above, not the original
      absolute statements

---

## Chaos-test additions (fold into the existing chaos-test harness)

Add these scenarios alongside the existing nonce/gas/revert/RPC-failure tests:

| # | Scenario | Expected behavior |
|---|---|---|
| 1 | Single-block price spike then reversion | No rescue fires (confirmation window holds) |
| 2 | Two monitor ticks overlap | Second evaluation is suppressed |
| 3 | State changes between simulate and execute | Execution aborts, no stale action |
| 4 | Receipt says success but position unchanged | Flagged, not silently accepted |
| 5 | LLM output includes unexpected/extra fields | Rejected by schema validation |
| 6 | Private routing unavailable on target chain | Fails closed with a clear status, doesn't execute unprotected |
| 7 | Simulated stolen API key used directly against KeeperHub | Demonstrate blast radius is limited to the dedicated wallet's operational funds only |

These are exactly the kind of non-happy-path proof that makes the demo's "reliability
under adversarial conditions" claim credible instead of asserted.
