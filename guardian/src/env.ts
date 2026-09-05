/**
 * Tiny dot-env loader (no dependency) so live mode works from `guardian/.env`.
 * Reads simple KEY=VALUE lines; never overrides values already set.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadEnvFile(path?: string) {
  // fileURLToPath (not URL.pathname): pathname keeps %20 encoding, which silently
  // breaks when the repo lives under a folder with a space (e.g. "HACKATHONS BUILDS").
  const file = path ?? fileURLToPath(new URL('../.env', import.meta.url));
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return; // no .env yet — live mode will complain about the missing key anyway
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    // strip trailing inline comments ("KEY=value  # a note") so numeric/address
    // consumers never see the comment text.
    const value = trimmed.slice(eq + 1).replace(/\s+#.*$/, '').trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
