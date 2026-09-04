# Ballast — UI/UX & Frontend Design Spec

A design brief, not just a feature list — read section 1 before building any component.

---

## 1. The Design Concept

The research spec (`keeperhub-integration-research.md`) is entirely backend: a monitor
loop that logs a health factor to a console, and a chaos-test harness that runs in a
terminal. That's a real gap — a judge watching a demo video remembers what they *see*,
and console output is forgettable next to any submission with a real visual.

**Ballast looks like a ship's brass stability instrument — an inclinometer.** Real ships
carry a gauge that shows how far the vessel is listing (tilting) before it capsizes, and
crews add or shift ballast to bring it back level. That instrument *is* the entire
visual language here: a lending position's health factor becomes the ship's list angle,
danger is a red arc near capsizing, and a successful rescue is the needle swinging back
to level — trimmed.

This is deliberately a different material reference than Preflight's paper inspection
tag, even though both projects share a builder — reusing the same visual language across
two different hackathon submissions would read as a template, not a considered design.

**The one memorable moment, in 30 seconds:** a judge watches the needle drift into the
red arc as a chaos scenario hits, watches KeeperHub's rescue execute, and watches the
needle swing back to level with a status change to STEADY — a physical, legible motion
that needs no caption to understand.

### Self-check against generic AI-design defaults
- ❌ Not a dark-mode fintech dashboard with rounded cards and a bright accent.
- ❌ Not the cream/serif/terracotta editorial combo — the cream tone here is motivated
  specifically by aged brass-instrument enamel, paired with a grotesque sans, not a serif.
- ❌ Not a reskin of Preflight's paper-tag/stamp language — different material,
  different domain, different vocabulary.
- ✅ The gauge arc, the needle, and the telemetry readout are all functionally real —
  every element maps to an actual value (health factor, thresholds), nothing is
  decorative chrome.

---

## 2. Design Tokens

### Color (instrument-accurate, not decorative)
| Token | Hex | Use |
|---|---|---|
| `bridge-night` | `#0E1B24` | Base background — a ship's bridge at night |
| `dial-ivory` | `#EDE7D9` | The gauge/instrument face surface |
| `brass` | `#B08D45` | Bezel, needle, borders, dividers — the instrument's metal |
| `arc-danger` | `#B23A2E` | Danger arc (near/at liquidation), FOUNDERED state |
| `arc-warn` | `#C98A3B` | Warning arc (listing), LISTING state |
| `arc-safe` | `#3B6E52` | Safe arc, STEADY / RESCUED state |
| `ink` | `#1E1B16` | Text on the dial face |

No colors beyond this set. The restraint is what makes the danger arc read as urgent
when it actually appears.

### Type
- **UI chrome / headers:** Space Grotesk (Google Fonts, free) — a geometric grotesque
  with enough engineering character to feel machined, not decorative.
- **Telemetry / numeric readouts:** JetBrains Mono (Google Fonts, free) — used only for
  live numbers (health factor, collateral, debt, tx hash, gas) — functionally motivated,
  this is instrument telemetry, not a stylistic choice.
- Body copy (rationale text, log entries) uses Space Grotesk regular weight.

### Layout concept
- A single large circular/arc gauge is the visual center of every screen — this is not
  a dashboard of many competing panels, it's one instrument you're watching.

---

## 3. Screens

### 3.1 The Bridge (main/default view)

```
┌──────────────────────────────────────────────┐
│                                                  │
│              B A L L A S T                       │
│                                                  │
│           ┌──────────────────┐                 │
│         ╱   arc: red · amber · green  ╲          │
│        │         ◜  1.05         ◝     │        │
│        │            ╲  needle          │        │
│        │             ● pivot           │        │
│         ╲                            ╱          │
│           └──────────────────┘                 │
│                                                  │
│              STATUS: STEADY                     │
│         health factor   1.34                    │
│         collateral      $412.00                 │
│         debt            $198.40                 │
│         target HF       1.30                    │
│                                                  │
└──────────────────────────────────────────────┘
```
- The needle position on the arc IS the health factor — no separate number needed to
  understand danger at a glance, though the exact figure is shown below for precision.
- Status word directly under the gauge, large: **STEADY** (safe), **LISTING**
  (approaching threshold), **CAPSIZING** (breach, rescue in progress), **RESCUED**
  (successful save, tx confirmed), **FOUNDERED** (rescue failed — define this state even
  if you never need to show it live).

### 3.2 Storm Mode (chaos test — this is the demo's centerpiece)

Triggered when a chaos scenario runs. The background shifts subtly darker/rougher
(a faint horizontal wave-line texture is enough — do not overbuild this with animated
water), and a condition log appears beside the gauge, one line per injected failure,
resolving in real time:

```
┌──────────────────────────────────────────────┐
│              B A L L A S T   —   STORM          │
│                                                  │
│        [gauge, needle drifting into amber]      │
│                                                  │
│   CONDITIONS                                    │
│   nonce collision      baseline ✗   ballast ✓   │
│   gas spike             baseline ✗   ballast ✓   │
│   would-be revert       baseline ✗   ballast ✓   │
│   RPC failure            baseline ✗   ballast ✓   │
│                                                  │
└──────────────────────────────────────────────┘
```
- Two columns, `baseline` and `ballast`, side by side per row — this is the single
  clearest way to show "naive agent fails, Ballast survives" without narration.
- ✗ in `arc-danger`, ✓ in `arc-safe` — plain typed characters, consistent with the
  instrument-telemetry approach, no icon library needed.

### 3.3 The Rescue (the hero animation)

When KeeperHub's execution confirms: the needle animates from its danger position back
to the safe arc in one continuous motion (roughly 600-800ms, ease-out — a real needle
settling, not a bouncy UI spring), status flips to **RESCUED**, and the confirmed
transaction hash appears directly beneath the gauge as a monospace link to the explorer
and the KeeperHub audit trail.

```
┌──────────────────────────────────────────────┐
│           [needle swinging back to green]       │
│                                                  │
│              STATUS: RESCUED                    │
│         tx   0x8f2a...c91d  (view ↗)            │
│         audit trail        (view ↗)              │
│                                                  │
└──────────────────────────────────────────────┘
```

### 3.4 Ship's Log (history view)

A chronological log, not a card grid — consistent with a real captain's logbook:

```
┌──────────────────────────────────────────────┐
│  SHIP'S LOG                                     │
│  ──────────────────────────────────────────    │
│  14:02 UTC   HF 1.34 → 1.05    LISTING          │
│  14:03 UTC   nonce collision    survived         │
│  14:03 UTC   gas spike          survived         │
│  14:04 UTC   HF 1.05 → 1.30    RESCUED  tx 0x8f2a │
└──────────────────────────────────────────────┘
```

---

## 4. Copy Guidelines

- Status words are fixed vocabulary — STEADY, LISTING, CAPSIZING, RESCUED, FOUNDERED —
  used consistently everywhere, never swapped for generic words like "safe/danger."
- Rationale text (from the DeepSeek proposer, after passing through the guard) is shown
  in plain language under the gauge when relevant: "Debt exceeds target after price
  move — repaying $23.40 to restore HF to 1.30." State the number, not just the action.
- Never soften a FOUNDERED state — if a rescue fails in testing, say so plainly, don't
  hide it. Candor here matches the hackathon's own submission-form guidance that an
  honest "what still breaks" answer is rewarded, not penalized.

---

## 5. Motion — the one deliberate moment

Only two built animations: (1) the needle drifting during Storm Mode as conditions
degrade, and (2) the needle's return swing on a successful rescue. Everything else —
buttons, log entries appearing, page loads — stays simple and undecorated. Respect
`prefers-reduced-motion`: skip straight to the resolved needle position if set.

---

## 6. Build Notes for Claude Code

- Fonts via `next/font/google`: Space Grotesk, JetBrains Mono.
- The gauge can be built as an SVG arc with a rotating needle `<line>` or `<polygon>`
  transformed via CSS `transform: rotate()` mapped from the health factor value — no
  charting library needed for a single gauge.
- Storm Mode's wave texture: a single subtle SVG or CSS gradient animation, not a
  particle system — keep this restrained, the gauge and the log rows are the content.
- If time is short, cut Ship's Log polish before cutting the Rescue needle-swing
  animation — the swing is what makes this memorable in 30 seconds; the log is proof it
  has memory, same priority order as Preflight's stamp-over-logbook rule.
- This is a genuinely separate frontend from the backend guardian in the research spec
  — it should read from the same `monitor.ts` state (health factor, status, last
  execution result) rather than duplicating any Aave-reading or KeeperHub-calling logic.
  Keep the adapter boundary rule from the research spec intact: only `keeperhub.ts`
  talks to KeeperHub, the frontend only ever reads state the backend already computed.
