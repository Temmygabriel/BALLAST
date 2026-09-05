// Read-only Sepolia balance checker — no keys, no network signups.
// node scripts/check-balances.mjs [addr...]
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RPCS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
  'https://1rpc.io/sepolia',
];
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const BAL = '0x70a08231000000000000000000000000'; // balanceOf(address)

async function rpc(method, params) {
  for (const r of RPCS) {
    try {
      const x = await fetch(r, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const j = await x.json();
      if (j.result) return j.result;
    } catch {}
  }
  throw new Error(method + ' failed on all public RPCS');
}

const addrs = process.argv.slice(2);
if (addrs.length === 0) {
  // Default: whatever wallet is in guardian/.env plus the KeeperHub wallet.
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const m = env.match(/^PROTECTED_WALLET=(0x[0-9a-fA-F]{40})/m);
  addrs.push(m ? m[1] : '0x0000000000000000000000000000000000000000');
  addrs.push('0x851a05FA306080Fd6bA9D961BDf9DD6cca29CA32'); // KeeperHub execution wallet
}

for (const a of addrs) {
  const ethHex = await rpc('eth_getBalance', [a, 'latest']);
  const usdcHex = await rpc('eth_call', [{ to: USDC, data: BAL + a.slice(2).toLowerCase() }, 'latest']);
  const eth = Number(BigInt(ethHex)) / 1e18;
  const usdc = Number(BigInt(usdcHex)) / 1e6;
  console.log(a);
  console.log('   ETH  ' + eth.toFixed(6));
  console.log('   USDC ' + usdc.toFixed(2));
  console.log('');
}
