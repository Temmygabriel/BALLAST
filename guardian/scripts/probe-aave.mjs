// 🔎 READ-ONLY probe of Aave v3 (round 3): decide HOW to fund + build a real position.
//   node scripts/probe-aave.mjs
// Everything below is eth_call / getCode / balanceOf — nothing signed, nothing broadcast.
//
// Questions it answers:
//   1. For every reserve: symbol, decimals, LTV, LT, usable-as-collateral?, borrowable?,
//      active/frozen (correct index decode this time), and the min-HF reachable by a
//      fresh max borrow (LT/LTV) — do we even HAVE a route under the guardian's 1.05?
//   2. Does the listed WETH accept native ETH (deposit) so we can turn our ETH into a
//      usable collateral asset?
//   3. Do the listed mock tokens expose an open faucet/mint, so we can fund wallets
//      with a listed stablecoin for the debt side + execution-wallet funding?
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPublicClient, http, toFunctionSelector } from 'viem';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
};

const RPC = get('RPC_URL');
const POOL = get('AAVE_POOL');
const WALLET = get('PROTECTED_WALLET');

const A = {
  symbol: [{ type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
  name: [{ type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
  decimals: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }],
  balanceOf: [
    { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  ],
  reservesList: [{ type: 'function', name: 'getReservesList', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] }],
  addressesProvider: [
    { type: 'function', name: 'ADDRESSES_PROVIDER', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  ],
  getPoolDataProvider: [
    { type: 'function', name: 'getPoolDataProvider', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  ],
  getAaveProtocolDataProvider: [
    { type: 'function', name: 'getAaveProtocolDataProvider', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  ],
  reserveCfg: [
    {
      type: 'function',
      name: 'getReserveConfigurationData',
      stateMutability: 'view',
      inputs: [{ name: 'asset', type: 'address' }],
      outputs: [
        { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
        { type: 'bool' }, { type: 'bool' }, { type: 'bool' }, { type: 'bool' }, { type: 'bool' },
      ],
    },
  ],
};

if (!RPC || !POOL) {
  console.log('✗ RPC_URL or AAVE_POOL missing in guardian/.env');
  process.exit(1);
}
const client = createPublicClient({ transport: http(RPC) });
const read = (address, abi, fn, args = []) =>
  client.readContract({ address, abi, functionName: fn, args }).catch((e) => ({ __err: e.message.split('\n')[0] }));

/** eth_call "simulate" a write (from a given wallet) — free, reads whether it would revert. */
async function simulateCall(probe, { from, to, value = 0n }) {
  try {
    await client.call({ account: from, to, data: probe, value });
    return 'ok (no revert)';
  } catch (e) {
    const m = (e.shortMessage || e.message || '').toString();
    return 'REVERTS: ' + m.split('\n')[0].slice(0, 120);
  }
}
const iface = (sig) => toFunctionSelector(sig); // 4-byte selector
const pad = (v) => (v === 0n ? '0'.repeat(64) : v.toString(16).padStart(64, '0'));
const calldata = (sig, arg) => iface(sig) + pad(arg);

// derive provider
let provider = '';
try {
  const ap = await read(POOL, A.addressesProvider, 'ADDRESSES_PROVIDER');
  provider = (await read(ap, A.getPoolDataProvider, 'getPoolDataProvider'));
  if (provider.__err) provider = await read(ap, A.getAaveProtocolDataProvider, 'getAaveProtocolDataProvider');
  if (provider.__err) throw new Error(provider.__err);
} catch (e) {
  console.log('✗ could not derive PoolDataProvider: ' + e.message);
}

const reserves = await read(POOL, A.reservesList, 'getReservesList');
console.log(`--- ${reserves.length} reserves (correct decode) ---`);
const USDC = '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8'.toLowerCase();
const WETH = '0xc558dbdd856501fcd9aaf1e62eae57a9f0629a3c'.toLowerCase();
const targets = {};
for (const asset of reserves) {
  const a = asset.toLowerCase();
  const sym = (await read(asset, A.symbol, 'symbol')) ?? '?';
  const nm = (await read(asset, A.name, 'name')) ?? '?';
  const dec = Number((await read(asset, A.decimals, 'decimals')) ?? 0);
  const cfg = provider ? await read(provider, A.reserveCfg, 'getReserveConfigurationData', [asset]) : { __err: 'no provider' };
  if (cfg && !cfg.__err) {
    const ltv = Number(cfg[1]), lt = Number(cfg[2]);
    const flags =
      `LTV ${(ltv / 100).toFixed(0)}% · LT ${(lt / 100).toFixed(0)}%` +
      ` · ${cfg[5] ? 'collateral' : 'NOT-coll'}` +
      ` · ${cfg[6] ? 'borrowable' : 'not-borrow'}` +
      ` · ${cfg[8] ? 'active' : 'INACTIVE'}${cfg[9] ? ' FROZEN' : ''}` +
      (ltv > 0 ? ` · fresh-max-borrow HF ≈ ${(lt / ltv).toFixed(3)}` : '');
    console.log(`${String(sym).padEnd(5)} ${nm} (${a})\n     ${flags}`);
    targets[a] = { sym: String(sym), address: asset, cfg };
  } else {
    console.log(`${String(sym).padEnd(5)} ${nm} (${a})\n     cfg: ${(cfg && cfg.__err) || 'unavailable'}`);
  }
}
console.log('');

// 1. which collateral can reach HF < 1.05 (guardian fires on 1.05)? LT/LTV < 1.05 wins.
const usable = Object.entries(targets).filter(([a, t]) => t.cfg && t.cfg[8] && t.cfg[5] && Number(t.cfg[1]) > 0);
console.log("--- collateral candidates where a fresh max borrow lands UNDER the guardian's 1.05 ---");
for (const [a, t] of usable) {
  const lt = Number(t.cfg[2]), ltv = Number(t.cfg[1]);
  console.log(`  ${String(t.sym).padEnd(5)} ${(lt / ltv).toFixed(3)}  ${lt / ltv < 1.05 ? '✓ fires' : '(needs LT/LTV < 1.05)'}`);
}

// 2. does listed WETH take native ETH?
console.log('\n--- can we turn our ETH into listed WETH (' + WETH + ')? ---');
const wethName = (await read(WETH, A.name, 'name')) ?? '?';
console.log('  name: ' + wethName);
const wethBal = await read(WETH, A.balanceOf, 'balanceOf', [WALLET]);
console.log('  wallet WETH balance: ' + (wethBal.__err ? '?' : Number(wethBal) / 1e18));
const depositSel = iface('deposit()');
console.log('  deposit() with 0.001 ETH: ' + (await simulateCall(depositSel, { from: WALLET, to: WETH, value: 10n ** 15n })));

// 3. open faucet/mint on the listed USDC + a couple others? (from the protected wallet)
console.log('\\n--- who can we mint listed stablecoins from? (eth_call sims, from protected wallet) ---');
const amountUSDC = 200n * 10n ** 6n; // 200 USDC units (6dp)
const amount18 = 200n * 10n ** 18n;
for (const a of Object.keys(targets)) {
  const t = targets[a];
  const amt = Number(t.cfg[0]) === 6 ? amountUSDC : amount18;
  const f1 = await simulateCall(calldata('faucet(uint256)', amt), { from: WALLET, to: t.address });
  const f2 = await simulateCall(calldata('mint(uint256)', amt), { from: WALLET, to: t.address });
  console.log(`  ${String(t.sym).padEnd(5)} faucet(200): ${f1}\n       mint(200):   ${f2}`);
}
