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
- [ ] **Live KeeperHub adapter** + re-run read-only discovery against real KeeperHub API
- [x] **Simulator + monitor + SSE server + CLI** (offline chaos scenarios) — storm verified green
- [ ] **Guardian tests** (should all pass)
- [ ] **Ballast screen** (gauge UI, storm table, rescue animation, ship's log)
- [ ] **End-to-end demo + README**
- [ ] **Foundry install attempt** (best-effort; for real chain-fork chaos later)
- [ ] **GitHub Actions CI** (so tests+build run in the cloud, not your PC)

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

### Next up
- Guardian tests (policy/guard/workflows + a storm integration test asserting RESCUED).
- Ballast screen: brass inclinometer gauge, status words, storm conditions table, ~700ms
  rescue swing, ship's log, SSE hook. (The visible demo!)
- Retry KeeperHub read-only introspection for the live adapter + bounty-PR ideas.
