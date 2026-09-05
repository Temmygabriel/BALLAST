# PROGRESS — Ballast (KeeperHub Agent Economy hackathon)

> Simple running log. Updated every session so you (and your future self) always know where things stand.

**Today's date:** 2026-09-05
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
- [x] **🚀 Cloud engine on Vercel** — engine riding inside the app at `/api/guardian`. VERIFIED
      LIVE: a full storm POSTed to the public URL landed **RESCUED @ HF 1.30**, all chaos rows
      baseline fail / ballast pass. (Build had failed: `vercel.json` `rootDirectory` was rejected
      by Vercel's schema — deleted the file; Root Directory was already set in the dashboard.)
- [ ] **🔐 Security-hardening addendum** (`ballast-security-hardening.md`) — FIRST TRANCHE
      CODED LOCALLY (not yet committed/pushed): `src/trigger.ts` TriggerGate (two-block
      confirmation + explicit emergency bypass, stable episode id), stable per-episode
      idempotency keys + TOCTOU re-validation + post-execution HF verify + private-routing
      fail-closed in `rescue.ts`, LLM output schema validation in `composer.ts`, sim AND live
      monitor wired through the gate (`simulator.ts`, `monitor.ts`, `aave.ts` block read).
      Typecheck clean. **Deferred by the user until live mode works** — remaining: extra
      hardening tests, `price-blip` scenario dispatch (cli/route/DevDeck), README claim fixes.
- [x] **🔌 LIVE RESCUE LANDED on real Sepolia via KeeperHub** 🎉 (2026-09-05) — real Aave v3
      position built near-liquidation (HF **1.0417**), `npm run live` confirmed it across two
      blocks and repaid ~$6.93 USDC through KeeperHub to bring the position back to the 1.30
      target — **HF 1.0417 → 1.3000 verified on-chain**. Guardian's own executions:
      approve `9j2pfnljbb7wtykao04gx` → `0xe877cdffe2e254655b24f2f09d38db9444e541ce2e15c7b4e13091050f695dfe`;
      **repay `sxux4wnpqqs1wc1eolzzk` → `0xe3f9c6c682eea3b11549bac90f2131806eea5b9b80e07f6692bb1719b96d1c3f`**
      (block 11637895, `from` = KeeperHub sponsored relayer `0xa17cb6…`). Two env.ts bugs found
      + fixed live (fileURLToPath %20 + inline-comment stripping); keeperhub.ts adapter bug fixed
      (MCP returns `content[0].text` JSON, no `structuredContent`; real execute returns
      `executionId/status/transactionHash/transactionLink`, `status:"completed"` immediately,
      `sponsored:true`).

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

### 2026-09-04 — Cloud engine LIVE on Vercel 🎉
- First cloud-engine deploy (commit `1aa4561`) **failed on Vercel**: `vercel.json` at repo root
  had `rootDirectory: "ballast"`, which Vercel's schema rejected ("should NOT have additional
  property `rootDirectory`") → every build aborted before compiling. Root cause: the project's
  Root Directory was **already set to `ballast` in the Vercel dashboard** from the original
  deploy, so the file was redundant AND fatal.
- Fix: deleted `vercel.json` (commit `5b28884`). Redeploy went **green**.
- **Verified live on https://ballast-green.vercel.app**: `GET /api/guardian/state` →
  STEADY HF 1.3333, engine sim; **POST /api/guardian/scenario {name:storm} → RESCUED @
  HF 1.2999, tick 45**, all 4 chaos rows baseline fail / ballast pass, MEV honestly skip,
  keeper log shows dry-run → approve → repay → RESCUED. The deployed page now shows a real
  engine (no BRIDGE DARK).
- Honest caveat (by design): Vercel serverless = in-memory sim state lives per warm instance;
  a cold start returns to a fresh STEADY bridge. Fine for a demo, and the screen never lies.

### 2026-09-04 — Security hardening first tranche coded + LIVE wiring begun 🔐🔌
- **Hardening (task #13) first tranche coded locally** (typecheck clean, NOT yet committed):
  new `guardian/src/trigger.ts` (TriggerGate — a rescue needs TWO low reads on DIFFERENT
  blocks to fire, below `EMERGENCY_HF` it acts now; episode id anchored to the first low
  block, reused for every retry so KeeperHub idempotency keys stay stable);
  `rescue.ts` fully rewritten (per-episode keys `${episodeId}::i::fingerprint`, TOCTOU
  re-read + `rescueStillValid` before each broadcast, post-execution HF verification with
  a loud ⚠ when a confirmed tx did NOT improve the position, private-routing check that
  fails CLOSED when an action requires privacy); `composer.ts` now runs every analyst reply
  (incl. the LLM) through `validateAnalystReply` (rejects unexpected fields / amounts above
  policy / bad addresses; rationale display-only); `keeperhub.ts` + types gain
  `supportsPrivateRouting`. Simulator + live monitor both wired through the gate with a
  virtual/live block per observation; `aave.ts` live source can now read the block number.
- **User redirected: get LIVE working first, finish hardening after.** So live wiring began.
- **Local Sepolia wallet created offline** (`guardian/scripts/new-wallet.mjs`):
  **`0x2DcA7aDD570F2E2D81fE86098B51128bC528bC15`** — private key saved only in
  `guardian/.env` (gitignored). Script reusable; never stores a key if one exists.
- **`guardian/.env` filled**: RPC_URL (Alchemy — user first pasted the MAINNET endpoint,
  I fixed it to `eth-sepolia`; same key, network lives in the URL path), CHAIN_ID 11155111,
  AAVE_POOL `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` + Circle USDC
  `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (both VERIFIED via web, 2026-09-04),
  PROTECTED_WALLET, KEEPERHUB_MCP_URL=`https://app.keeperhub.com/mcp` +
  KEEPERHUB_API_KEY=`kh_…`. DeepSeek still blank (deterministic fallback is fine).
- **Funds confirmed on-chain** (`guardian/scripts/check-balances.mjs`, read-only public
  RPC): protected wallet **0.02 ETH + 20 USDC**; KeeperHub execution wallet
  **0x851a05FA306080Fd6bA9D961BDf9DD6cca29CA32 has 0 USDC** (needs test USDC before a
  real repay demo).
- **Creds verified end-to-end** (`guardian/scripts/verify-live.mjs`, connects exactly like
  LiveKeeperHub): RPC reads Sepolia **block #11,634,500** + wallet balance; **kh_ key
  connects to the KeeperHub MCP — 44 tools**. So `guardian live` should just work.
- **KeeperHub org state (this chat's MCP)**: re-authorized after token expiry. Org has ONE
  web3 wallet integration = the execution wallet above. Balance-read actions
  (`web3/check-balance`) are NOT directly executable (501 → need a workflow), hence the
  local public-RPC checker.
- Architecture note (answering "shouldn't this be in Vercel?"): the deployed Vercel app
  stays the SIM demo (safe, keyless, judge-proof). guardian/.env drives the REAL guardian
  running locally (`npm run live`). Vercel env vars (dashboard) + a code switch would be a
  separate "cloud-live" step; serverless isn't a great home for an always-on watcher.

### Next up
1. **Finish security hardening** (task #13): add the new tests (trigger gate, blip no-rescue,
   TOCTOU abort, post-exec flag, hostile-LLM fallback, private-routing fail-closed,
   idempotent retry), wire `price-blip` into cli/route/DevDeck, run full tests + typecheck,
   fix README claims, then commit+push. (README/`PROGRESS.md` live-rescue claims must reflect
   the landed tx.)
2. Write README (#10) with the REAL audit trail above, GitHub Actions CI (#11), Foundry
   attempt (#8), real-browser pass (#9).
3. Optional flourish: re-run the demo in fresh form — the position is currently healthy at
   HF 1.30 after the rescue, so build-position (now a no-op, already supplied/borrowed) needs a
   fresh borrow to create a new near-liquidation episode if we want to re-film the rescue.

### 2026-09-05 — 🎉 LIVE RESCUE LANDED: real USDC moved through KeeperHub
- **Built a real, near-liquidation Aave v3 position** (`guardian/scripts/build-position.mjs`)
  on the protected wallet `0x2DcA7a…`: wrapped 0.011 ETH → the pool's LISTED WETH
  `0xc558db…`, supplied it as collateral (~$44), borrowed the pool's LISTED USDC
  `0x94a9d9…` (NOT Circle's `0x1c7D4B…` — probe proved the difference) near the LTV cap
  → **HF 1.0417** (under the 1.05 action line, over the 1.01 emergency line). Funded the
  KeeperHub execution wallet `0x851a05…` with **8,656,155 raw listed USDC (~$8.66)**.
- **Ran `npm run live`** — it read HF 1.042, confirmed across two blocks (episode
  `ballast-0x2DcA7a-11637891`), and landed the rescue through KeeperHub.
- **Verified on-chain after:** collateral $44.00 (untouched) · debt $34.85 → **$27.92** ·
  **HF 1.0417 → 1.3000** (exactly the guardian's target). Repay receipt status success,
  block 11637895, `from` 0xa17cb6… = KeeperHub's **sponsored relayer** (`sponsored:true`).
- **Full KeeperHub audit trail** (via `list_executions`, org log):
  | step | execution id | tx |
  |---|---|---|
  | approve (pre-check) | `3f4h6npzai3vxlzs1ea05` | `0x3ea20dca…1858cb2` |
  | approve (guardian)  | `9j2pfnljbb7wtykao04gx` | `0xe877cdff…695dfe` |
  | repay (the rescue)  | `sxux4wnpqqs1wc1eolzzk` | `0xe3f9c6c6…96d1c3f` |
- **Root cause of the original live failure — KeeperHub MCP response shape**: the raw
  `callTool` reply has NO `structuredContent`; the real payload is JSON inside
  `content[0].text`. `LiveKeeperHub.call` returned the wrapper, so every `r.success` was
  undefined → every real call looked like it reverted ("dry-run blocked"). Fixed the adapter
  to JSON-parse `content[].text`. Debug proof kept at `guardian/scripts/mcp-call-debug.mjs`.
- **Two more live-found env.ts bugs**: `import.meta.url` `.pathname` keeps `%20` (repo folder
  has a space → .env silently unread) → now `fileURLToPath`; inline comments after values
  (`KEY=value  # note`) broke numeric parsing (NaN) → now stripped.
- **Real execute response fields** (debug script `mcp-exec-debug.mjs`): returns
  `{executionId, status, transactionHash, transactionLink}` with `status:"completed"`
  immediately; `get_direct_execution_status` adds `receipts[].verified:true` +
  `sponsored:true`. Adapter `auditUrl` now maps `transactionLink`.
- **Background-tasks gotcha**: `TaskStop` on `npm run live` orphaned the `tsx` child holding
  port 4300 → next start died `EADDRINUSE`. Killed the orphan (PowerShell
  `Get-NetTCPConnection -LocalPort 4300`) before restarting.
- Guardian process still watching (position now healthy → STEADY); repo work uncommitted
  (env.ts/keeperhub.ts fixes + these scripts) — commit after the hardening tranche.
