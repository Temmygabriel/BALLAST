/**
 * ⚓ Cloud demo engine — the guardian's SIM engine, running INSIDE this app.
 *
 * This is what makes the deployed Vercel URL live: instead of pointing at a
 * localhost process that isn't there, the screen talks to the SAME engine right
 * here, server-side. It's the offline demo (MockKeeperHub, no keys, clearly
 * marked "sim"), so the honesty rules hold: the UI still never computes — the
 * engine code (guardian/) computes, and the screen only reads state from it.
 *
 * Routes:
 *   GET  /api/guardian/state     → latest instrument state (JSON)
 *   GET  /api/guardian/events    → Server-Sent Events stream
 *   GET  /api/guardian/health    → { ok, engine }
 *   POST /api/guardian/scenario  → { "name": "storm" | "reset" | <row id> }
 *
 * Serverless note: a scenario is awaited to completion so the POST response
 * carries the FINAL state even if a request lands on a different instance.
 */
import { SimEngine, StateBus, type InstrumentState, type AdversityId } from 'guardian';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // a full storm can take a few seconds; keep breathing room

interface Engine {
  sim: SimEngine;
  bus: StateBus;
}

/** One engine per warm serverless instance (module + global so it survives HMR). */
const g = globalThis as { __ballastEngine?: Engine };
function getEngine(): Engine {
  if (!g.__ballastEngine) {
    const sim = new SimEngine();
    const bus = new StateBus();
    sim.subscribe((s) => bus.publish(s));
    g.__ballastEngine = { sim, bus };
  }
  return g.__ballastEngine;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const leaf = (req: NextRequest) => req.nextUrl.pathname.split('/').filter(Boolean).pop();

/** Run a scenario to completion. Returns false when the name is unknown. */
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
  const { bus } = getEngine();
  switch (leaf(req)) {
    case 'state':
      return json({ ok: true, state: bus.get() });
    case 'health':
      return json({ ok: true, engine: bus.get()?.engineMode ?? null });
    case 'events': {
      const enc = new TextEncoder();
      let cleanup: (() => void) | undefined;
      let closed = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (s: unknown) => {
            if (!closed) {
              try {
                controller.enqueue(enc.encode(`data: ${JSON.stringify(s)}\n\n`));
              } catch {
                /* stream gone */
              }
            }
          };
          // bus.subscribe replays the latest state first, then live updates.
          const unsub = bus.subscribe(send);
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
  const { sim, bus } = getEngine();
  let name = '';
  try {
    name = ((await req.json()) as { name?: string }).name ?? '';
  } catch {
    name = '';
  }
  if (!name) return json({ ok: false, error: 'send { "name": "storm" }' }, 400);

  const handled = await run(name, sim);
  if (!handled) return json({ ok: false, error: `unknown scenario "${name}"` }, 404);

  // Include the final state so the UI can resync even across serverless instances.
  return json({ ok: true, scenario: name, state: bus.get() as InstrumentState | null });
}
