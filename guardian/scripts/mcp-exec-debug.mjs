// ⚓ DEBUG: land ONE real (non-simulated) KeeperHub execution — a harmless
// ERC20 approve (USDC → Aave pool, gas-only, no value) — and print the RAW
// response + get_direct_execution_status polling, so we learn the exact field
// names LiveKeeperHub.execute()/waitForTx() must map (executionId, status,
// transactionHash/txHash, auditUrl…).
//
//   node scripts/mcp-exec-debug.mjs
//
// First run lands a real Sepolia tx (gas only). Safe to re-run: fixed
// idempotency key means a retry returns the SAME execution, never a duplicate.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
};
const MCP = get('KEEPERHUB_MCP_URL');
const KH = get('KEEPERHUB_API_KEY');
const RPC = get('RPC_URL');

const POOL = '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951';
const USDC = '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8';
const EXEC = '0x851a05FA306080Fd6bA9D961BDf9DD6cca29CA32'; // KeeperHub execution wallet
const EXPLORER = 'https://sepolia.etherscan.io/tx/';
const KEY = 'ballast-approve-prim-1'; // fixed → re-runs dedupe

const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const transport = new StreamableHTTPClientTransport(new URL(MCP), {
  requestInit: { headers: { Authorization: `Bearer ${KH}` } },
});
const client = new Client({ name: 'ballast-exec-debug', version: '0.1.0' });
await client.connect(transport);

// exec wallet's full listed-USDC balance (raw units) → approve it all to the pool
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];
const bal = await pub.readContract({ address: USDC, abi: erc20, functionName: 'balanceOf', args: [EXEC] });
console.log('exec listed-USDC balance:', bal.toString(), 'raw');

console.log('\n--- execute_contract_call (REAL, not simulate) approve(pool, balance) ---');
const exec = await client.callTool({
  name: 'execute_contract_call',
  arguments: {
    chain_id: '11155111',
    contract_address: USDC,
    function_name: 'approve',
    function_args: JSON.stringify([POOL, bal.toString()]),
    idempotency_key: KEY,
  },
});
console.log(JSON.stringify(exec, null, 2));
let parsed;
try {
  parsed = JSON.parse(exec.content.find((c) => c.type === 'text').text);
  console.log('\n--- parsed ---');
  console.log(JSON.stringify(parsed, null, 2));
  console.log('\nparsed keys:', Object.keys(parsed));
} catch (e) {
  console.log('could not parse (not JSON?):', e.message);
}

// If we got an execution id, poll status to completion, printing raw shapes.
const execId =
  parsed?.executionId ?? parsed?.id ?? parsed?.execution_id ?? parsed?.execution?.id ?? '';
if (!execId) {
  console.log('\n⚠ no execution id found in response — nothing to poll. Inspect raw above.');
  await client.close();
  process.exit(0);
}
console.log('\n--- polling get_direct_execution_status for', execId, '---');
for (let i = 0; i < 15; i++) {
  const st = await client.callTool({
    name: 'get_direct_execution_status',
    arguments: { execution_id: execId },
  });
  let s;
  try {
    s = JSON.parse(st.content.find((c) => c.type === 'text').text);
  } catch {
    s = st;
  }
  console.log('poll', i, '→', JSON.stringify(s).slice(0, 600));
  const status = s?.status;
  if (status === 'completed' || status === 'failed') {
    console.log('\nFINAL: status =', status);
    console.log('txHash field guesses →', s?.transactionHash ?? s?.txHash ?? '(none)');
    if (s?.transactionHash ?? s?.txHash) {
      console.log('explorer:', EXPLORER + (s.transactionHash ?? s.txHash));
    }
    console.log('full final status keys:', Object.keys(s));
    break;
  }
  await new Promise((r) => setTimeout(r, 3000));
}
await client.close();
