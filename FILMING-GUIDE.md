# 🎬 Ballast — screen-filming guide (Bandicam)

What you're filming: **Ballast showing it can guard a real Aave position and rescue it through KeeperHub — on the deployed public URL, not just your PC.** This is the strongest clip for the KeeperHub "Agent Economy" submission.

This guide gives you beats + ready-to-type captions. Numbers in *italics* are placeholders — put the real ones you see on screen.

---

## Kit & recording settings

- Record **only the browser window** at 1920×1080, 30 fps (Bandicam: *Video tab → record a window → select Chrome*; untick system audio if you'll add narration later).
- Turn on the **mouse highlight** in Bandicam so your cursor is visible.
- Captions: add them in an editor (Clipchamp / CapCut / Bandicam's own text) — the lines below are the words.
- Target **under 90 seconds** per beat. Two short clips beat one long one.
- **Cool-down tip:** if the app was just pushed, the first open does a serverless *cold start* — the screen may say **BRIDGE DARK / engine not answering** for 1–3 seconds while the engine spins up. That's honest, not a bug. Either wait it out or reload once; it's a nice caption beat anyway.

**The deployed URL you'll film:** `https://ballast-green.vercel.app`

---

## Prep checklist (do all of this BEFORE recording)

### 1. Arm the live engine in Vercel
In **Vercel dashboard → ballast-green → Settings → Environment Variables**, add (values identical to `guardian/.env` / `.env.example`):

| variable | example / where it comes from |
|---|---|
| `RPC_URL` | your Alchemy **Sepolia** endpoint (from `guardian/.env`) |
| `CHAIN_ID` | `11155111` |
| `AAVE_POOL` | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` |
| `DEBT_ASSET` | Aave-listed USDC `0x94a9d9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8` |
| `DEBT_ASSET_DECIMALS` | `6` |
| `PROTECTED_WALLET` | `0x2DcA7aDD570F2E2D81fE86098B51128bC528bC15` |
| `KEEPERHUB_MCP_URL` | `https://app.keeperhub.com/mcp` |
| `KEEPERHUB_API_KEY` | your `kh_…` key |
| `BALLAST_LIVE_KEY` | a key *you* generate — `openssl rand -hex 24`. Never commit or paste it into chat. |

Push (or redeploy) so Vercel builds with these. **The sim demo is the default when they're absent — with them present, the same URL becomes live.**

### 2. Make sure the money can move
- The **KeeperHub execution wallet** (`0x851a05FA306080Fd6bA9D961BDf9DD6cca29CA32`) must hold test **USDC (the listed token above)** — that's whose USDC repays the loan. Check: `node guardian/scripts/check-balances.mjs`. If low, send it ~$10 of the listed USDC.
- The **protected wallet** holds the position (collateral + debt). You only *read* it in this demo — its key stays on your PC.

### 3. (Only for a filmed RESCUE) give the guardian something to save
After the earlier real rescue the position is **healthy (HF ≈ 1.30)** — pressing RESCUE NOW then honestly answers *"nothing to rescue."* That's a fine beat, but for the money-shot you want the needle **in the red**, so **re-borrow ~$7 of USDC** against the same collateral to push HF to ≈ **1.04** (below the 1.05 act line, above the 1.01 emergency edge).

> Ready-made helper: `guardian/scripts/borrow-more.mjs` (optionally takes a target HF, default
> ≈ 1.04) borrows just enough listed-USDC against the existing collateral to land there, then
> tops up the KeeperHub execution wallet for the follow-up rescue. It does NOT overshoot below
> the emergency line by design. **Only run it when a rescue path is armed and ready to fire right
> after** — parked near-liquidation positions are dangerous.

---

## Beat 1 — the live position on the public URL (the proof it's real)  ⏱ ~45s

| time | on screen | do | caption |
|---|---|---|---|
| 0:00 | Browser address bar + page loading | Type/paste the URL, hit enter | **"The guardian, deployed — reading a REAL Aave position."** |
| 0:05 | Brass gauge + **LIVE POSITION** panel | Wait for the needle to settle | **"This needle is not a demo. It's the live health factor of a real loan on Aave v3 (Sepolia)."** |
| 0:12 | Status plate / telemetry strip | Point at COLLATERAL, DEBT, engine badge **engine · live** | **"Health factor *1.30* — safe and green. Collateral *$44*, debt *$28*. The engine badge says LIVE, not sim."** |
| 0:22 | **⟳ Sync position** | Click it | **"Each sync re-reads the chain. No fake numbers — if the RPC were down it would say so."** |
| 0:30 | Ship's log | Point at the newest line | **"Every move is in the log."** |
| 0:40 | whole page | pause | **"That's a live guardian on a live position. Now let's make it work."** |

## Beat 2 — the honest refusal (optional, 20s, shows the safety rules)

| time | do | caption |
|---|---|---|
| 0:00 | In LIVE POSITION, type your operator key in the box, click **RESCUE NOW** | **"The rescue button is gated by an operator key — it only travels in the request header, never stored."** |
| 0:06 | Read the message | **"Position is healthy, so the engine refuses: 'nothing to rescue.' Refusing to act IS the correct behaviour."** |

## Beat 3 — a real rescue from the URL (the money shot)  ⏱ ~60s
(Requires prep step 3 — a fresh near-liquidation episode.)

| time | on screen | do | caption |
|---|---|---|---|
| 0:00 | Page after the borrow | Show HF ≈ **1.04**, status **CAPSIZING**, needle in the red | **"A crash just dropped this position to health factor *1.04* — under the 1.05 action line, minutes from liquidation."** |
| 0:08 | Type operator key, hover RESCUE NOW | click | **"One press. The guardian will dry-run every call, re-check the chain right before broadcasting, then execute through KeeperHub."** |
| 0:12 | Status plate → **RESCUED**, needle swings to green | Point at the swing | **"RESCUED. The needle is back at the 1.30 target."** |
| 0:20 | TX + **audit ↗** link under the plate | Point at the hash | **"There's the transaction — and the KeeperHub audit link."** |
| 0:26 | (new tab) Sepolia Etherscan for the tx hash | Paste `sepolia.etherscan.io/tx/<hash>` | **"On-chain proof: health factor *1.04 → 1.30*, debt repaid *$35 → $28*. Gas paid by KeeperHub's sponsored relayer."** |
| 0:40 | KeeperHub audit page (audit ↗ opened it) | Scroll the execution | **"The full KeeperHub audit trail — execution id, dry-run, receipt, sponsored flag."** |
| 0:52 | whole page | pause | **"Ballast: a liquidation guardian that doesn't just warn — it acts, deterministically, on KeeperHub."** |

---

## Terminal fallback (if you'd rather film a terminal than the button)

```bash
# read the real position from the deployed engine (no key needed)
curl https://ballast-green.vercel.app/api/guardian/state

# gated rescue (operator key needed)
curl -X POST https://ballast-green.vercel.app/api/guardian/rescue \
  -H 'x-ballast-key: YOUR_KEY'
```

Expected live-state JSON to point at: `"engineMode":"live"`, `"status":"STEADY"`, a real `"healthFactor"`, `"positionLabel":"Aave v3 · 0x2DcA7a"`.

---

## Caption phrases you can reuse

- "Liquidation happens in seconds. Ballast acts before it does."
- "One file in the whole repo talks to KeeperHub — everything else stays clean."
- "Every transaction is dry-run first, idempotency-keyed, and verified on-chain after."
- "Serverless can't watch every second — that's why the always-on guardian runs where it should, and this URL is its on-demand command deck."

## Gotchas

- **Cold start** flashes BRIDGE DARK for 1–3s after a fresh deploy. Reload once.
- **If RESCUE NOW says "position healthy"** when you expected a rescue: the episode isn't low — do prep step 3.
- **If the button is disabled** and the panel says "rescue disarmed": `BALLAST_LIVE_KEY` or the KeeperHub vars aren't set in Vercel yet.
- **Never** show your `kh_…` API key, your `BALLAST_LIVE_KEY`, or the protected wallet's private key on camera. The operator-key box is masked as a password — keep it that way.
