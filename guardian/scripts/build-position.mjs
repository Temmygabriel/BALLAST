// ⚓ BUILD A REAL, NEAR-LIQUIDATION AAVE V3 POSITION on the protected wallet.
//
//   node scripts/build-position.mjs
//
// What it does, in order (each step waits for its receipt):
//   1. wrap  ETH → the pool's LISTED WETH
//   2. approve WETH → Aave pool
//   3. supply WETH as collateral
//   4. borrow the pool's LISTED USDC at ~99% of the LTV cap
//      → health factor lands ≈1.04 (under the guardian's 1.05 action line,
//        over the 1.01 emergency line) — no market move needed, purely arithmetic
//   5. fund the KeeperHub execution wallet with enough listed USDC for the repay
//      that lifts the position back to the guardian's 1.30 target
//
// Then run `npm run live` — the guardian should fire within ~2 polls.
//
// Requires PROTECTED_WALLET_PRIVATE_KEY in guardian/.env (already there, gitignored).
// Uses the public wallet (you) to sign; Aave v3 Sepolia addresses verified by probe.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPublicClient, createWalletClient, http, parseEther, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
};

const RPC = get('RPC_URL');
const POOL = get('AAVE_POOL');
const ME = get('PROTECTED_WALLET');
const KEY = get('PROTECTED_WALLET_PRIVATE_KEY');
if (!RPC || !POOL || !KEY || !ME) {
  console.log('✗ RPC_URL / AAVE_POOL / PROTECTED_WALLET(_PRIVATE_KEY) missing in guardian/.env');
  process.exit(1);
}

// Addresses verified by probe-aave.mjs on Sepolia 2026-09-05.
const WETH = '0xc558dbdd856501fcd9aaf1e62eae57a9f0629a3c'; // listed WETH (wraps native ETH)
const USDC = '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8'; // listed USDC (debt side)
const EXEC = '0x851a05FA306080Fd6bA9D961BDf9DD6cca29CA32'; // KeeperHub execution wallet
const EXPLORER = 'https://sepolia.etherscan.io/tx/';

const WRAP_ETH = '0.011'; // how much ETH to put into the position as WETH collateral

const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
const weth = [
  ...erc20,
  { type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] },
];
const pool = [
  {
    type: 'function',
    name: 'supply',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint16' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'borrow',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint16' }, { type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getUserAccountData',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
  },
];

const account = privateKeyToAccount(KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
const usd = (b) => '$' + (Number(b) / 1e8).toFixed(2);

async function send(tag, tx, data) {
  const hash = await wallet.sendTransaction({ ...tx, data });
  const rc = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  console.log(`   ✓ ${tag}  ${hash}  ${EXPLORER}${hash}`);
  if (rc.status !== 'success') throw new Error(`${tag} reverted on chain`);
  return hash;
}
async function write(tag, args) {
  const hash = await wallet.writeContract({ ...args, account, chain: sepolia });
  const rc = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  console.log(`   ✓ ${tag}  ${hash}  ${EXPLORER}${hash}`);
  if (rc.status !== 'success') throw new Error(`${tag} reverted on chain`);
  return hash;
}
const bal = async (tok, who, d) => Number(await publicClient.readContract({ address: tok, abi: erc20, functionName: 'balanceOf', args: [who] })) / 10 ** d;
const accountData = async () => await publicClient.readContract({ address: POOL, abi: pool, functionName: 'getUserAccountData', args: [ME] });

console.log('⚓ Building a real near-liquidation Aave v3 position…');
console.log('   wallet  ' + ME);
console.log('   pool    ' + POOL);
console.log('   wrap    ' + WRAP_ETH + ' ETH → WETH, supply, borrow listed-USDC near LTV cap\n');

console.log('ETH balance   ' + (Number(await publicClient.getBalance({ address: ME })) / 1e18).toFixed(4));
console.log('Circle USDC   ' + (await bal('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', ME, 6)).toFixed(2) + '  (NOT an Aave reserve here — unused)');
console.log('listed USDC   ' + (await bal(USDC, ME, 6)).toFixed(2));
console.log('listed WETH   ' + (await bal(WETH, ME, 18)).toFixed(6) + '\n');

let [C, D, avail] = await accountData();
if (D > 0n) {
  console.log('⚠ a position already exists (debt ' + usd(D) + ') — skipping supply/borrow, going straight to exec funding\n');
} else {
  // 1. wrap ETH → WETH
  const wrapWei = parseEther(WRAP_ETH);
  await send('wrap ETH → WETH', { to: WETH, value: wrapWei }, '0xd0e30db0'); // deposit()
  const wethBal = BigInt((await bal(WETH, ME, 18)) * 1e18);
  console.log('   WETH now held: ' + (Number(wethBal) / 1e18).toFixed(6));

  // 2. approve WETH → pool  (exact amount, not unlimited)
  await write('approve WETH → pool', { address: WETH, abi: erc20, functionName: 'approve', args: [POOL, wethBal] });

  // 3. supply WETH as collateral
  await write('supply WETH to pool', { address: POOL, abi: pool, functionName: 'supply', args: [WETH, wethBal, ME, 0] });

  // 4. read the real collateral value, then borrow listed-USDC near the LTV cap
  [C, D, avail] = await accountData();
  console.log('\n   collateral now  ' + usd(C));
  console.log('   borrowable now  ' + usd(avail));
  const availNum = Number(avail);
  // 99% of the LTV cap → HF ≈ LT/(0.99·LTV) = 8250/(0.99·8000) ≈ 1.042 for WETH
  const units = BigInt(Math.floor((availNum * 0.99) / 100)); // base($1e8) → USDC raw(1e6): /100
  console.log('   borrowing ' + usd((availNum * 0.99)) + ' worth of listed USDC (' + units.toString() + ' raw units)\n');
  await write('borrow listed USDC', { address: POOL, abi: pool, functionName: 'borrow', args: [USDC, units, 2, 0, ME] });

  // 4b. corrective micro-borrow if the oracle/rounding left us above the action line
  for (let i = 0; i < 3; i++) {
    const d2 = await accountData();
    const hf = Number(d2[5]) / 1e18;
    if (hf <= 1.048) break;
    const extra = BigInt(Math.floor((Number(d2[2]) * 0.9) / 100));
    if (extra <= 0n) break;
    console.log(`   HF ${hf.toFixed(4)} still above action line — borrowing a little more`);
    await write('borrow more listed USDC', { address: POOL, abi: pool, functionName: 'borrow', args: [USDC, extra, 2, 0, ME] });
  }
}

// 5. read final position, size the rescue, fund the execution wallet
const fin = await accountData();
C = fin[0]; D = fin[1]; avail = fin[2];
const hf = Number(fin[5]) / 1e18;
const ltBps = fin[3];
console.log('\n--- position ready ---');
console.log('   collateral ' + usd(C) + ' · debt ' + usd(D) + ' · health factor ' + hf.toFixed(4));
if (!(hf > 1.01 && hf < 1.05)) {
  console.log('   ⚠ HF not in (1.01, 1.05): ' + hf.toFixed(4) + ' — the guardian may not fire as intended. Investigate before running `npm run live`.');
}

// rescue to the guardian's target (1.30): repay = debt − collateral·LT/1.30
const targetDebt = (C * ltBps) / 13000n;
const repayBase = D > targetDebt ? D - targetDebt : 0n;
const repayUnits = repayBase / 100n; // base → USDC raw
const fundUnits = (repayUnits * 125n) / 100n; // +25% margin for interest/time
console.log('   target-HF 1.30 rescue ≈ $' + (Number(repayBase) / 1e8).toFixed(2) + ' → funding exec wallet with $' + (Number(fundUnits) / 1e6).toFixed(2) + ' listed USDC');

const execUsdc = await bal(USDC, EXEC, 6);
console.log('   exec wallet listed-USDC before: ' + execUsdc.toFixed(2));
if (fundUnits > 0n && execUsdc < Number(fundUnits) / 1e6) {
  await write('fund exec wallet (listed USDC)', { address: USDC, abi: erc20, functionName: 'transfer', args: [EXEC, fundUnits] });
}
const execUsdc2 = await bal(USDC, EXEC, 6);
const execEth = Number(await publicClient.getBalance({ address: EXEC })) / 1e18;
console.log('   exec wallet listed-USDC after:  ' + execUsdc2.toFixed(2));
console.log('   exec wallet ETH (gas):          ' + execEth.toFixed(4));

console.log('\n✅ Done. The position is ~' + hf.toFixed(2) + ' — run `npm run live` and the guardian should confirm + rescue through KeeperHub.\n');
