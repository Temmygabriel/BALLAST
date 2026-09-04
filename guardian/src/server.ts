/**
 * A tiny SSE/HTTP server so the Ballast screen can read live state and trigger
 * scenarios. No framework — just node's http, kept deliberately small.
 *
 *   GET  /events     → Server-Sent Events stream of every instrument state
 *   GET  /state      → latest instrument state as JSON
 *   POST /scenario   → { "name": "storm" | "price-crash" | "gas-spike" | ... | "reset" }
 *   GET  /health     → { ok: true }
 *
 * CORS is wide-open on purpose: this is a local/cloud demo feed the UI consumes.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { StateBus } from './bus';

export interface ServerHandlers {
  bus: StateBus;
  /** Handle a scenario request. Return false when the name is unknown. */
  dispatch(name: string): Promise<boolean> | boolean;
}

const cors = (res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};
const json = (res: ServerResponse, code: number, body: unknown) => {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function startServer({ bus, dispatch }: ServerHandlers, port = 4300) {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url ?? '/').split('?')[0]!;

    if (req.method === 'OPTIONS') {
      cors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    // Latest state, as JSON.
    if (req.method === 'GET' && url === '/state') {
      json(res, 200, { ok: true, state: bus.get() });
      return;
    }

    // Health.
    if (req.method === 'GET' && url === '/health') {
      json(res, 200, { ok: true, engine: bus.get()?.engineMode ?? null });
      return;
    }

    // Server-Sent Events stream.
    if (req.method === 'GET' && url === '/events') {
      cors(res);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      const send = (s: unknown) => res.write(`data: ${JSON.stringify(s)}\n\n`);
      const unsub = bus.subscribe(send);
      const heart = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(heart);
        unsub();
      });
      return;
    }

    // Trigger a scenario.
    if (req.method === 'POST' && url === '/scenario') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', async () => {
        let name = '';
        try {
          name = (JSON.parse(body || '{}') as { name?: string }).name ?? '';
        } catch {
          name = '';
        }
        if (!name) return json(res, 400, { ok: false, error: 'send { "name": "storm" }' });
        const handled = await dispatch(name);
        if (!handled) return json(res, 404, { ok: false, error: `unknown scenario "${name}"` });
        json(res, 200, { ok: true, scenario: name });
      });
      return;
    }

    json(res, 404, { ok: false, error: 'not found' });
  });

  server.listen(port);
  return server;
}
