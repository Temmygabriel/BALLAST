# PROGRESS — Ballast (KeeperHub Agent Economy hackathon)

> Simple running log. Updated every session so you (and your future self) always know where things stand.

**Today's date:** 2026-09-04
**Build window:** Sep 6–18 · **Submit by:** Sep 18, 12:00 CEST
**Repo:** https://github.com/Temmygabriel/BALLAST

---

## What we're building (the 30-second version)

A **liquidation guardian** called **Ballast**. If someone has a loan on Aave and the price crashes,
their loan can get "liquidated" (they lose money). Ballast watches their "health factor" (a safety
number) and, when it gets dangerously low, **rescues the position** by paying down the loan — using
**KeeperHub** to do it safely (checks the transaction first, avoids bots stealing money, retries if
the network is congested, keeps an audit log). The screen looks like a **ship's brass inclinometer**
(a tilt gauge) — the needle *is* the health factor. Safe = green, danger = red, rescue = needle
swings back to green.

Two parts:
- `guardian/` — the engine (TypeScript). Reads health factor, decides, tells KeeperHub what to do.
- `ballast/` — the screen (Next.js). Just *shows* what the engine is doing. Never talks to Aave/KeeperHub itself.

**Key rule:** only ONE file (`guardian/src/keeperhub.ts`) is allowed to talk to KeeperHub. Everything
else stays clean. This is what the judges want to see.

---

## Plan decisions (locked 2026-09-04)

1. Two packages in one repo: `guardian/` + `ballast/`. The engine sends live state to the screen
   over a tiny feed (SSE).
2. **Offline-first**: we build a fake KeeperHub + a simulator so the whole thing runs and demos on
   any laptop with **zero API keys**. Real live-money wiring is the documented next step.
3. 8 GB RAM PC → heavy builds/tests run in the **cloud (GitHub Actions)**. Local machine only runs
   light stuff.

---

## Task list & status

- [x] **Scaffold repo** (git, workspaces, root files) — done, pushed
- [x] **Guardian core** (aave/policy/guard/workflows/keeperhub adapter/composer/baseline/state)
- [x] **Live KeeperHub adapter** — aligned to the real KeeperHub surface (bare `abiFunction` +
      `functionArgs`, `simulate`, `idempotency_key`, status polling). Compile-tested + unit-tested.
      Still no live run (needs KeeperHub creds + funded testnet wallet → documented next step).
- [x] **Simulator + monitor + SSE server + CLI** (offline chaos scenarios) — storm verified green
- [x] **Guardian tests** — 25/25 pass (policy, guard, workflows, rescue, keeperhub idempotency,
      storm integration: baseline fail rows → RESCUED @ HF 1.300)
- [x] **Ballast screen** — built, typecheck clean, dev server 200, **15/15 headless render checks
      pass**. Pushed (commit `cba2796`). Not yet eyeballed in a real browser.
- [ ] **End-to-end demo + README** (README is still a stub)
- [ ] **Foundry install attempt** (best-effort; for real chain-fork chaos later)
- [ ] **GitHub Actions CI** (so tests+build run in the cloud, not your PC)
- [ ] **Real-browser visual pass** on the Ballast gauge (needle zones, storm, rescue swing)
- [ ] **🚀 Cloud engine on Vercel** — engine riding inside the app at `/api/guardian`, so the
      deployed link is LIVE for anyone (no localhost). IN PROGRESS.
- [ ] **🔐 Security-hardening addendum** (`ballast-security-hardening.md` arrived) — P0/P1 items
      queued: stable per-episode idempotency key, tick in-flight lock, pre-execution
      revalidation, post-execution HF verify, two-block confirmation, MEV claim softening,
      LLM output schema validation, README claim fixes, extra chaos rows.

## Log

### 2026-09-04 — Session start
- Read both spec files (`keeperhub-integration-research.md`, `ballast-design-spec.md`).
- Made a build plan (approved). Locked decisions above.
- Checked your PC: Node v24 + git work. No `gh` CLI, no pnpm, no Foundry yet.
- Found your GitHub repo `Temmygabriel/BALLAST` exists and is empty (reachable).
- Wrote memory notes about you + the project.

### 2026-09-04 — Guardian engine green offline 🎉
- Built all guardian modules: config, aave, policy, guard, workflows, composer (+deterministic
  fallback + optional DeepSeek), baseline (naive failure reasons), state, MockKeeperHub, live
  adapter skeleton, rescue, simulator, monitor, SSE server, CLI.
- Root monorepo scaffolded (npm workspaces guardian + ballast). npm registry on this PC is
  broken locally → every install uses `--registry=https://registry.npmjs.org/`.
- **Found + fixed a real bug**: token "units" were mixed up (raw 6-decimal amounts vs whole
  USDC). $500 wallet was treated as 500 *raw units* (≈ nothing), so the real ~$62 rescue was
  dry-run-BLOCKED and the storm ended FOUNDERED. Fix: everything is raw units now — config
  `defaultsRisk(maxUsd, decimals)` scales by 10^decimals, monitor/sim scale MAX_REPAY_UNITS,
  mock `wouldRevert` compares against `500 × 10^decimals`. Typecheck clean.
- **`npm run storm` verified end-to-end**: drift HF 1.293 → 1.029 (into red) → all 4 offline
  chaos rows resolve **baseline ✗ / ballast ✓** (MEV honestly = mainnet-only skip) → rescue
  dry-runs clean, approve+repay land → **status RESCUED, HF back to 1.300** (target). tick 45.
- `git init -b main`, first commit, **pushed to GitHub** (remote set, branch main tracking).

### 2026-09-04 — Guardian tests green + live-adapter alignment + Ballast screen 🎨
- Wrote 6 test files, **25/25 pass**: policy, guard, workflows, rescue (rationale reaches the
  UI — test caught it dropping), keeperhub (idempotency key reuse), storm integration.
- Re-ran KeeperHub introspection; aligned `keeperhub.ts` + `workflows.ts` to the **real** field
  names (`abiFunction` bare fn name + `functionArgs` array-as-string; workflow nodes
  `web3/read-contract` etc.). Compile + unit tested (no live creds yet).
- **Built the whole Ballast screen**: ship-brass SVG inclinometer (danger/amber/safe zone arcs),
  needle swings via CSS ~760ms (reduced-motion → jump), status plate with big status word
  (STEADY/LISTING/CAPSIZING/RESCUED/FOUNDERED), HF readout + thresholds line, analyst rationale,
  audit link, telemetry strip, Storm Mode conditions table (naive fail / ballast pass / skip +
  mainnet-only flag), Ship's Log (auto-scroll), Dev Deck scenario buttons, offline "BRIDGE DARK"
  plate, Space Grotesk + JetBrains Mono.
- Verified: `npm run typecheck` clean; dev server 200 SSR with BRIDGE DARK; **15/15 headless
  render checks pass** (`ballast/scratch/render-check.tsx`, no browser needed). Both live
  servers confirmed earlier: guardian SSE on :4300 (idle HF 1.3333) + ballast dev :3000.
- Ballast typecheck made fresh-clone-safe (`next typegen && tsc`).
- **Committed + pushed** as `cba2796` (26 files, +2175). Repo now has the full offline-green
  product + tests + UI.

### 2026-09-04 — Deploy day: Vercel live + security review arrives 🚀🔐
- You deployed Ballast to Vercel on your own: **https://ballast-green.vercel.app** (auto-deploys
  from GitHub `main`). It showed "BRIDGE DARK / engine not answering" — CORRECT behaviour:
  the screen is a window and the engine only existed on your PC, so the internet had nothing
  to connect to. That's the app being honest, not glitching.
- **Decision: put the engine INSIDE the Vercel app** (one repo → one deploy, no second host,
  no localhost). Work in progress:
  - Guardian exposed as an importable package (`guardian/src/index.ts` + `main`), `viem` made
    lazy so the cloud demo stays light; Next `transpilePackages: ['guardian']`.
  - New API route `ballast/app/api/guardian/[...path]/route.ts` runs the SIM engine server-side:
    `GET /state`, `GET /events` (SSE), `POST /scenario` (awaited to completion, returns final
    state so the rescue lands even across serverless instances).
  - Hook auto-detects: deployed → same-origin `/api/guardian` (polling, serverless-friendly);
    on your PC → standalone guardian :4300 (SSE). DevDeck adopts the POST's final state.
- New spec file **`ballast-security-hardening.md`** (read, mapped to code, queued as task #13).
  Also noted: `ballast-security-gameability-review.md` exists as the fuller review it came from.
- npm reinstall ran (new `guardian` workspace dep) — done, exit 0.

### Next up
- **Finish + verify the Vercel cloud engine** (typecheck/build → local smoke of `/api/guardian`
  → push → Vercel auto-redeploys → I fetch the public URL to confirm it's live). Then YOU press
  "Run the full storm" on the deployed page.
- **Apply security hardening** (task #13, P0 first) with all 25 tests still green.
- Write the README, GitHub Actions CI, Foundry attempt, real live-wiring (post-creds).
