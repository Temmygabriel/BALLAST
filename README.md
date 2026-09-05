# ⚓ Ballast

A **liquidation-protection guardian** for Aave, with a ship's-inclinometer UI — built on **KeeperHub** for the *Agent Economy* hackathon.

**In plain words:** a loan on Aave has a *health factor* — a safety number. If the market crashes and the health factor drops toward **1.0**, the position can be **liquidated** (the owner loses money). Ballast watches that number and, when a crash threatens the position, **rescues it by paying down the loan** — deterministically, through **KeeperHub**: every transaction is *dry-run first* (nothing bad is ever broadcast), retried through gas spikes, tracked with an idempotency key, and recorded in an audit log. The screen is a brass ship's inclinometer: **the needle *is* the health factor**. Safe = green. Danger = red. A rescue = the needle swings back to green and the status reads **RESCUED**.

Two parts in one repo:

| | what it is | never does |
|---|---|---|
| `guardian/` | the engine (TypeScript) — reads the position, decides, instructs KeeperHub | keeps secrets in code (env-only) |
| `ballast/` | the screen (Next.js) — draws the instrument | computes data or calls Aave/KeeperHub |

**Architecture rule judges look for:** exactly **one** file may talk to KeeperHub — `guardian/src/keeperhub.ts` (the *adapter boundary*, with a real implementation and an offline `MockKeeperHub` behind one interface). Everything else stays clean. The UI only ever *reads* states the engine computed; when the engine is silent the page honestly says **BRIDGE DARK**.

---

## ✅ Proof this works: a real rescue on Sepolia through KeeperHub

The guardian was pointed at a **real near-liquidation Aave v3 position** on Sepolia and rescued it through KeeperHub. Money actually moved.

- Real position built on-chain: 0.011 ETH → WETH supplied as collateral (~$44), listed USDC borrowed near the LTV cap → **health factor 1.042** (under the guardian's 1.05 action line, above the 1.01 emergency edge).
- The guardian read the low health factor, confirmed it across **two different blocks**, and executed through KeeperHub.
- Verified on-chain afterwards: debt `$34.85 → $27.92`, collateral untouched, **health factor `1.042 → 1.300`** — exactly the target it aims for. The repay tx was broadcast by KeeperHub's **sponsored relayer** (`sponsored: true` — KeeperHub paid the gas).

| step | KeeperHub execution | tx |
|---|---|---|
| approve (guardian) | `9j2pfnljbb7wtykao04gx` | `0xe877cdffe2e254655b24f2f09d38db9444e541ce2e15c7b4e13091050f695dfe` |
| **repay (the rescue)** | `sxux4wnpqqs1wc1eolzzk` | **`0xe3f9c6c682eea3b11549bac90f2131806eea5b9b80e07f6692bb1719b96d1c3f`** ([etherscan](https://sepolia.etherscan.io/tx/0xe3f9c6c682eea3b11549bac90f2131806eea5b9b80e07f6692bb1719b96d1c3f)) |

> Run it yourself: `guardian/scripts/build-position.mjs` creates a fresh near-liquidation position, then `npm run live` (with a funded `guardian/.env`) makes the guardian watch and rescue it. Everything the engine does is logged and verified — it never trusts a "success" receipt without re-reading the on-chain health factor afterwards.

---

## 🧭 How the guardian stays safe (security hardening)

Ballast treats every input — and every moment — as hostile:

1. **Two-block confirmation.** One low reading is never enough. A rescue fires only after the position is low on **two observations at different blocks**, so a single-block price blip (flash-loan manipulation) can't trick it. There's an explicit `EMERGENCY_HF` below which it acts immediately (being slow at the real edge is its own risk).
2. **Dry-run first.** Every call is simulated before broadcast. A repay the wallet can't cover never touches the mempool.
3. **No time-of-check/time-of-use gap.** State is re-read and re-validated *right before* each broadcast — the guardian won't act on a simulation that went stale.
4. **Verify after, never trust a receipt.** After a tx confirms, the position is re-read. If the health factor didn't actually improve, that's **flagged loudly**, never silently accepted.
5. **Idempotency.** Each rescue episode has a stable id anchored to its confirmation block; every retry of the same calldata reuses the same KeeperHub idempotency key, so a timeout can never double-execute.
6. **Private routing: verified, never assumed.** Ballast checks whether the chain/path actually provides private/MEV-safe routing before it would rely on it, and **fails closed** when an action requires privacy that isn't available. There is no universal "can't be front-run" claim — that only exists where the execution surface proves it.
7. **Hostile-LLM defence.** The risk analyst (an LLM when a key is set) only ever *proposes*. Its reply is schema-validated (no unexpected fields, no amount above policy, no non-address) and the deterministic `guard` clamps the final call. A broken or malicious analyst reply can neither stall a rescue nor push an unsafe amount through. Rationale is display-only.
8. **A dedicated execution wallet.** The KeeperHub execution account is a least-privilege operational wallet, funded only for what a rescue needs (no unlimited approvals — the guardian approves exact amounts).
9. **Refusing to act IS a success.** When the dry-run blocks a call or the guard rejects a proposal, the outcome is reported honestly (STEADY, nothing broadcast) — not hidden as a win.

---

## 🚀 Run it

### Offline demo — zero keys, works on any laptop
```bash
npm install          # (on a flaky registry: --registry=https://registry.npmjs.org/)
npm test             # 46 tests — policy, guard, rescue, keeper idempotency, the full storm
npm run dev          # guardian SIM (SSE :4300) + Ballast screen (:3000)
```
Open `http://localhost:3000` and raise the storm from the Dev Deck: the needle walks into the red, every chaos row shows the naive baseline failing where Ballast survives, and the rescue swings the needle back to green (**RESCUED**, HF back to 1.30).

Cloud demo (no localhost): the same engine runs inside the deployed Next app at `/api/guardian` — the screen you deploy to Vercel is genuinely alive, not mocked. A cold serverless start simply resets to a fresh steady bridge (honest, by design).

### Live mode — real chain + real KeeperHub
1. `cp guardian/.env.example guardian/.env` and fill in: an RPC URL, the Aave v3 pool, the debt asset, your protected wallet, and KeeperHub creds (`KEEPERHUB_MCP_URL` + `KEEPERHUB_API_KEY`). Live mode reads only from this gitignored file.
2. Fund the **KeeperHub execution wallet** with the debt asset (that's whose funds repay the loan).
3. `npm run live` — the guardian polls the position and rescues through KeeperHub the moment the trigger rules are met.
4. To demo a real rescue: `node guardian/scripts/build-position.mjs` builds a near-liquidation position (supply + borrow to land HF ~1.04), then the guardian fires within a couple of polls.

Live helper scripts live in `guardian/scripts/` (build position, check balances, verify creds). Testnet only — mainnet is a config change away but is not what this demo moves.

### Cloud live — the deployed page reads a real position, with a gated rescue

The same app you deploy to Vercel can stop being a simulation. Set these **Vercel dashboard → your project → Settings → Environment Variables** and redeploy (a git push):

| variable | what it does |
|---|---|
| `RPC_URL` · `CHAIN_ID` · `AAVE_POOL` · `DEBT_ASSET` · `PROTECTED_WALLET` | arms the LIVE engine — `/api/guardian/state` returns your real position's health factor and the gauge's needle becomes that number |
| `KEEPERHUB_MCP_URL` · `KEEPERHUB_API_KEY` | lets a rescue reach KeeperHub |
| `BALLAST_LIVE_KEY` | operator key that gates `POST /api/guardian/rescue` (sent as the `x-ballast-key` header) |

Same names as `guardian/.env.example`. Vercel env vars are encrypted — they never live in the repo.

- **Sim stays the default.** With no env vars, the deployed URL is the keyless storm demo, unchanged.
- Read the real position from anywhere: `curl https://<your-app>/api/guardian/state`
- Gated rescue: `curl -X POST https://<your-app>/api/guardian/rescue -H 'x-ballast-key: <your key>'`
- **Honesty:** this is **on-demand**, not an always-on watcher. Serverless can't watch every 12 seconds — a real *automatic* guardian needs two-block confirmation over a continuously running process (that's `npm run live` on your PC). The cloud `/rescue` is a human pressing a button; it still refuses a healthy position, dry-runs every call, re-reads the chain right before broadcasting, and verifies the health factor moved afterwards. No secrets are ever in the client — the key only travels in the request header.

---

## 🧪 Chaos conditions table (what the storm actually proves)

| row | naive baseline | Ballast |
|---|---|---|
| price crash | ✗ — reacts to the first tick, gets the amount wrong | ✓ — confirmed across blocks, policy-clamped |
| would-be revert | ✗ — broadcasts a repay the wallet can't cover, burns gas | ✓ — dry-run blocks it first |
| nonce collision | ✗ — second tx wedges | ✓ — sequenced, idempotent |
| gas spike | ✗ — underpriced, stuck | ✓ — retries through it |
| RPC failure | ✗ — dead endpoint | ✓ — survives |
| MEV sandwich | ✗ — public mempool | `skip` (honest) — mainnet-only; Ballast verifies private routing is actually available before ever relying on it |

---

## 🔗 Repo map
```
guardian/src/
  keeperhub.ts    ← THE adapter boundary (Mock + Live KeeperHub) — the only file that knows KeeperHub
  trigger.ts      ← TriggerGate: two-block confirmation + emergency edge + stable episode ids
  rescue.ts       ← the money path (policy → analyst → guard → dry-run → TOCTOU → execute → verify)
  composer.ts     ← analyst + hostile-LLM schema validation
  policy.ts guard.ts workflows.ts aave.ts state.ts simulator.ts monitor.ts server.ts cli.ts
guardian/scripts/ ← live helpers (build position, check balances, verify creds)
ballast/          ← Next.js instrument (reads engine state only)
```
