// Verify the two LIVE-mode credentials actually work, the same way guardian will use them.
//   node scripts/verify-live.mjs
// Tests: (1) your RPC URL reads Sepolia, (2) your KeeperHub API key connects to the MCP.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
};
const mask = (s) => (s.length > 12 ? s.slice(0, 7) + '…' + s.slice(-4) : '(empty)');

const RPC = get('RPC_URL');
const MCP = get('KEEPERHUB_MCP_URL');
const KH = get('KEEPERHUB_API_KEY');
const wallet = get('PROTECTED_WALLET');

console.log('RPC_URL       ' + (RPC ? mask(RPC) : '(empty)'));
console.log('KEEPERHUB_URL ' + (MCP ? MCP : '(empty)'));
console.log('KEEPERHUB_KEY ' + (KH ? mask(KH) : '(empty)'));
console.log('');

// --- 1. RPC ---
if (!RPC) {
  console.log('✗ RPC_URL is empty — put your Alchemy (Sepolia) HTTPS endpoint in guardian/.env');
} else {
  try {
    const bn = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    }).then((r) => r.json());
    if (bn.result) {
      const block = parseInt(bn.result, 16);
      console.log(`✓ RPC works — Sepolia block #${block.toLocaleString()}`);
      // prove it can read the protected wallet
      const bal = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [wallet, 'latest'] }),
      }).then((r) => r.json());
      console.log(`✓ can read ${wallet.slice(0, 8)}… → ${(Number(BigInt(bal.result)) / 1e18).toFixed(6)} ETH`);
    } else {
      console.log('✗ RPC answered but with no block number:', JSON.stringify(bn).slice(0, 200));
    }
  } catch (e) {
    console.log('✗ RPC failed:', e.message);
  }
}
console.log('');

// --- 2. KeeperHub MCP (same connection LiveKeeperHub makes) ---
if (!MCP || !KH) {
  console.log('✗ KEEPERHUB_MCP_URL or KEEPERHUB_API_KEY empty');
} else {
  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import(
      '@modelcontextprotocol/sdk/client/streamableHttp.js'
    );
    const transport = new StreamableHTTPClientTransport(new URL(MCP), {
      requestInit: { headers: { Authorization: `Bearer ${KH}` } },
    });
    const client = new Client({ name: 'ballast-verify', version: '0.1.0' });
    await client.connect(transport);
    const tools = await client.listTools();
    console.log(`✓ KeeperHub MCP connected — ${tools.tools.length} tools available`);
    await client.close();
  } catch (e) {
    console.log('✗ KeeperHub MCP failed:', (e && e.message) || e);
  }
}
