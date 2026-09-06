/**
 * ⚓ Cloud demo engine — the guardian, running INSIDE this app.
 *
 * This is what makes the deployed Vercel URL live: instead of pointing at a
 * localhost process that isn't there, the screen talks to the SAME engine right
 * here, server-side.
 *
 * One URL can now host BOTH engines, so a single deploy can carry a LIVE ⇄ SIM
 * switch:
 *
 *   SIM   — MockKeeperHub storm demo. Keyless, judge-safe. The UI never computes —
 *           the engine code (guardian/) computes, and the screen only reads state.
 *   LIVE  — the REAL Aave position + a gated KeeperHub rescue. Armed when
 *           RPC_URL/AAVE_POOL/DEBT_ASSET/PROTECTED_WALLET are present in the
 *           environment (Vercel dashboard). POST /rescue can move real value — but
 *           ONLY with the operator key (x-ballast-key == BALLAST_LIVE_KEY) and only
 *           when KeeperHub creds are present too. See guardian/src/cloud.ts for the
 *           honesty rules (no hidden auto-trigger).
 *
 * Routing:
 *   The DEFAULT namespace (no leading segment) is the LIVE engine when armed,
 *   else SIM — so every existing call keeps working exactly as before:
 *     GET  /api/guardian/state     → live position (or sim, when unarmed)
 *     GET  /api/guardian/events    → Server-Sent Events stream
 *     GET  /api/guardian/health    → { ok, engine, armed }
 *     POST /api/guardian/scenario  → sim only (refused while the default is LIVE,
 *                                    so a real position is never a toy)
 *     POST /api/guardian/rescue    → gated live rescue (x-ballast-key header)
 *
 *   The SIM engine is ALWAYS hosted, and is reachable under /sim even on a
 *   live-armed deploy (this is what powers the in-page LIVE ⇄ SIM switch):
 *     GET  /api/guardian/sim/state     → the synthetic storm state
 *     GET  /api/guardian/sim/health    → { ok, engine: 'sim', armed: false }
 *     POST /api/guardian/sim/scenario  → { "name": "storm" | "reset" | <row id> }
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

/** Everything this instance can serve. sim is always present; live only when armed. */
type Hosted = { sim: SimEngine; bus: StateBus; live: LiveService | null };

/** One engine host per warm serverless instance (module + global so it survives HMR). */
const g = globalThis as { __ballastHosted?: Hosted };
function buildHosted(): Hosted {
  const sim = new SimEngine();
  const bus = new StateBus();
  sim.subscribe((s) => bus.publish(s));
  const cfg = liveCfgFromEnv(); // null when the live env vars aren't set → sim default
  return { sim, bus, live: cfg ? new LiveService(cfg) : null };
}
function getHosted(): Hosted {
  g.__ballastHosted ??= buildHosted();
  return g.__ballastHosted;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The catch-all segments after the route mount point (e.g. ['sim','state']). */
function segsOf(req: NextRequest): string[] {
  const all = req.nextUrl.pathname.split('/').filter(Boolean);
  const at = all.lastIndexOf('guardian');
  return at >= 0 ? all.slice(at + 1) : all;
}

/** Resolve a request to (namespace, leaf). A leading 'sim' selects the sim engine. */
function target(segs: string[]): { ns: 'default' | 'sim'; leaf: string } {
  if (segs[0] === 'sim') return { ns: 'sim', leaf: segs[1] ?? '' };
  return { ns: 'default', leaf: segs[segs.length - 1] ?? '' };
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

/** SSE feed. `subscribe` mirrors the live or sim engine; `initial` seeds the stream. */
function sse(
  req: NextRequest,
  subscribe: (send: (s: unknown) => void) => () => void,
  initial: () => Promise<InstrumentState | null>,
): Response {
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
      const unsub = subscribe(send);
      let first: InstrumentState | null = null;
      try {
        first = await initial();
      } catch {
        /* stream still opens — a live read hiccup shouldn't kill the feed */
      }
      if (first && !closed) {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(first)}\n\n`));
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

export async function GET(req: NextRequest): Promise<Response> {
  const h = getHosted();
  const { ns, leaf } = target(segsOf(req));

  // ── /sim/* — the synthetic sandbox, available even on a live-armed deploy ──
  if (ns === 'sim') {
    switch (leaf) {
      case 'state':
        return json({ ok: true, state: h.bus.get() });
      case 'health':
        return json({ ok: true, engine: 'sim', armed: false });
      case 'events':
        return sse(req, (send) => h.bus.subscribe(send), () => Promise.resolve(h.bus.get()));
      default:
        return json({ ok: false, error: 'not found' }, 404);
    }
  }

  // ── default namespace — LIVE when armed, else SIM (unchanged behaviour) ──
  const live = h.live;
  switch (leaf) {
    case 'state': {
      if (live) {
        try {
          return json({ ok: true, state: await live.getState() });
        } catch (err) {
          return json({ ok: false, error: `live chain read failed: ${(err as Error).message}` }, 503);
        }
      }
      return json({ ok: true, state: h.bus.get() });
    }
    case 'health':
      return json({ ok: true, engine: live ? 'live' : 'sim', armed: rescueArmed() });
    case 'events': {
      if (live) {
        return sse(req, (send) => live.subscribe(send), () => live.getState());
      }
      return sse(req, (send) => h.bus.subscribe(send), () => Promise.resolve(h.bus.get()));
    }
    default:
      return json({ ok: false, error: 'not found' }, 404);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const h = getHosted();
  const { ns, leaf } = target(segsOf(req));

  // ── POST /sim/scenario — sim storm controls, always allowed in the sandbox ──
  if (ns === 'sim') {
    if (leaf !== 'scenario') {
      return json({ ok: false, error: 'not found' }, 404);
    }
    let name = '';
    try {
      name = ((await req.json()) as { name?: string }).name ?? '';
    } catch {
      name = '';
    }
    if (!name) return json({ ok: false, error: 'send { "name": "storm" }' }, 400);
    const handled = await run(name, h.sim);
    if (!handled) return json({ ok: false, error: `unknown scenario "${name}"` }, 404);
    return json({ ok: true, scenario: name, state: h.bus.get() as InstrumentState | null });
  }

  // ── POST /rescue — the gated, real-money path (live engine only) ──
  if (leaf === 'rescue') {
    if (!h.live) {
      return json(
        { ok: false, error: 'sim engine — there is no real position to rescue (deploy with the live env vars to arm it)' },
        409,
      );
    }
    if (!rescueArmed()) {
      return json(
        { ok: false, error: 'rescue is disarmed here — set BALLAST_LIVE_KEY + KeeperHub creds in the environment' },
        503,
      );
    }
    const secret = process.env.BALLAST_LIVE_KEY;
    const supplied = req.headers.get('x-ballast-key') ?? '';
    if (!secret || supplied !== secret) {
      return json({ ok: false, error: 'missing or incorrect x-ballast-key header' }, 401);
    }
    const { state, reply } = await h.live.rescueNow();
    return json({ ok: true, state, rescue: reply });
  }

  // ── POST /scenario (default ns) — refused while the default engine is LIVE;
  //    a real position is not a toy. Use /sim/scenario for the sandbox. ──
  if (leaf === 'scenario') {
    if (h.live) {
      return json(
        { ok: false, error: 'live engine — sim scenarios are disabled (use the SIM mode switch, which talks to /sim/scenario)' },
        409,
      );
    }
    let name = '';
    try {
      name = ((await req.json()) as { name?: string }).name ?? '';
    } catch {
      name = '';
    }
    if (!name) return json({ ok: false, error: 'send { "name": "storm" }' }, 400);
    const handled = await run(name, h.sim);
    if (!handled) return json({ ok: false, error: `unknown scenario "${name}"` }, 404);
    return json({ ok: true, scenario: name, state: h.bus.get() as InstrumentState | null });
  }

  return json({ ok: false, error: 'not found' }, 404);
}
