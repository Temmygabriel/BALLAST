// 🔐 NEW WALLET MAKER — offline, no network.
//
// Makes a brand-new EVM wallet right here on your PC (a random private key + the
// address that comes from it) and saves it into guardian/.env (gitignored), so the
// private key never leaves this machine and never goes near the repo.
//
//   node scripts/new-wallet.mjs
//
// Run it as many times as you want — it only writes a wallet into .env when none
// is stored yet, so it will never overwrite one you already have.
import { randomBytes } from 'node:crypto';
import { existsSync, appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env'); // guardian/.env

const key = '0x' + randomBytes(32).toString('hex');
const account = privateKeyToAccount(key);

console.log('');
console.log('🪙  New wallet created (offline — nothing was sent anywhere)');
console.log('');
console.log('   address      ' + account.address);
console.log('   private key  ' + key);
console.log('');

const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
if (existing.includes('PROTECTED_WALLET=')) {
  console.log('   guardian/.env already has a wallet — this new one was NOT stored.');
  console.log('   (it is printed above if you want to keep it yourself)');
} else {
  if (!existsSync(envPath)) appendFileSync(envPath, '', { flag: 'w' });
  const stamp = new Date().toISOString().slice(0, 10);
  appendFileSync(
    envPath,
    '\n# --- Local Sepolia wallet (created ' + stamp + ') ---\n' +
      'PROTECTED_WALLET=' + account.address + '\n' +
      'PROTECTED_WALLET_PRIVATE_KEY=' + key + '\n',
  );
  console.log('   saved to     guardian/.env  (gitignored — never commit it)');
}
console.log('');
