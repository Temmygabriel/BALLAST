// ⚓ BORROW MORE — push an EXISTING healthy Aave v3 position toward liquidation.
//
//   node scripts/borrow-more.mjs [targetHf]   # default target ≈ 1.04
//
// Use this AFTER a rescue left the position healthy (HF ~1.30) and you want a
// fresh near-liquidation episode to demo/watch a new rescue. It:
//   1. reads the live position (collateral C, debt D, borrowable, liquidation
//      threshold lt) on the protected wallet
//   2. borrows just enough of the pool's LISTED USDC so that
//        HF = (C × lt) / D  lands at [targetHf]
//      (one estimate + corrective micro-borrows that only fire while HF is still
//       above target — it never overshoots below the emergency line by design)
//   3. sizes the follow-up rescue (back to the guardian's 1.30 target) and tops
//      up the KeeperHub execution wallet if it can't cover it
//
// SAFETY: this parks a REAL position near liquidation. Do not run it unless a
// rescue path is ready to fire right after — the cloud RESCUE NOW (needs
// KeeperHub creds + BALLAST_LIVE_KEY on Vercel) or `npm run live` locally.
//
// Requires PROTECTED_WALLET_PRIVATE_KEY in guardian/.env (already there, gitignored).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPublicClient, createWalletClient, http } from 'viem';
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
const USDC = '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8'; // listed USDC (debt side)
const EXEC = '0x851a05FA306080Fd6bA9D961BDf9DD6cca29CA32'; // KeeperHub execution wallet
const EXPLORER = 'https://sepolia.etherscan.io/tx/';
const RESCUE_TARGET_HF = 1.3; // the guardian's target — follow-up rescue repays to here

const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
const pool = [
  {
    type: 'function',
    name: 'borrow',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint16' }, { type: 'address' }],
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

const targetHf = Number(process.argv[2] ?? '1.04');
if (!(targetHf >= 1.02 && targetHf <= 1.2)) {
  console.log(`✗ targetHf ${targetHf} out of safe range (1.02–1.2). You almost certainly want ~1.04.`);
  process.exit(1);
}

const account = privateKeyToAccount(KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
const usd = (b) => '$' + (Number(b) / 1e8).toFixed(2);

async function write(tag, args) {
  const hash = await wallet.writeContract({ ...args, account, chain: sepolia });
  const rc = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  console.log(`   ✓ ${tag}  ${hash}  ${EXPLORER}${hash}`);
  if (rc.status !== 'success') throw new Error(`${tag} reverted on chain`);
  return hash;
}
const bal = async (tok, who) => Number(await publicClient.readContract({ address: tok, abi: erc20, functionName: 'balanceOf', args: [who] }));
const accountData = async () => await publicClient.readContract({ address: POOL, abi: pool, functionName: 'getUserAccountData', args: [ME] });

console.log('⚓ Borrowing more listed-USDC to push the position to HF ≈ ' + targetHf + '…');
console.log('   wallet  ' + ME);
console.log('   pool    ' + POOL + '\n');

let [C, D, avail, lt] = await accountData();
let hf = Number((C * lt) / (D === 0n ? 1n : D)) / 1e18;
if (D === 0n || hf > 100) {
  console.log('✗ No debt on this position yet — this script re-borrows an EXISTING loan.');
  console.log('  Use build-position.mjs first (it supplies collateral AND borrows near the LTV cap).');
  process.exit(1);
}
if (hf <= targetHf) {
  console.log(`   HF ${hf.toFixed(4)} is already at/below ${targetHf} — nothing to borrow. A rescue should already be on it.`);
  process.exit(0);
}
console.log('   starting: collateral ' + usd(C) + ' · debt ' + usd(D) + ' · HF ' + hf.toFixed(4) + ' · borrowable ' + usd(avail) + '\n');

// Borrow in estimate + corrective steps. Each step reads fresh state and only
// fires while HF is still above target → it approaches the line, never overshoots.
for (let i = 0; i < 4; i++) {
  [C, D, avail, lt] = await accountData();
  hf = Number((C * lt) / (D === 0n ? 1n : D)) / 1e18;
  if (hf <= targetHf) break;
  // HF = (C·lt) / D (C, D in base 1e8; lt in bps). To land at targetHf we need
  // D_target = C·lt / targetHf, so the extra debt is D_target − D. Cap at 95% of
  // what Aave still lets us borrow. base(1e8) → USDC raw(1e6) is a ÷100.
  const neededBase = (Number(C) * Number(lt)) / targetHf - Number(D);
  const capBase = Number(avail) * 0.95; // never take more than 95% of what's left to borrow
  const takeBase = Math.min(Math.max(neededBase, 0), Math.max(capBase, 0));
  const rawUnits = BigInt(Math.floor(takeBase / 100));
  if (rawUnits <= 0n) break;
  console.log(`   step ${i + 1}: HF ${hf.toFixed(4)} > ${targetHf} — borrowing $${(Number(rawUnits) / 1e6).toFixed(2)} listed USDC`);
  await write('borrow listed USDC', { address: POOL, abi: pool, functionName: 'borrow', args: [USDC, rawUnits, 2, 0, ME] });
}

// Final read.
[C, D, avail, lt] = await accountData();
hf = Number((C * lt) / D) / 1e18;
console.log('\n--- position now ---');
console.log('   collateral ' + usd(C) + ' · debt ' + usd(D) + ' · HF ' + hf.toFixed(4));
if (hf < 1.01) {
  console.log('   ☠ HF below the emergency line — liquidate in seconds. RESCUE NOW.');
} else if (hf <= 1.05) {
  console.log('   ⚠ HF under the 1.05 action line — a guardian should be rescuing. Do NOT leave it parked here.');
} else if (hf > 1.06) {
  console.log('   HF ' + hf.toFixed(4) + ' still above target band — run again or borrow a touch more manually.');
}

// Top up the execution wallet so the follow-up rescue (back to HF 1.30) can land:
// repay base = D − C·lt/1.30   → USDC raw = /100;   +25% margin for interest/time.
const targetDebtBase = Number(C) * Number(lt) / RESCUE_TARGET_HF;
const repayRaw = BigInt(Math.max(0, Math.floor((Number(D) - targetDebtBase) / 100)));
const fundRaw = (repayRaw * 125n) / 100n;
const execUsdc = await bal(USDC, EXEC);
const execEth = Number(await publicClient.getBalance({ address: EXEC })) / 1e18;
console.log('\n   follow-up rescue to HF 1.30 ≈ $' + (Number(repayRaw) / 1e6).toFixed(2) + ' → exec wallet should hold ~$' + (Number(fundRaw) / 1e6).toFixed(2) + ' listed USDC');
console.log('   exec wallet listed-USDC before: ' + (execUsdc / 1e6).toFixed(2) + ' · ETH (gas): ' + execEth.toFixed(4));
if (fundRaw > 0n && execUsdc < fundRaw) {
  await write('fund exec wallet (listed USDC)', { address: USDC, abi: erc20, functionName: 'transfer', args: [EXEC, fundRaw] });
}
const execUsdc2 = await bal(USDC, EXEC);
console.log('   exec wallet listed-USDC after:  ' + (execUsdc2 / 1e6).toFixed(2));

console.log('\n✅ Position is at HF ' + hf.toFixed(2) + ' and the rescue path is funded.');
console.log('   NOW RESCUE IT — cloud RESCUE NOW (needs the Vercel money vars) or `npm run live`.\n');
