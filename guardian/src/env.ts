/**
 * Tiny dot-env loader (no dependency) so live mode works from `guardian/.env`.
 * Reads simple KEY=VALUE lines; never overrides values already set.
 */
import { readFileSync } from 'node:fs';

export function loadEnvFile(path?: string) {
  const file = path ?? new URL('../.env', import.meta.url).pathname;
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
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
