// Probe v2: compare the TWO Sepolia "USDC" tokens against the exec wallet.
// debt A = real Circle USDC (what guardian/.env + likely Vercel currently name DEBT_ASSET)
// debt B = Aave-LISTED USDC (the token the position's debt is actually in)
// For each: allowance(exec->pool), balance(exec), and a simulated approve(pool, ~$6.98).
import { createPublicClient, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';

const RPC = 'https://eth-sepolia.g.alchemy.com/v2/alch_xpFXfNQJEh8AeKK98UsMi';
const POOL = '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951';
const EXEC = '0x851a05FA306080Fd6bA9D961BDf9DD6cca29CA32'; // KeeperHub org execution wallet

const TOKENS = {
  'A real-Circle USDC': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'B Aave-LISTED USDC': '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8', // all-lowercase = accepted, same as scripts
};

const abi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
const amt = 7_000_000n; // ~$7 at 6 decimals — the current rescue need

for (const [name, addr] of Object.entries(TOKENS)) {
  console.log('=== ' + name + '  ' + addr + ' ===');
  const allow = await pc.readContract({ address: addr, abi, functionName: 'allowance', args: [EXEC, POOL] });
  const bal = await pc.readContract({ address: addr, abi, functionName: 'balanceOf', args: [EXEC] });
  console.log('   exec balance  : $' + (Number(bal) / 1e6).toFixed(2) + ' (' + bal + ' raw)');
  console.log('   exec->pool allow: $' + (Number(allow) / 1e6).toFixed(2) + ' (' + allow + ' raw)');
  try {
    await pc.simulateContract({ address: addr, abi, functionName: 'approve', args: [POOL, amt], account: EXEC });
    console.log('   approve(pool,$7) simulate -> OK');
  } catch (e) {
    console.log('   approve(pool,$7) simulate -> REVERT: ' + String(e.shortMessage || e.message).slice(0, 220));
  }
  console.log('');
}
