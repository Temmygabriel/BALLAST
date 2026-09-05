import { describe, expect, it } from 'vitest';
import { SimEngine } from '../src/simulator';

/**
 * The whole demo in one assertion: a price crash pushes the needle into the red,
 * every chaos row fails the naive baseline but Ballast survives it, and the rescue
 * lands — ending RESCUED back at the target health factor.
 *
 * This is intentionally slow (the engine animates with real delays) but it is the
 * test that proves the product story is real, not mocked in the UI.
 */
describe('the storm (offline end-to-end)', () => {
  it(
    'drifts into the red, survives every condition, and ends RESCUED at target HF',
    async () => {
      const engine = new SimEngine();
      let last = engine.getState();
      engine.subscribe((s) => (last = s));

      await engine.runStorm();

      const s = last;
      // The rescue landed.
      expect(s.status).toBe('RESCUED');
      expect(s.mode).toBe('bridge');
      expect(s.lastTx?.hash).toBeTruthy();
      // HF is back at the ~1.30 target (within float noise).
      expect(s.healthFactor).toBeGreaterThanOrEqual(1.29);
      expect(s.healthFactor).toBeLessThanOrEqual(1.31);

      // Every chaos row: naive baseline FAILS, Ballast survives.
      for (const row of s.conditions) {
        expect(row.baseline).toBe('fail'); // the naive script always trips
        if (row.mainnetOnly) {
          expect(row.ballast).toBe('skip'); // honest: not provable offline
        } else {
          expect(row.ballast).toBe('pass'); // Ballast survives each one
        }
      }

      // The log tells the story end to end.
      const log = s.log.map((l) => `${l.event}: ${l.detail}`);
      expect(log.join('\n')).toContain('RESCUED');
    },
    30_000, // the storm animates with real sleeps
  );

  it(
    'a single-block price blip (flash-loan shape) NEVER fires a rescue',
    async () => {
      const engine = new SimEngine();
      const statuses: string[] = [];
      let last = engine.getState();
      engine.subscribe((s) => {
        last = s;
        statuses.push(s.status);
      });

      await engine.runBlip(); // one low reading, then the price reverts before block 2

      // The needle DIPPED into the red (the screen shows the scare)…
      expect(statuses).toContain('CAPSIZING');
      // …but a single block is never acted on: no rescue, no RESCUED, no tx.
      expect(statuses).not.toContain('RESCUED');
      expect(last.lastTx).toBeUndefined();
      expect(last.healthFactor).toBeGreaterThanOrEqual(1.29); // healthy again
      const log = last.log.map((l) => `${l.event}: ${l.detail}`).join('\n');
      expect(log).not.toContain('rescuing');
      expect(log).not.toContain('RESCUED');
    },
    20_000, // runBlip animates with real delays
  );
});
