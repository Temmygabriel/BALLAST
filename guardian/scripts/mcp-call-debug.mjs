// DEBUG: print the RAW MCP response from execute_contract_call (simulate),
// exactly as LiveKeeperHub receives it, so we can parse the right fields.
//   node scripts/mcp-call-debug.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
};
const MCP = get('KEEPERHUB_MCP_URL');
const KH = get('KEEPERHUB_API_KEY');

const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const transport = new StreamableHTTPClientTransport(new URL(MCP), {
  requestInit: { headers: { Authorization: `Bearer ${KH}` } },
});
const client = new Client({ name: 'ballast-debug', version: '0.1.0' });
await client.connect(transport);

const res = await client.callTool({
  name: 'execute_contract_call',
  arguments: {
    chain_id: '11155111',
    contract_address: '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8',
    function_name: 'approve',
    function_args: '["0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951","8660000"]',
    simulate: true,
  },
});
console.log('--- full raw response ---');
console.log(JSON.stringify(res, null, 2));
console.log('--- keys ---', Object.keys(res));
console.log('structuredContent:', JSON.stringify(res.structuredContent));
console.log('content:', JSON.stringify(res.content));
await client.close();
