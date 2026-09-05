// Probe: reproduce the CLOUD's exact approve dry-run through the REAL KeeperHub MCP,
// for each candidate DEBT_ASSET value. simulate:true only — nothing is broadcast.
// Uses real kh_ key from guardian/.env; never prints it.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LiveKeeperHub } from '../src/keeperhub.ts';

const here = dirname(fileURLToPath(import.meta.url));
const env = existsSync(join(here, '..', '.env')) ? readFileSync(join(here, '..', '.env'), 'utf8') : '';
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  if (!m) return '';
  return m[1].replace(/\s+#.*$/, '').trim(); // strip inline comments like env.ts
};

const keeper = new LiveKeeperHub({
  mcpUrl: get('KEEPERHUB_MCP_URL'),
  apiKey: get('KEEPERHUB_API_KEY'),
});

const POOL = get('AAVE_POOL');
const LISTED_OK = '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8';       // valid (all-lower)
const LISTED_BAD = '0x94a9d9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8';   // wrong checksum — what the docs print
const REAL = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';          // real Circle USDC

const sim = async (label, contractAddress) => {
  const r = await keeper.simulate({
    network: '11155111',
    contractAddress,
    abiFunction: 'approve(address,uint256)',
    args: [POOL, '7000000'],
  });
  console.log(
    `  ${label}\n    ${contractAddress}\n    -> success=${r.success} wouldRevert=${r.wouldRevert} error=${r.error ?? '(none)'}\n`,
  );
};

console.log('pool ' + POOL + '\n');
await sim('A listed USDC all-lowercase  ', LISTED_OK);
await sim('B listed USDC BAD checksum  ', LISTED_BAD);
await sim('C real Circle USDC          ', REAL);
console.log('done');
