# KeeperHub "Agent Economy" Hackathon — Integration Target Research & Winning Strategy

**Prepared:** 2026-09-03 · **Event:** KeeperHub — *The Agent Economy Hackathon* (DoraHacks, 2nd edition)
**Build phase:** Sep 6–18, 2026 · **Submissions close:** Sep 18, 12:00 CEST · **Judging:** Sep 18–25 · **Winners:** Sep 24/25
**Prize:** $5,000 stablecoins — Main track $4,000 ranked (1st $2,000 / 2nd $1,200 / 3rd $800); Bounty $1,000 (2× $500, stackable)

> This document is sourced research + strategy. Read the TL;DR, then the strategy section, then the ranked picks. Feasibility notes are quarantined in the appendix so they don't bias the merit ranking (per the original brief's intent). Sources are listed at the end.

---

## TL;DR — the one-paragraph answer

You cannot reliably **out-pick** a field of 150+ AI-assisted entrants (everyone's model converges on the same "smart" targets). You *can* out-**execute** them, because the rubric rewards two things almost nobody builds: **real value actually moving through KeeperHub**, and **surviving the non-happy-path**. So: pick a **specific, live, high-trust project where money gets *lost* when execution goes wrong**, and make KeeperHub the safety-critical execution layer. My #1 recommendation is a **liquidation-protection "guardian" for a top lending protocol (Aave or Morpho)** — a health-factor brain that triggers KeeperHub to deleverage/repay a real position, showcasing dry-run, private routing (anti-MEV), retries and the audit trail exactly when they matter. It's coherent (KeeperHub is the *hands*, the monitor is the *brain*), demoable live (drop the price on a fork, watch it rescue), useful to real users, and carries a migration tailwind (this feature class ran on Gelato Functions, which **died March 31, 2026**). Then **stack the $1,000 bounty** by shipping the missing trigger/action as a PR. Build the **"chaos test"** harness as the spine of every demo.

---

## 1. The strategic problem you correctly identified (the "paradox")

You said it yourself: everyone is asking an AI to find the "best/most unique" target, so the answers converge. This is a **Keynesian beauty contest**. The naive fix — telling the model "avoid the obvious pick" — *also* converges, because every sharp competitor tells their model the same thing. The field lurches from the hot name to the same "smart contrarian" name in unison. Contrarianism doesn't escape the trap; it relocates it.

**The escape is to stop competing on the converging axis.**

| Axis | Converging? | Why | Your move |
|---|---|---|---|
| **Target choice** | ✅ Yes | Shared model priors → clustered answers | De-correlate *just enough*; don't overpay for it |
| **"Cool" agent reasoning** | ✅ Yes | Everyone demos a clever LLM loop | Not where points are |
| **Integration depth into a *specific named* project** | ❌ No | Depends on your effort against a real API/contract | **Compete here** |
| **Real value moved + visible tx** | ❌ No | Requires real wiring, not a mock | **Compete here** |
| **Survives non-happy-path (reliability/observability)** | ❌ No | Requires deliberately engineering for failure | **Compete here — biggest gap** |
| **Live-runnable build that survives Q&A** | ❌ No | The finalist panel is live, not slides | **Compete here** |

Three of the five rubric lines (below) live on the **non-converging** side. That's the whole game.

### The judging rubric (authoritative — main track)
1. **Integration depth** — real, *named* project on the other side; integration *specific to it* (not a generic wrapper).
2. **Execution through KeeperHub** — did value *actually move*, and can they *see it*? (tx link required)
3. **Reliability & observability** — does it survive conditions that are **not the happy path**?
4. **Usefulness & originality** — does it solve something real for *users of the integrated project*?
5. **Developer experience & code quality** — could another team pick it up?

**Design implication:** pick a target where lines 2, 3, and 4 are *maximized by construction* — i.e., a domain where value movement is real, failure is expensive, and the users are identifiable.

---

## 2. What KeeperHub actually is (and what the sponsor wants amplified)

KeeperHub is **the execution / reliability layer for onchain agents** — the "**Onchain Hand**." Its own thesis (from the brief): *agents are probabilistic; moving money is unforgiving; KeeperHub removes reinterpretation.* The canonical flow it wants to show off:

> agent composes a workflow via **MCP** → **you review** → **dry-run without touching the chain** → the *exact* workflow executes. **Nothing is inferred at execution time.**

Underneath: **nonce management, Smart Gas Estimation, private routing vs MEV, retries with exponential backoff, non-custodial wallets via Turnkey, full audit trail.** Open source, SLA-backed, **20+ protocols across 20+ networks** (Aave, Morpho, Compound, Curve, Uniswap, Pendle, Lido, Sky, etc.). The team has run production keepers for 7+ years and **runs Sky Protocol's (ex-MakerDAO) keepers today**.

**Sponsor-alignment read:** they want a submission that *dramatizes determinism + review + dry-run + auditable execution as the antidote to a probabilistic agent about to do something dangerous with real funds.* A build that makes those six features the **hero** — not incidental plumbing — is the story they want to put their name on. This is also what wins the *feature bounty* if you contribute back.

> **Coherence filter (use ruthlessly):** KeeperHub is *hands*. The **worst** targets are other *hands* (execution/automation infra — you'd be redundant/forced). The **best** targets are strong *brains with weak/naive hands*: projects that decide well but broadcast crudely, or whose users get hurt when execution fails.

---

## 3. Saturation map — what the herd will build (and you should avoid as your *identity*)

Predicted crowded lanes among ~150–190 submissions (route around these, or if you touch one, make it the *engine* not the *identity*):

1. **Generic "DeFi yield/rebalance agent" that swaps via KeeperHub.** Most crowded; fails rubric line 1 ("generic wrapper," no specific named project).
2. **ElizaOS / LangChain / CrewAI / AgentKit plugin or connector.** Crowded *and* structurally weak for the **main track** (it's a wrapper, not an integration into a live project moving value). → Better used as the *bounty* PR, or as the brain feeding a specific-project integration.
3. **Wayfinder / Almanak / Daydreams** builds. Named in the brief → maximally copied. (See §5 for why they're also *coherence-weak*.)
4. **x402 "pay-per-execution" demo.** A named surface → moderately crowded; thin on "value moved into a live project."
5. **Telegram/Discord "chat-to-trade" bot.** Generic, no specific named counterparty.

**Rule:** if your one-line pitch could be pasted onto 20 other submissions by swapping a logo, it's in a crowded lane.

---

## 4. The recommendations (ranked on merit)

### 🥇 #1 — Liquidation-protection **Guardian** for a top lending protocol (Aave **or** Morpho)

**One-liner:** "A guardian that watches a real Aave/Morpho position's health factor and, when a crash threatens liquidation, uses KeeperHub to deterministically repay/deleverage — dry-run first, routed privately so it isn't front-run, retried through the gas spike, every step audited."

**Why it wins on every rubric line:**
- **Integration depth (1):** the other side is **Aave** or **Morpho** — unambiguously live, huge TVL, real users, well-documented contracts already in KeeperHub's 20+ protocol set. The logic is *specific* to the protocol's health-factor / collateral mechanics, not a wrapper.
- **Execution through KeeperHub (2):** the rescue is a *real* value-moving tx (repay debt / withdraw-and-swap collateral / migrate position). Easy to produce a visible mainnet-or-testnet tx link.
- **Reliability & observability (3) — your moat:** liquidations cluster *exactly* when gas spikes and the mempool is adversarial. This is the one build where dry-run, **private routing (so your rescue isn't sandwiched)**, retries-with-backoff, nonce handling and the audit trail are *the point*, not decoration.
- **Usefulness & originality (4):** getting liquidated is a top-tier real user pain. A working guardian solves it for actual Aave/Morpho users. Originality: most entrants chase upside (yield); you're protecting downside, where execution reliability is life-or-death.
- **DX & code quality (5):** clean, adoptable, obviously mergeable pattern.

**Narrative multiplier (migration tailwind):** this exact feature class ("liquidation protection," e.g. Instadapp) historically ran on **Gelato Web3 Functions — which reached end-of-life March 31, 2026** — and **OpenZeppelin Defender sunsets July 1, 2026**. KeeperHub is publicly positioning as the successor and runs a Gelato migration path. So you can frame it as *"the safety automation that went dark this year, rebuilt on KeeperHub"* — coherent, timely, and exactly the story the sponsor is telling.

**Killer live demo (built for the panel):** on a mainnet fork, open a leveraged position → **drop the collateral price** → the guardian detects health factor < threshold → KeeperHub **dry-runs** the rescue (show it *not* touching chain) → executes via **private route** → you show the **audit trail** (trigger → simulation → tx → gas → outcome). Then judges ask *"what if gas 10×'s / the tx reverts / the oracle lags?"* — and you trigger each live (see §6). That Q&A is where finalists separate; you'll have answers *running*, not on a slide.

**KeeperHub surfaces used:** MCP (agent-authored workflow) + dry-run + private routing + audit trail + CLI for the harness. Hits the form question perfectly.

---

### 🥈 #2 — "Detector → Responder" safety loop (generalize #1 beyond lending)

**One-liner:** a monitoring *brain* (oracle-deviation, position risk, or an exploit/anomaly signal à la a sentinel agent) triggers KeeperHub to execute a **protective** action — pause exposure, exit an LP, top up collateral, hedge — with dry-run + private routing + audit.

**Why it's strong:** monitors are *pure brains with no hands* → zero redundancy with KeeperHub; clean coherence. Non-happy-path is intrinsic (it *is* the emergency path). Highly demoable and original.
**Why it's #2 not #1:** you must anchor it to a **specific named live project** to score rubric line 1 (e.g., "protect a live **Morpho** vault," or "auto-exit a specific **Aerodrome/Uniswap** LP on volatility"). #1 is the sharpest concrete instance; this is the template if you want a different protocol.

---

### 🥉 #3 — Olas / Pearl strategy → KeeperHub execution backend

**One-liner:** take a *live, real-usage* Olas agent (e.g., **Polystrat** for Polymarket, **Optimus**, or a **BabyDegen** Base strategy) and route its **execution** through KeeperHub for reliability/anti-MEV/audit, keeping Olas as the decision brain.

**Why it's credible:** Olas/Pearl is unambiguously live — **~18.7M cumulative agent transactions across 8 chains** (as of Aug 8, 2026), real staked users, and it *isn't* one of the three named examples. Bonus novelty: **"Pearl Connect"** already gives coding agents their own wallet → a clean **MCP-to-MCP** story (Pearl + KeeperHub).
**Watch-outs:** Olas agents self-custody and sign **locally** (they have *some* hands), so you must frame KeeperHub as the *reliability upgrade* (retries/gas/private routing/audit a local agent lacks), or you risk the "redundant hands" critique. Feasibility is medium (wiring a real Olas strategy in 12 days).

---

### #4 (dark horse) — Migration rescue of a stranded Gelato/Defender job for a live protocol

**One-liner:** rebuild a real, currently-needed automation that used to run on **Gelato Web3 Functions** (offline since Mar 31, 2026) as a **KeeperHub workflow**, executing the real job.

**Documented historical Gelato users to investigate** (verify which still need this — see appendix): **Beefy** (auto-compounding vaults), **Instadapp** (liquidation protection — overlaps with #1), **PancakeSwap / QuickSwap / SpookySwap / SpiritSwap** (limit orders), **Abracadabra** (oracle/TWAP updates), **MakerDAO/Sky** (debt-ceiling updates), **Connext** (gasless claims), **Arrakis/G-UNI** (LP management).
**Why it's compelling:** maximum coherence (KeeperHub is the literal successor; sponsor-blessed), timely, real value, non-happy-path is the whole point, and *nobody else will think "migration."*
**Why it's #4 not higher:** you must confirm a target's automation is *actually* stranded/wanted right now (some migrated already), and frame it as an *integration that benefits a live project* rather than pure infra plumbing. The strongest version basically **collapses into #1** (Instadapp/Aave liquidation protection).

---

### ⛔ Avoid as main-track *identity* (coherence-weak or saturated)
- **Giza (ARMA), HeyAnon, Almanak:** strong brains that **already own robust execution** (Giza's decentralized execution network + session-key smart accounts; Almanak's Safe + gRPC gateway; HeyAnon's solver network). KeeperHub is **redundant/forced** → weak on line 1's "specific gap." Also higher saturation/known.
- **Wayfinder, Daydreams:** named in the brief → most-copied; Daydreams has pivoted toward *commerce/payments* (Lucid Agents, x402/ERC-8004), so if you *must* touch it, the only coherent angle is payments — still crowded.
- **Other execution/automation layers** (Gelato, Enso, Brahma/ConsoleKit, Orbs' agentic execution layer, Mimic, Singularry): other *hands* → redundant/competitive. Don't.

---

## 5. Coherence verdicts on the three named examples (so you can defend the choice)

| Project | Brain or Hands? | Does KeeperHub fill a *real* gap? | Verdict |
|---|---|---|---|
| **Wayfinder** (Parallel Studios, PROMPT token) | Brain + its own "Paths/Shells" execution; token + Revolut listing = high hype | Partial; it navigates/executes itself | **Saturated + semi-redundant.** Avoid unless you find a specific naive-execution seam. |
| **Almanak** (agentic hedge fund, Python SDK) | Strong brain; **non-custodial execution via Safe + gRPC gateway already** | Weak — it has disciplined hands | **Coherence-weak + named.** Skip. |
| **Daydreams** (TS agent framework → commerce) | Framework/brain; pivoted to payments (x402, ERC-8004) | Only via payments rail | **Named + narrow fit.** Skip unless payments-specific. |

None of the three is a strong *merit* pick; they're in the brief precisely because they're the obvious ones. Naming them = fishing where everyone fishes.

---

## 6. The universal winning layer — the **"Chaos Test"** (build this regardless of target)

This is the single highest-leverage, least-crowded thing you can ship. It directly maxes rubric lines **2 & 3** and *is* the sponsor's narrative. It's also your live-panel insurance.

Build a small harness that **deliberately triggers the failure modes KeeperHub is built for**, and show KeeperHub surviving each with the audit trail as proof, **side-by-side against a naive `eth_sendTransaction` baseline that fails**:

| Failure injected | Naive agent | KeeperHub (shown surviving) |
|---|---|---|
| **Nonce collision / stuck tx** | wedged | nonce mgmt + retry resolves |
| **Gas spike / congestion** | underpriced, stuck | Smart Gas + exponential backoff lands it |
| **Would-be revert** | burns gas, reverts | **dry-run** catches it *before* broadcast |
| **MEV / sandwich attempt** | value extracted | **private routing** — never hits public mempool |
| **RPC failure** | dead | multi-RPC failover |
| **Every step** | opaque | full **audit trail**: trigger → sim → tx → gas → outcome |

Record the before/after as your demo video; run it live in the panel. Almost no other team will show the unhappy path — most demos are happy-path theater. **This is your differentiation made tangible.**

---

## 7. The double-prize play — win the $1,000 bounty *too*

The **Best KeeperHub Feature** bounty ($1,000, only **2 winners**, judged on mergeability/value/tests/scope) **stacks** with the main track (separate BUIDL). It's far less crowded than the main track and directly in your path:

Whatever you build in #1–#4, you'll need a KeeperHub primitive it doesn't have yet. **Extract it as a clean PR:**
- a new **trigger** (e.g., *"health factor below X"* / *"oracle deviation > Y"*),
- a new **action / protocol node** (e.g., an Aave/Morpho repay-or-deleverage node, if missing),
- a **connector** (e.g., an ElizaOS/LangChain node for KeeperHub — the *only* place a generic connector is a strong play), or
- a **DX improvement** you genuinely hit during the build.

Design the integration so a reusable node/trigger *falls out naturally*, then submit it as the bounty BUIDL with tests. High expected value for marginal extra work.

---

## 8. Recommended plan of attack (Sep 6–18)

1. **Lock the target (Day 0–1):** default to **#1 with Morpho *or* Aave**. Choose by which has (a) the cleanest health-factor read and (b) existing KeeperHub protocol coverage; whichever forces the *smallest* new KeeperHub primitive — and make that primitive your **bounty PR**.
2. **Skeleton the happy path first (Day 1–4):** monitor → dry-run → execute one real rescue tx via KeeperHub MCP. Get a **real tx link early** (rubric line 2 is binary — you either have it or you don't).
3. **Build the Chaos Test (Day 4–8):** the §6 harness. This is your moat and your panel demo.
4. **Extract the bounty PR (Day 6–9):** clean, tested, documented.
5. **Docs + demo video + write-up (Day 9–12):** README covers setup/architecture so "another team could pick it up" (line 5). In the form's *"what still breaks?"* question, be candid — the brief explicitly says candor has never hurt a submission.
6. **Rehearse the live run (ongoing):** you present the *working build*, not slides. Pre-load the fork, script the price-drop, be ready to trigger each failure mode on request.

**Submission checklist (incomplete = unjudged):** ✅ source code link ✅ demo video showing the integration working ✅ **link to a tx executed through KeeperHub**.

---

# PART II — Full Build Specification: **Aegis**, a liquidation-protection guardian on KeeperHub

> This is the complete plan to build the #1 recommendation. It is written so you can hand each numbered task to your coding assistant (**DeepSeek V4 Flash**, model id `deepseek-v4-flash`) and get working code back. §II.11 contains the ready-to-paste DeepSeek prompts. The KeeperHub API details here are **verified against docs.keeperhub.com (Sep 2026)** and isolated behind an **adapter boundary** (§II.7); the few remaining unknowns are in the **Day-0 checklist** (§II.13) — confirm those first and the rest of the code doesn't move.

## II.0 — What Aegis is, in one paragraph

**Aegis** watches a real position on a **live lending protocol (Aave v3, or Morpho as an alternative)** and, when a price move pushes that position toward liquidation, it uses **KeeperHub** to execute a deterministic rescue (repay debt and/or add collateral) — *dry-run first, routed privately so the rescue isn't front-run, retried through gas spikes, every step audited*. The probabilistic part (an LLM risk analyst powered by DeepSeek) only **proposes**; a deterministic **policy guard** clamps the proposal; **KeeperHub disposes**. That is the sponsor's own thesis ("nothing is inferred at execution time") turned into a product that protects real users' money.

**Scope:**
- **MVP (must ship):** monitor one Aave v3 position's health factor → on breach, build a `repay` workflow → KeeperHub **dry-run** → **execute** → capture tx hash + audit link. Plus the **naive baseline** that fails, for contrast.
- **Core (target):** the **Chaos Test** harness (§II.8) — the differentiator. LLM rationale via DeepSeek. Clean README.
- **Stretch (if time):** full **deleverage** (withdraw collateral → swap on a DEX → repay) as a multi-step workflow; a KeeperHub-native scheduled workflow variant; the **bounty PR** (§II.10).

## II.1 — Architecture

```
                    ┌──────────────────────────────────────────────────┐
   Aave v3 / Morpho │                 AEGIS  (your build)                │
   (LIVE PROTOCOL)  │                                                    │
        ▲           │  Monitor (brain)          Composer (DeepSeek LLM)  │
        │ read HF   │  • poll getUserAccountData • explains the risk     │
        │           │  • detect HF < actHF ────► • PROPOSES params only  │
        │           │        │                          │               │
        │           │        ▼                          ▼               │
        │           │   Policy Guard  (deterministic: whitelist targets, │
        │           │                  clamp amount, enforce max slippage)│
        │           │        │                                           │
        │           │        ▼                                           │
        │           │   Workflow Builder ──► Workflow JSON               │
        │           │        │   (web3/write-contract: approve + repay)  │
        │           └────────┼───────────────────────────────────────────┘
        │                    │      MCP / REST / CLI  ◄── ADAPTER BOUNDARY (§II.7)
        │                    ▼
        │           ┌──────────────────────────────────────────────────┐
        │           │              KeeperHub  (the HAND)                 │
        │  rescue   │  dry-run → private routing → smart gas → retries → │
        │  tx lands │  nonce mgmt → Turnkey signs → FULL AUDIT TRAIL     │
        └───────────┴──────────────────────────────────────────────────┘
```

**Why this shape scores every rubric line:** the *other side is a named live protocol* (depth); the rescue is a *real value-moving tx* KeeperHub executes (execution + visible tx); the whole reason it exists is the *non-happy-path* (reliability); it *protects real Aave/Morpho users* (usefulness); the adapter + README make it *adoptable* (DX).

**Key de-risking insight:** you do **not** depend on KeeperHub shipping an "Aave node." KeeperHub's docs expose generic `web3/read-contract` and `web3/write-contract` nodes whose `abiFunction` field takes a plain name or a full signature (e.g. `repay(address,uint256,uint256,address)`). So Aegis composes the Aave calls itself and KeeperHub just executes them reliably. If a nicer Aave-specific node is missing, **that node is your bounty PR** (§II.10).

## II.2 — The winning narrative (say this in the pitch)

> "An autonomous agent watching your Aave position is *probabilistic* — you do not want a hallucination between your collateral and a liquidation. Aegis lets the agent **propose** a rescue, but the transaction that moves money is **deterministic and reviewed**: KeeperHub dry-runs it, routes it privately so it can't be sandwiched at the worst possible moment, retries it through the gas spike that *caused* the liquidation cascade, and writes the whole thing to an audit trail. Here it is surviving five failure modes live."

## II.3 — Tech stack & prerequisites

| Layer | Choice | Why |
|---|---|---|
| Language/runtime | **TypeScript + Node 20+** | global `fetch`, fast to build, best EVM libs |
| Chain reads/writes | **viem** | typed, ergonomic `readContract`/ABI |
| Fork & chaos | **Foundry** (`anvil`, `cast`, `forge`) | fork mainnet, impersonate, manipulate state |
| LLM (proposer) | **DeepSeek Flash v4** via OpenAI-compatible API (`https://api.deepseek.com`) | your chosen assistant *and* runtime proposer |
| Execution | **KeeperHub** (MCP / REST / CLI) | the Hand; dry-run, private routing, retries, audit |
| Package mgr | pnpm (or npm) | — |

**Accounts / keys to get on Day 0:** KeeperHub account + API key + non-custodial (Turnkey) wallet; an RPC endpoint (Alchemy/Infura) for mainnet + the testnet you'll use; a DeepSeek API key; a funded **testnet** wallet (Sepolia) and test USDC from the Aave faucet market.

**Where things run (be honest in the write-up):**
- **Real executed tx + audit link (required deliverable):** do this on **Sepolia Aave v3** (free, easy) — or a small **Ethereum-mainnet** rescue using **KeeperHub's mainnet gas sponsorship** for the strongest "real value + private routing" flourish.
- **Chaos Test / failure modes:** drive the **naive baseline** to fail on a local **anvil fork** (and testnet), and show **KeeperHub** handling the same conditions on testnet/mainnet. Private-routing/MEV is inherently a mainnet property — demo it with a small mainnet tx or show the KeeperHub audit record and explain; don't fake it on a fork.

## II.4 — Repository layout

```
aegis/
├─ package.json
├─ tsconfig.json
├─ .env.example
├─ README.md                  # setup + architecture (rubric line 5)
├─ src/
│  ├─ config.ts               # env parsing, addresses (per chain)
│  ├─ aave.ts                 # read HF, account data; Aave ABI
│  ├─ policy.ts               # deterministic risk policy + repay sizing
│  ├─ guard.ts                # POLICY GUARD: clamp/whitelist LLM output
│  ├─ workflows.ts            # build KeeperHub workflow JSON (approve+repay)
│  ├─ keeperhub.ts            # ADAPTER BOUNDARY (MCP/REST/CLI) — verify per docs
│  ├─ composer.ts             # DeepSeek proposer (rationale + params)
│  ├─ monitor.ts              # main loop: poll → detect → guard → dry-run → exec
│  └─ baseline.ts             # naive eth_sendTransaction (fails on purpose)
├─ chaos/
│  ├─ fork.sh                 # anvil fork + open a near-edge position
│  ├─ push-underwater.sh      # borrow-more / price-nudge to drop HF
│  ├─ nonce-collision.ts      # two txs, same nonce (baseline wedges)
│  ├─ gas-spike.sh            # anvil_setNextBlockBaseFeePerGas
│  └─ revert.ts               # repay with insufficient balance (dry-run catches)
├─ test/
│  ├─ policy.test.ts
│  └─ guard.test.ts
└─ scripts/
   └─ demo.ts                 # scripted end-to-end for the video/panel
```

## II.5 — Environment (`.env.example`)

```bash
# --- Chain ---
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/XXXX     # execution chain read endpoint
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/XXXX  # for fork/chaos
CHAIN_ID=11155111                                     # 11155111 Sepolia | 1 mainnet

# --- Aave v3 (VERIFY per chain via Aave Address Book / docs) ---
AAVE_POOL=0x...                                       # Aave v3 Pool for CHAIN_ID
DEBT_ASSET=0x...                                      # e.g. test USDC (the borrowed asset)
DEBT_ASSET_DECIMALS=6
PROTECTED_WALLET=0x...                                # the Turnkey/KeeperHub wallet holding the position

# --- Risk policy ---
POLL_MS=12000
WARN_HF=1.15
ACT_HF=1.05
TARGET_HF=1.30
MAX_REPAY_UNITS=1000                                  # hard cap the guard enforces (in DEBT_ASSET units)

# --- KeeperHub (VERIFIED against docs.keeperhub.com — see §II.13) ---
KEEPERHUB_MCP_URL=https://...                         # MCP server URL (from the docs quickstart / app.keeperhub.com)
KEEPERHUB_API_KEY=kh_...                              # Organisation API key; sent as  Authorization: Bearer kh_...
# No KEEPERHUB_WALLET_ID: writes use your account's Turnkey wallet integration (no per-call walletId).

# --- DeepSeek (VERIFIED model id) ---
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com            # OpenAI- AND Anthropic-compatible; 1M context
DEEPSEEK_MODEL=deepseek-v4-flash                      # coding/agent-tuned. deepseek-v4-pro = heavier reasoning.
                                                      # (legacy deepseek-chat / deepseek-reasoner retired 2026-07-24)
```

## II.6 — Core code (the load-bearing modules)

These are correct enough to build on; hand the rest to DeepSeek with the prompts in §II.11.

**`src/aave.ts`** — read health factor from the live protocol:
```ts
import { createPublicClient, http } from 'viem';

export const poolAbi = [
  { type: 'function', name: 'getUserAccountData', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' }, // bps (1e4)
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },                // 1e18-scaled; <1e18 = liquidatable
    ] },
] as const;

export function createAave(rpcUrl: string, pool: `0x${string}`) {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return {
    async getAccountData(user: `0x${string}`) {
      const r = await client.readContract({ address: pool, abi: poolAbi,
        functionName: 'getUserAccountData', args: [user] });
      return { totalCollateralBase: r[0], totalDebtBase: r[1],
        liqThresholdBps: r[3], healthFactor: r[5] };
    },
  };
}
export const hf = (x: bigint) => Number(x) / 1e18;
```

**`src/policy.ts`** — deterministic sizing (no LLM in this path):
```ts
export interface Policy { warnHF: number; actHF: number; targetHF: number; }

// Repay needed (in base currency, Aave uses USD w/ 8 decimals) to reach targetHF.
// HF = (collateralBase * liqThresholdBps/1e4) / debtBase
// => debtBase_target = collateralBase * liqThresholdBps / (1e4 * targetHF)
export function repayBaseToTarget(collateralBase: bigint, liqThresholdBps: bigint,
  debtBase: bigint, targetHF: number): bigint {
  const denom = BigInt(Math.round(1e4 * targetHF));
  const targetDebt = (collateralBase * liqThresholdBps) / denom;
  return debtBase > targetDebt ? debtBase - targetDebt : 0n;
}
// For a stablecoin debt (~$1): tokenUnits ≈ repayBase / 10^(8 - DEBT_ASSET_DECIMALS).
```

**`src/guard.ts`** — the thesis in code (clamp the probabilistic proposal):
```ts
export interface Proposal { debtAsset: string; amountUnits: bigint; }
export function guard(p: Proposal, cfg: {
  allowedAssets: string[]; maxUnits: bigint;
}): Proposal {
  if (!cfg.allowedAssets.map(a => a.toLowerCase()).includes(p.debtAsset.toLowerCase()))
    throw new Error(`guard: asset ${p.debtAsset} not whitelisted`);
  const amountUnits = p.amountUnits > cfg.maxUnits ? cfg.maxUnits : p.amountUnits;
  if (amountUnits <= 0n) throw new Error('guard: non-positive amount');
  return { debtAsset: p.debtAsset, amountUnits };
}
```

**`src/workflows.ts`** — two builders: direct calls (MVP) and a persistent nodes+edges graph (depth). Both use KeeperHub's generic `web3/*` actions with a full-signature `abiFunction`, so no Aave-specific node is required:
```ts
import type { ContractCall } from './keeperhub';

// --- DIRECT path (MVP + live demo + the required tx): two calls, each simulate()d then execute()d ---
export function buildRepayCalls(o: {
  network: string; pool: string; debtAsset: string; amountUnits: bigint; onBehalfOf: string; rateMode?: 1 | 2;
}): ContractCall[] {
  const amt = o.amountUnits.toString();
  return [
    { network: o.network, contractAddress: o.debtAsset,
      abiFunction: 'approve(address,uint256)', args: [o.pool, amt] },
    { network: o.network, contractAddress: o.pool,
      abiFunction: 'repay(address,uint256,uint256,address)',
      args: [o.debtAsset, amt, String(o.rateMode ?? 2), o.onBehalfOf] },
  ];
}

// --- WORKFLOW path (integration depth: a scheduled, audited, self-running guardian) ---
// KeeperHub workflows are a { name, description, enabled, nodes, edges } graph (docs-confirmed).
export function buildGuardianWorkflow(o: {
  network: string; pool: string; user: string; debtAsset: string; amountUnits: bigint; actHF1e18: string;
}) {
  const n = (id: string, type: string, config: any, label: string) =>
    ({ id, type, data: { label, description: label, type, config, status: 'idle' } });
  const amt = o.amountUnits.toString();
  return {
    name: `aegis-guardian-${o.user.slice(0, 8)}`,
    description: 'Repay an Aave v3 position when its health factor drops below threshold',
    enabled: true,
    nodes: [
      n('trigger-1', 'trigger', { triggerType: 'Block', network: o.network }, 'Every N blocks'),
      n('read-hf', 'action', { actionType: 'web3/read-contract', network: o.network,
        contractAddress: o.pool, abiFunction: 'getUserAccountData(address)', args: [o.user] }, 'Read health factor'),
      // Condition node: dual true/false handles (comparator config field names: confirm via list_action_schemas)
      n('cond-1', 'condition', { left: '{{read-hf.healthFactor}}', operator: 'lt', right: o.actHF1e18 }, 'HF < actHF ?'),
      n('approve', 'action', { actionType: 'web3/write-contract', network: o.network,
        contractAddress: o.debtAsset, abiFunction: 'approve(address,uint256)', args: [o.pool, amt] }, 'Approve'),
      n('repay', 'action', { actionType: 'web3/write-contract', network: o.network,
        contractAddress: o.pool, abiFunction: 'repay(address,uint256,uint256,address)',
        args: [o.debtAsset, amt, '2', o.user] }, 'Repay'),
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'read-hf' },
      { id: 'e2', source: 'read-hf', target: 'cond-1' },
      { id: 'e3', source: 'cond-1', target: 'approve', sourceHandle: 'true' }, // 'true' handle = HF breached
      { id: 'e4', source: 'approve', target: 'repay' },
    ],
  };
}
```

**`src/keeperhub.ts`** — the ADAPTER BOUNDARY (the only file that talks to KeeperHub). Targets the documented MCP tools; auth is `Authorization: Bearer <kh_ key>`:
```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface ContractCall {
  network: string;            // chain id as a STRING: "1" | "11155111" | "8453" | "42161" | "137"
  contractAddress: string;    // docs field name for read/write-contract
  abiFunction: string;        // full signature, e.g. "repay(address,uint256,uint256,address)"
  args: unknown[];            // confirm exact arg field via list_action_schemas (see §II.13)
  value?: string;
}
export interface SimResult { success: boolean; wouldRevert: boolean; error?: string; }
export interface ExecResult { executionId?: string; txHash?: string; status?: string; error?: string; }
export interface KeeperHubClient {
  simulate(c: ContractCall): Promise<SimResult>;                          // execute_contract_call {simulate:true}
  execute(c: ContractCall, idempotencyKey: string): Promise<ExecResult>; // execute_contract_call {idempotency_key}
  waitForTx(executionId: string): Promise<ExecResult>;                   // poll get_direct_execution_status
}

let _mcp: Promise<Client> | null = null;
function client(): Promise<Client> {
  return _mcp ??= (async () => {
    const t = new StreamableHTTPClientTransport(new URL(process.env.KEEPERHUB_MCP_URL!),
      { requestInit: { headers: { Authorization: `Bearer ${process.env.KEEPERHUB_API_KEY}` } } });
    const mcp = new Client({ name: 'aegis', version: '0.1.0' });
    await mcp.connect(t);
    return mcp;
  })();
}
async function call(name: string, args: any): Promise<any> {
  const r: any = await (await client()).callTool({ name, arguments: args });
  return r.structuredContent ?? r;                                        // shape per get_execution / status pages
}

export function mcpKeeperHub(): KeeperHubClient {
  return {
    async simulate(c) {
      const r = await call('execute_contract_call', { ...c, simulate: true });   // simulate MUST be JSON boolean true
      return { success: !!r.success, wouldRevert: !!r.wouldRevert, error: r.error };
    },
    async execute(c, idempotencyKey) {
      const r = await call('execute_contract_call', { ...c, idempotency_key: idempotencyKey });
      return { executionId: r.executionId ?? r.id, status: r.status };
    },
    async waitForTx(executionId) {                                        // bounded backoff until completed/failed
      for (let i = 0, d = 1500; i < 20; i++, d = Math.min(d * 1.6, 15000)) {
        const r = await call('get_direct_execution_status', { executionId });
        if (r.status === 'completed' || r.status === 'failed')
          return { executionId, status: r.status, txHash: r.transactionHash ?? r.txHash };
        await new Promise(res => setTimeout(res, d));
      }
      return { executionId, status: 'timeout' };
    },
  };
}
```
> **The whole guardian in one tool call:** KeeperHub also exposes `execute_check_and_execute` — *"read one supported scalar and conditionally execute an action"* (Solidity integers support every operator). That is read-healthFactor → if `< threshold` → repay, in a single call — use it for the tightest possible demo. For the persistent, scheduled, self-running guardian (more surface = more integration-depth points) use `create_workflow` + `execute_workflow` with the graph from `buildGuardianWorkflow`, then `get_execution` (its `transactionHashes` are receipt objects). Two more entry points behind the same idea: the **KeeperHub CLI**, or `ai_generate_workflow` to author the workflow from a natural-language prompt (a strong "the agent composes its own execution" story). Everything stays behind this file.

**`src/composer.ts`** — DeepSeek proposes (never executes):
```ts
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: process.env.DEEPSEEK_BASE_URL });

export async function propose(ctx: {
  healthFactor: number; totalDebtBase: string; totalCollateralBase: string; suggestedUnits: string; debtAsset: string;
}): Promise<{ rationale: string; amountUnits: string; debtAsset: string }> {
  const r = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL!, temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are a DeFi risk analyst. Given a lending position at risk, respond ONLY with JSON {"rationale": string, "amountUnits": string, "debtAsset": string}. You PROPOSE a repay; you never execute. Do not exceed the suggestedUnits.' },
      { role: 'user', content: JSON.stringify(ctx) },
    ],
  });
  return JSON.parse(r.choices[0].message.content!);
}
```
> The LLM output then passes through `guard()` before it can become a workflow. That is the demo's whole point: the probabilistic layer cannot move money the deterministic layer hasn't clamped.

**`src/monitor.ts`** — glue:
```ts
import 'dotenv/config';
import { createAave, hf } from './aave';
import { repayBaseToTarget } from './policy';
import { guard } from './guard';
import { buildRepayCalls } from './workflows';
import { mcpKeeperHub } from './keeperhub';
import { propose } from './composer';

const C = process.env;
async function tick() {
  const aave = createAave(C.RPC_URL!, C.AAVE_POOL as `0x${string}`);
  const user = C.PROTECTED_WALLET as `0x${string}`;
  const a = await aave.getAccountData(user);
  const health = hf(a.healthFactor);
  console.log(`HF=${health.toFixed(3)}`);
  if (health >= Number(C.ACT_HF)) return;

  const repayBase = repayBaseToTarget(a.totalCollateralBase, a.liqThresholdBps, a.totalDebtBase, Number(C.TARGET_HF));
  const scale = 10n ** BigInt(8 - Number(C.DEBT_ASSET_DECIMALS));   // stablecoin debt assumption
  const suggestedUnits = repayBase / scale;

  const p = await propose({ healthFactor: health, totalDebtBase: a.totalDebtBase.toString(),
    totalCollateralBase: a.totalCollateralBase.toString(), suggestedUnits: suggestedUnits.toString(), debtAsset: C.DEBT_ASSET! });

  const safe = guard({ debtAsset: p.debtAsset, amountUnits: BigInt(p.amountUnits) },
    { allowedAssets: [C.DEBT_ASSET!], maxUnits: BigInt(C.MAX_REPAY_UNITS!) * 10n ** BigInt(C.DEBT_ASSET_DECIMALS!) });

  const calls = buildRepayCalls({ network: C.CHAIN_ID!, pool: C.AAVE_POOL!, debtAsset: safe.debtAsset,
    amountUnits: safe.amountUnits, onBehalfOf: user });

  const kh = mcpKeeperHub();
  for (const c of calls) {
    const sim = await kh.simulate(c);                    // simulate:true — preflight, nothing broadcasts
    console.log('simulate:', sim.success && !sim.wouldRevert ? 'ok' : `BLOCKED: ${sim.error ?? 'wouldRevert'}`);
    if (!sim.success || sim.wouldRevert) return;         // deterministic refusal on a would-be revert
    const run = await kh.execute(c, `aegis-${user}-${Date.now()}`);   // unique idempotency_key
    const done = await kh.waitForTx(run.executionId!);
    console.log(done.status === 'completed' ? `RESCUED tx=${done.txHash}` : `exec: ${done.status}`);
  }
}
setInterval(() => tick().catch(console.error), Number(C.POLL_MS ?? 12000));
```

## II.7 — The Chaos Test harness (your moat — §6 made real)

Goal: on screen, the **naive baseline** fails each way, and **KeeperHub** survives. Build one script per row; `scripts/demo.ts` runs them in sequence.

| # | Injection | How (Foundry / code) | Baseline result | KeeperHub result to show |
|---|---|---|---|---|
| 1 | Position underwater | `chaos/push-underwater.sh`: impersonate wallet, `cast send $POOL 'borrow(...)'` (more debt → HF↓); *or* nudge the collateral price feed via `anvil_setStorageAt` | n/a (trigger) | Aegis detects HF<ACT_HF |
| 2 | Would-be revert | `chaos/revert.ts`: propose repay with insufficient balance | broadcasts, reverts, gas burned | **dry-run BLOCKS** before broadcast |
| 3 | Nonce collision | `chaos/nonce-collision.ts`: send two txs at the same nonce with viem | second wedges / stuck | nonce mgmt + retry lands both |
| 4 | Gas spike | `chaos/gas-spike.sh`: `cast rpc anvil_setNextBlockBaseFeePerGas 0xLARGE` | underpriced, stuck | smart gas + exponential backoff lands it |
| 5 | MEV / sandwich | describe an exposed swap path; (mainnet) submit the rescue | in public mempool, sandwichable | **private routing** — never in public mempool |
| 6 | RPC failure | point baseline at a dead RPC | dead | multi-RPC failover |
| — | Observability | — | console only | **full audit trail**: trigger → sim → tx → gas → outcome |

`chaos/fork.sh` (starting point):
```bash
#!/usr/bin/env bash
set -euo pipefail
anvil --fork-url "$MAINNET_RPC_URL" --fork-block-number latest --port 8545 &
sleep 3
# open / locate a near-edge Aave position here, or impersonate an existing one:
# cast rpc anvil_impersonateAccount $PROTECTED_WALLET
# cast send $AAVE_POOL "borrow(address,uint256,uint256,uint16,address)" ... --unlocked --from $PROTECTED_WALLET
echo "fork ready on :8545"
```
`chaos/nonce-collision.ts` (baseline failure):
```ts
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
const acct = privateKeyToAccount(process.env.BASELINE_PK as `0x${string}`);
const w = createWalletClient({ account: acct, transport: http('http://127.0.0.1:8545') }).extend(publicActions);
const nonce = await w.getTransactionCount({ address: acct.address });
await Promise.allSettled([                                  // same nonce twice → one wedges
  w.sendTransaction({ to: acct.address, value: 0n, nonce }),
  w.sendTransaction({ to: acct.address, value: 1n, nonce }),
]);
console.log('baseline: submitted two txs at nonce', nonce, '(expect one stuck/replaced)');
```

## II.8 — The required real transaction (don't lose the binary points)

Rubric line 2 and the submission requirement are **binary**: you need a real tx executed through KeeperHub. Get it on **Day 3**, before polishing anything:
1. Fund the KeeperHub/Turnkey wallet with test USDC (Sepolia Aave faucet) and open a small position.
2. Run `monitor.ts` against it; force HF down with `chaos/push-underwater.sh`.
3. Capture the **tx hash** + **audit-trail URL** KeeperHub returns. Save both in the README.
4. (Flourish) repeat once on **mainnet** with a tiny position using **KeeperHub gas sponsorship** to demonstrate real value + private routing.

## II.9 — Bounty PR (the stackable $1,000, separate BUIDL)

Your integration will want a primitive KeeperHub doesn't ship. Extract the cleanest one as a tested PR to `github.com/KeeperHub/keeperhub`:
- **Best candidate:** an **Aave v3 "health-factor" trigger** (fires when `getUserAccountData().healthFactor < X`) and/or an **Aave `repay`/`supply` action node** — so other builders get liquidation-protection for free. Directly on-theme; obviously mergeable.
- **Alternatives:** a Morpho market node; a numeric-comparator preset for the **Condition** node; a DX improvement you genuinely hit.
- Judged on mergeability / value / tests / scope — so ship with tests and a tight README. Submit as a **separate BUIDL** from the main track.

## II.10 — Build timeline (Sep 6 → Sep 18)

| Day | Milestone |
|---|---|
| **6 (Sat)** | Repo scaffold; §II.13 **Day-0 checklist** (MCP URL, arg field names) + Discord office hours; fill `.env`; `keeperhub.ts` connects (a trivial `simulate` round-trips). |
| **7** | `aave.ts` reads a real HF on testnet; open the protected position. |
| **8** | `workflows.ts` + `monitor.ts` happy path → **first real rescue tx + audit link** (II.8). *Binary points secured.* |
| **9** | `guard.ts` + `composer.ts` (DeepSeek proposer, clamped). Unit tests for policy/guard. |
| **10–11** | **Chaos Test** rows 2–4 + baseline; `scripts/demo.ts` orchestrates. |
| **12** | Chaos rows 5–6 (mainnet private-routing flourish); observability/audit capture. |
| **13** | **Bounty PR** (health-factor trigger) with tests; open it early for KeeperHub feedback. |
| **14–15** | README (setup + architecture diagram), record **demo video**, write the form answers (II.13). |
| **16** | Buffer / mainnet gas-sponsored run / harden. |
| **17** | Full dress rehearsal of the **live panel** run; pre-load fork, script the price-drop. |
| **18 (12:00 CEST)** | Submit main-track BUIDL **and** bounty BUIDL. Done. |

## II.11 — DeepSeek Flash v4 build prompts (paste these)

**Master context (paste once at the start of the DeepSeek session):**
```
You are my coding assistant for a hackathon project called "Aegis": a liquidation-protection
guardian that watches an Aave v3 position's health factor and, when it drops below a threshold,
executes a deterministic repay through KeeperHub (an onchain execution layer with dry-run,
private routing, retries, nonce/gas management, and an audit trail).

Stack: TypeScript, Node 20+ (global fetch), viem, Foundry (anvil/cast) for a mainnet fork,
DeepSeek via the OpenAI SDK (baseURL https://api.deepseek.com), and the OpenZeppelin-free viem path.
Non-negotiable design rules:
1. All KeeperHub calls go through ONE module (src/keeperhub.ts) behind the interface
   KeeperHubClient { dryRun(w): Promise<DryRunResult>; execute(w): Promise<ExecResult> }.
   Never call KeeperHub from anywhere else.
2. The LLM only PROPOSES a repay; src/guard.ts must clamp it (whitelist asset, cap amount)
   before it becomes a workflow. Nothing probabilistic may reach execution unclamped.
3. Money-moving code must dry-run first and abort if the dry-run fails.
4. Keep modules small, typed, and unit-testable. Use bigint for token amounts. No secrets in code.
Output complete files with imports. Ask before inventing a KeeperHub endpoint — those are provided.
```

**Task prompts (one per module; give DeepSeek the interface, ask for the file):**
```
T1  Write src/config.ts: parse and validate process.env (the .env.example keys I will paste),
    export a typed Config object, throw a clear error on any missing key.

T2  Write src/aave.ts exactly to this contract: [paste II.6 aave.ts]. Add a getHealthFactor()
    convenience returning a number, and a JSDoc note that healthFactor is 1e18-scaled.

T3  Write src/policy.ts implementing repayBaseToTarget [paste signature], plus a helper
    baseToTokenUnits(repayBase, debtDecimals) assuming a ~$1 stablecoin debt. Add tests in
    test/policy.test.ts covering: already-safe (returns 0), and a position needing partial repay.

T4  Write src/guard.ts implementing guard(proposal, cfg) [paste II.6 guard.ts] and test/guard.test.ts
    covering: non-whitelisted asset throws, amount above max is clamped, zero/negative throws.

T5  Write src/keeperhub.ts: the KeeperHubClient interface + mcpKeeperHub() over the MCP tools
    execute_contract_call (with simulate:true / idempotency_key) and get_direct_execution_status
    [paste II.6]. Add a mockKeeperHub() implementing the same interface in-memory (simulate ok,
    execute returns a fake txHash) so the monitor is testable without network.

T6  Write src/workflows.ts: buildRepayCalls (direct ContractCall[]) and buildGuardianWorkflow
    (nodes+edges graph) [paste II.6]. Add buildDeleverageCalls that withdraws collateral, swaps it
    to the debt asset via a Uniswap v3 router (I will paste router address + exactInputSingle
    signature), then repays — each as a web3/write-contract ContractCall.

T7  Write src/composer.ts: propose() via DeepSeek [paste II.6], temperature 0, JSON-only output,
    and a deterministic fallback proposeDeterministic() used when DEEPSEEK_API_KEY is unset.

T8  Write src/monitor.ts wiring config→aave→policy→composer→guard→workflows→keeperhub [paste II.6].
    Log HF each tick; on rescue, simulate then execute each call and print txHash (from get_direct_execution_status).

T9  Write chaos/nonce-collision.ts, chaos/revert.ts, and scripts/demo.ts that runs the baseline
    failures then the KeeperHub success and prints a before/after table. [paste II.7 rows]
```

## II.12 — Demo video + live-panel prep + submission

**Demo video (2–3 min):** (1) the problem — a position sliding toward liquidation; (2) Aegis detects it; DeepSeek's rationale prints; the **guard clamps** it; (3) KeeperHub **dry-runs** (show it *not* touching chain), then executes; (4) cut to the **audit trail** and the **tx link**; (5) the **Chaos Test** before/after table. End on the one-liner from §II.2.

**Live-panel answers to have ready (they *will* ask):**
- *"What if the rescue tx itself reverts?"* → dry-run blocks it pre-broadcast (Chaos row 2, run it live).
- *"What about MEV on the rescue?"* → private routing; show the mainnet audit record (row 5).
- *"Why KeeperHub and not a cron + ethers script?"* → nonce/gas/retry/failover/audit — run row 3/4 to show the naive script wedging.
- *"Is the LLM in the money path?"* → no; it proposes, `guard.ts` clamps, KeeperHub executes deterministically.

**Submission form answers (pre-write them):**
- *Which project & what it does:* Aave v3 — Aegis auto-protects positions from liquidation by executing repays/deleverages through KeeperHub.
- *KeeperHub surfaces used:* MCP/CLI (agent-authored workflow), dry-run simulation, private routing, retries, audit trail. (List the ones you actually used.)
- *Testnet or mainnet:* Sepolia for the demo tx + a mainnet gas-sponsored run (if done).
- *What still breaks / unfinished:* be candid (e.g., "deleverage-via-swap is single-DEX; oracle-nudge chaos is fork-only"). The brief says candor has never hurt a submission.

## II.13 — What's VERIFIED vs. still-open against KeeperHub's docs (honesty section)

I confirmed the load-bearing API details against `docs.keeperhub.com/ai-tools/mcp-server` and the overview (Sep 2026). **VERIFIED — the code above uses these:**
- ✅ **Auth:** organisation API key, `kh_` prefix, sent as `Authorization: Bearer kh_...` (create under Settings → Developer → API keys → Organisation). An OAuth 2.1 browser flow also exists (used by the Claude Code MCP integration).
- ✅ **Programmatic surface:** an MCP server with 30+ tools. Key ones used: `execute_contract_call`, `execute_check_and_execute` ("read one scalar, conditionally execute an action"), `get_direct_execution_status`, `create_workflow`/`execute_workflow`/`get_execution`, `ai_generate_workflow`, `list_action_schemas`, `tools_documentation`.
- ✅ **Dry-run:** direct-execution tools take `simulate: true` (JSON boolean, EVM-only); proceed only when `success && !wouldRevert`, then re-call with a unique `idempotency_key`. This *is* the "nothing broadcasts unreviewed" guarantee — cleaner than a separate simulate endpoint, and it pairs with the policy guard.
- ✅ **web3 nodes:** `web3/read-contract` / `web3/write-contract` require `network` (chain id as a **string**), `contractAddress`, `abi`, `abiFunction`; `abiFunction` accepts a full signature like `repay(address,uint256,uint256,address)`. Node families also include check-balance, transfer, event-log query, calldata decode; plus Notifications, System (HTTP, **Condition** branching, For Each, Collect, template), and Math.
- ✅ **Workflow schema:** a `{ name, description, nodes, edges, enabled }` graph. Node = `{ id, type, data:{ label, description, type, config, status } }`; trigger `type:"trigger"` with `triggerType` ∈ {Manual, Schedule, Webhook, Event, Block, Transfer}; **Condition** nodes split true/false via edge `sourceHandle`.
- ✅ **Wallet:** every account is auto-provisioned a **Turnkey** hardware-backed wallet (one wallet holds an EVM **and** a Solana address); writes use that account/org integration — **no per-call walletId**.
- ✅ **Networks:** Ethereum, Base, Arbitrum, Polygon, Sepolia + more EVM (and Solana for transfers). IDs as strings ("1","11155111","8453","42161","137"); authoritative list: `GET /api/chains`.
- ✅ **Gas sponsorship:** eligible EVM txs may use KeeperHub's monthly sponsorship (network fees only; native value/tokens still funded).

**Still open — grab on Day 0 (all behind the adapter; none moves the architecture):**
- [ ] The exact **MCP server URL** for the client transport (`KEEPERHUB_MCP_URL`) — from the docs quickstart / app.keeperhub.com. Simplest path: install the **Claude Code plugin** — `/plugin marketplace add KeeperHub/claude-plugins` → `/plugin install keeperhub@keeperhub-plugins` → `/keeperhub:login`.
- [ ] Exact **argument field name** for call args on `execute_contract_call` / `web3/write-contract`, and the `execute_check_and_execute` parameter shape — call `list_action_schemas` + `tools_documentation` (authoritative) and adjust the `args` field.
- [ ] **Condition-node comparator config** field names (I used `left/operator/right` + `{{node.field}}` templating) — confirm via `list_action_schemas`; the true/false-handle wiring is already confirmed.
- [ ] The exact **receipt/tx-hash field** on `get_execution` (`transactionHashes` are receipt objects) and `get_direct_execution_status`; build the explorer link from the hash (no prebuilt URL field is documented).
- [ ] Whether an **Aave action already exists** — run `search_protocol_actions "aave repay"` / `get_plugin`. If yes, use it and aim the bounty at the **health-factor trigger** (or a reusable check-and-execute template); if no, the repay/supply action node is your PR.

---

## Appendix A — Feasibility & stack (quarantined; does NOT affect the merit ranking)

| Pick | Stack / surfaces | Buildability in 12 days | Key risk |
|---|---|---|---|
| **#1 Guardian (Aave/Morpho)** | KeeperHub MCP + dry-run + private routing + audit; mainnet-fork (Anvil/Tenderly); Aave/Morpho SDK/contracts | **Good** — protocols well-documented; health factor readable onchain; both in KeeperHub's protocol set | Getting a *real* rescue tx (not mocked); modeling the trigger precisely |
| **#2 Detector→Responder** | Same + a monitoring feed (oracle/risk) | **Good–Medium** | Must anchor to a *specific named* project for line 1 |
| **#3 Olas/Pearl bridge** | Pearl/Olas agent + KeeperHub MCP; MCP-to-MCP | **Medium** | Olas self-custodies locally → frame as reliability upgrade, avoid "redundant hands" |
| **#4 Gelato migration** | KeeperHub workflow builder/CLI; target protocol's contracts | **Medium** | Confirm the job is *actually* stranded/wanted now |

**Verification checklist before you commit (do Day 0):**
- [ ] Confirm KeeperHub's current triggers/actions for Aave **and** Morpho (docs.keeperhub.com + the repo) — decide which needs the smaller new primitive.
- [ ] Confirm testnet vs mainnet expectation for the tx link (form asks explicitly; mainnet with tiny value is most convincing, fork is safest to demo).
- [ ] Read the MCP server guide: https://docs.keeperhub.com/ai-tools/mcp-server
- [ ] Join Discord, attend the first office-hours (3× at 12:00 CEST) — ask engineers *"what integration would you most want to merge?"* Their answer is a direct signal from the judges.
- [ ] Skim the repo (https://github.com/KeeperHub/keeperhub) to scope the bounty PR.

## Appendix B — Improved research prompt (re-runnable)

The prompt below is the upgraded version of your original — rebuilt around the beauty-contest logic, the coherence filter, and the *actual* rubric. Keep it for future rounds or to sanity-check this doc against another model.

> *(paste block)*
> You are doing pre-build research for the KeeperHub "Agent Economy" hackathon (main track: integrate KeeperHub — the onchain execution/reliability layer, the "Hand" — into a **specific live project** and move **real value** through it; rubric = integration depth into a named project / value actually moved + visible tx / survives non-happy-path / usefulness to that project's users / mergeable code; a stackable $1,000 bounty rewards a mergeable PR to KeeperHub; finalists present a **working build live**). Today is Sep 2026; verify project state.
> **Game theory:** competitors' models converge, and "avoid the obvious" converges too. Reason in levels and give a Level-2 answer PLUS a saturation map of what the field will pick. Target choice is a *converging* axis — do not overpay to win it; **win on the non-converging axes** (integration depth, real value moved, non-happy-path reliability, live-runnable robustness).
> **Coherence filter:** KeeperHub is *hands*. Reject other execution/automation infra (redundant). Prefer strong *brains with naive hands*, or **domains where users lose money when execution fails** (so reliability is the point). State, per candidate, the one-sentence gap KeeperHub fills and whether it's real or forced.
> **Deliver:** verify/challenge Wayfinder/Daydreams/Almanak + KeeperHub; find live non-obvious targets; a saturation map; a top-3 merit ranking; for #1, the concrete architecture + a live "chaos test" demo (nonce/gas/revert/MEV/RPC failures shown surviving, audit trail as proof) + which KeeperHub surfaces + the tx you'll show; a plan to extract a bounty PR; feasibility only in an appendix. Sourced, with dates. If a named example is genuinely best, say so — the goal is to **win**, not to be unusual.

---

## Sources

- KeeperHub — site & positioning: https://keeperhub.com/ · docs: https://docs.keeperhub.com/ · MCP: https://docs.keeperhub.com/ai-tools/mcp-server · repo: https://github.com/KeeperHub/keeperhub · Gelato comparison/migration: https://keeperhub.com/compare/gelato · integrations: https://keeperhub.com/integrations
- **KeeperHub API specifics verified Sep 2026** (MCP tools incl. `execute_check_and_execute`, `web3/*` node schema, `simulate`/`idempotency_key`, Turnkey wallet, networks, gas sponsorship): https://docs.keeperhub.com/ai-tools/mcp-server · https://docs.keeperhub.com/ · Claude Code plugin marketplace: `KeeperHub/claude-plugins`
- **DeepSeek API verified Sep 2026** (model ids `deepseek-v4-flash` / `deepseek-v4-pro`; legacy `deepseek-chat`/`deepseek-reasoner` retired 2026-07-24; OpenAI- & Anthropic-compatible, base `https://api.deepseek.com`): https://api-docs.deepseek.com/ · https://api-docs.deepseek.com/updates/
- Hackathon (authoritative brief): https://dorahacks.io/hackathon/agent-economy/detail · prior event & ETHGlobal partnership: https://keeperhub.com/blog/008-first-hackathon-openagents · ETHGlobal OpenAgents (earlier event): https://ethglobal.com/events/openagents/prizes/keeperhub
- Gelato Web3 Functions EOL Mar 31 2026 / OZ Defender sunset Jul 1 2026: https://keeperhub.com/compare/gelato · https://docs.openzeppelin.com/defender · https://blog.logrocket.com/tools-smart-contract-automation-guide/ · documented Gelato users: https://mint-ventures.medium.com/gelato-network-facing-the-automated-web3-world-ee78c3020f68 · https://www.thestreet.com/crypto/defi/defi-automation-gelato-network-bots-uniswap-limit-orders
- Wayfinder / PROMPT: https://www.dextools.io/tutorials/what-is-wayfinder-prompt-ai-agent-omnichain-protocol-guide-2026 · https://coinmarketcap.com/cmc-ai/wayfinder/latest-updates/
- Almanak: https://sdk.docs.almanak.co/ · https://docs.almanak.co/ · https://github.com/almanak-co/sdk · https://almanak.co/
- Daydreams: https://github.com/daydreamsai/daydreams · https://docs.dreams.fun/ · https://github.com/daydreamsai/lucid-agents
- Giza ARMA: https://docs.gizaprotocol.ai/introduction/agents · https://medium.com/@gizatech/agentic-acceleration-how-giza-agents-generated-5-4m-volume-for-base-in-four-weeks-f241d9549b3b
- Olas / Pearl: https://olas.network/blog/q2-2026 · https://agenteconomy.to/olas · https://www.theblock.co/post/338713/
- HeyAnon: https://messari.io/report/heyanon-introduces-ai-to-trading-with-defai
- DeFAI landscape / standards (ERC-8004, ERC-7715, EIP-7702): https://www.dextools.io/tutorials/what-is-defai-defi-ai-agents-explained-2026 · https://coincub.com/blog/best-ai-crypto-agents/ · https://www.rzlt.io/blog/defai-in-2026-what-ai-agents-in-decentralized-finance-actually-are

*Prices/tokens mentioned are volatile and not investment advice. Verify current project state and KeeperHub's live protocol/trigger coverage before committing — details above reflect sources available Sep 2026.*
