import { describe, expect, it } from 'vitest';
import { TriggerGate } from '../src/trigger';

/**
 * The two-block confirmation rule is the whole flash-loan defence:
 *  - one unhealthy reading is never enough,
 *  - two low readings on the SAME block don't count,
 *  - a second low reading on a LATER block confirms → rescue, with a STABLE episode id,
 *  - below the explicit EMERGENCY_HF edge the window is bypassed (acting now is safer
 *    than waiting at the real edge),
 *  - once healthy again the episode closes; a later fresh crash gets a NEW episode id.
 */
const th = { warnHF: 1.15, actHF: 1.05, targetHF: 1.3 };
const emergencyHF = 1.01;
const USER = '0xUser000000000000000000000000000000000001';
const make = () => new TriggerGate({ thresholds: th, emergencyHF, user: USER });

describe('TriggerGate (two-block confirmation + emergency edge)', () => {
  it('does nothing while the position is healthy', () => {
    const g = make();
    expect(g.observe(1.33, 100)).toEqual({ action: 'none', reason: 'healthy' });
    expect(g.active).toBe(false);
  });

  it('a single low reading is only an observation, never a rescue', () => {
    const g = make();
    expect(g.observe(1.03, 50)).toEqual({ action: 'none', reason: 'first-observation' });
    expect(g.active).toBe(false);
    expect(g.episodeId).toBeNull();
  });

  it('two low readings on the SAME block do not confirm (flash-loan window)', () => {
    const g = make();
    g.observe(1.03, 50); // first low
    expect(g.observe(1.02, 50)).toEqual({ action: 'none', reason: 'same-block' });
    expect(g.active).toBe(false);
  });

  it('a second low reading on a LATER block confirms — and the episode id is STABLE', () => {
    const g = make();
    g.observe(1.03, 50); // first low at block 50
    const first = g.observe(1.02, 51); // later block → confirmed
    expect(first.action).toBe('rescue');
    if (first.action === 'rescue') {
      expect(first.reason).toBe('two-block');
      expect(first.episodeId).toBe(`ballast-${USER.slice(0, 8)}-50`); // anchored to the FIRST low block
      // Every later unhealthy observation of the SAME episode returns the SAME id,
      // so retries stay idempotent against KeeperHub.
      const again = g.observe(1.0, 52);
      expect(again.action).toBe('rescue');
      if (again.action === 'rescue') expect(again.episodeId).toBe(first.episodeId);
    }
    expect(g.active).toBe(true);
  });

  it('below EMERGENCY_HF it acts immediately — one reading is enough', () => {
    const g = make();
    const out = g.observe(1.005, 77);
    expect(out.action).toBe('rescue');
    if (out.action === 'rescue') {
      expect(out.reason).toBe('emergency');
      expect(out.episodeId).toBe(`ballast-${USER.slice(0, 8)}-77`);
    }
  });

  it('recovers → closes the episode → a fresh crash is a NEW episode', () => {
    const g = make();
    g.observe(1.03, 10);
    g.observe(1.02, 11); // confirmed → episode …-10
    expect(g.active).toBe(true);

    expect(g.observe(1.33, 12)).toEqual({ action: 'none', reason: 'healthy' });
    expect(g.active).toBe(false); // episode over

    g.observe(1.03, 20); // brand-new crash
    const fresh = g.observe(1.02, 21);
    expect(fresh.action).toBe('rescue');
    if (fresh.action === 'rescue') expect(fresh.episodeId).toBe(`ballast-${USER.slice(0, 8)}-20`);
  });

  it('confirms two blockless (virtual) observations with a stable fallback id', () => {
    const g = make();
    g.observe(1.03); // first (block unknown)
    const out = g.observe(1.02); // second → confirmed via seq fallback
    expect(out.action).toBe('rescue');
    if (out.action === 'rescue') {
      expect(out.reason).toBe('two-block');
      expect(out.episodeId).toMatch(/ballast-.*-s\d+$/);
    }
  });
});
