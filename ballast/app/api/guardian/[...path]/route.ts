/**
 * ⚓ Cloud demo engine — the guardian, running INSIDE this app.
 *
 * This is what makes the deployed Vercel URL live: instead of pointing at a
 * localhost process that isn't there, the screen talks to the SAME engine right
 * here, server-side. It is either:
 *
 *   SIM  (default, no env)  — MockKeeperHub storm demo. Keyless, judge-safe, and the
 *                             honesty rules hold: the UI never computes — the engine
 *                             code (guardian/) computes, and the screen only reads
 *                             state from it.
 *
 *   LIVE (armed by env)     — the REAL Aave position + a gated KeeperHub rescue.
 *                             Armed when RPC_URL/AAVE_POOL/DEBT_ASSET/PROTECTED_WALLET
 *                             are present in the environment (Vercel dashboard). The
 *                             screen then shows the actual on-chain health factor, and
 *                             POST /rescue can move real value — but ONLY with the
 *                             operator key (x-ballast-key == BALLAST_LIVE_KEY) and only
 *                             when KeeperHub creds are present too. See guardian/src/
 *                             cloud.ts for the honesty rules (no hidden auto-trigger).
 *
 * Routes:
 *   GET  /api/guardian/state     → latest instrument state (JSON)
 *   GET  /api/guardian/events    → Server-Sent Events stream
 *   GET  /api/guardian/health    → { ok, engine }
 *   POST /api/guardian/scenario  → { "name": "storm" | "reset" | <row id> }  (sim only)
 *   POST /api/guardian/rescue    → gated live rescue (x-ballast-key header)
 *
 * Serverless note: a scenario is awaited to completion so the POST response
 * carries the FINAL state even if a request lands on a different instance.
 */
import {
  LiveService,
  SimEngine,
  StateBus,
  liveCfgFromEnv,
  rescueArmed,
  type AdversityId,
  type InstrumentState,
} from 'guardian';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // a storm or a live rescue can take a few seconds

type Engine = { mode: 'sim'; sim: SimEngine; bus: StateBus } | { mode: 'live'; live: LiveService };

/** One engine per warm serverless instance (module + global so it survives HMR). */
const g = globalThis as { __ballastEngine?: Engine };
function buildEngine(): Engine {
  const cfg = liveCfgFromEnv(); // null when the live env vars aren't set → sim demo
  if (cfg) {
    return { mode: 'live', live: new LiveService(cfg) };
  }
  const sim = new SimEngine();
  const bus = new StateBus();
  sim.subscribe((s) => bus.publish(s));
  return { mode: 'sim', sim, bus };
}
function getEngine(): Engine {
  g.__ballastEngine ??= buildEngine();
  return g.__ballastEngine;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const leaf = (req: NextRequest) => req.nextUrl.pathname.split('/').filter(Boolean).pop();

/** Current instrument state for the requesting engine. */
async function currentState(e: Engine): Promise<InstrumentState | null> {
  if (e.mode === 'live') return e.live.getState();
  return e.bus.get();
}

/** Run a sim scenario to completion. Returns false when the name is unknown. */
async function run(name: string, sim: SimEngine): Promise<boolean> {
  switch (name) {
    case 'storm':
      await sim.runStorm();
      return true;
    case 'price-crash':
    case 'crash':
      await sim.quickCrash();
      return true;
    case 'price-blip':
    case 'blip':
      await sim.runBlip(); // single-block scare → confirmation window holds, NO rescue
      return true;
    case 'reset':
      sim.reset();
      return true;
    default:
      if (sim.getState().conditions.some((r) => r.id === name)) {
        await sim.runRow(name as AdversityId);
        return true;
      }
      return false;
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const e = getEngine();
  switch (leaf(req)) {
    case 'state': {
      if (e.mode === 'live') {
        try {
          return json({ ok: true, state: await e.live.getState() });
        } catch (err) {
          return json({ ok: false, error: `live chain read failed: ${(err as Error).message}` }, 503);
        }
      }
      return json({ ok: true, state: e.bus.get() });
    }
    case 'health':
      return json({ ok: true, engine: e.mode, armed: rescueArmed() });
    case 'events': {
      const enc = new TextEncoder();
      let cleanup: (() => void) | undefined;
      let closed = false;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (s: unknown) => {
            if (!closed) {
              try {
                controller.enqueue(enc.encode(`data: ${JSON.stringify(s)}\n\n`));
              } catch {
                /* stream gone */
              }
            }
          };
          // bus.subscribe / live.subscribe push live updates after the initial state.
          const unsub = e.mode === 'live' ? e.live.subscribe(send) : e.bus.subscribe(send);
          let initial: InstrumentState | null = null;
          try {
            initial = await currentState(e);
          } catch {
            /* stream still opens — a live read hiccup shouldn't kill the feed */
          }
          if (initial && !closed) {
            try {
              controller.enqueue(enc.encode(`data: ${JSON.stringify(initial)}\n\n`));
            } catch {
              /* ignore */
            }
          }
          const heart = setInterval(() => {
            if (!closed) {
              try {
                controller.enqueue(enc.encode(': ping\n\n'));
              } catch {
                /* ignore */
              }
            }
          }, 15000);
          cleanup = () => {
            clearInterval(heart);
            unsub();
          };
          req.signal.addEventListener('abort', () => {
            closed = true;
            cleanup?.();
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          });
        },
        cancel() {
          closed = true;
          cleanup?.();
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }
    default:
      return json({ ok: false, error: 'not found' }, 404);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const e = getEngine();

  // ── POST /rescue — the gated, real-money path (live engine only) ──
  if (leaf(req) === 'rescue') {
    if (e.mode !== 'live') {
      return json({ ok: false, error: 'sim engine — there is no real position to rescue (deploy with the live env vars to arm it)' }, 409);
    }
    if (!rescueArmed()) {
      return json({ ok: false, error: 'rescue is disarmed here — set BALLAST_LIVE_KEY + KeeperHub creds in the environment' }, 503);
    }
    const secret = process.env.BALLAST_LIVE_KEY;
    const supplied = req.headers.get('x-ballast-key') ?? '';
    if (!secret || supplied !== secret) {
      return json({ ok: false, error: 'missing or incorrect x-ballast-key header' }, 401);
    }
    const { state, reply } = await e.live.rescueNow();
    return json({ ok: true, state, rescue: reply });
  }

  // ── POST /scenario — sim storm controls (refused in live; a real position is not a toy) ──
  if (e.mode === 'live') {
    return json({ ok: false, error: 'live engine — sim scenarios are disabled (the storm deck only exists in the keyless sim demo)' }, 409);
  }
  let name = '';
  try {
    name = ((await req.json()) as { name?: string }).name ?? '';
  } catch {
    name = '';
  }
  if (!name) return json({ ok: false, error: 'send { "name": "storm" }' }, 400);

  const handled = await run(name, e.sim);
  if (!handled) return json({ ok: false, error: `unknown scenario "${name}"` }, 404);

  // Include the final state so the UI can resync even across serverless instances.
  return json({ ok: true, scenario: name, state: e.bus.get() as InstrumentState | null });
}
