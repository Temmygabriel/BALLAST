/**
 * Pure geometry for the inclinometer — no React here, just math you can test.
 *
 * The gauge is a 240° speedometer-style sweep that opens at the bottom.
 *   HF 0.6  → lower-left edge (deep red)
 *   HF 1.3  → straight up (12 o'clock)
 *   HF 2.0  → lower-right edge
 * SVG angle convention: 0° = +x axis, positive angle turns clockwise (y is down).
 */

import { C } from './tokens';
import type { Thresholds } from './types';

export const HF_MIN = 0.6;
export const HF_MAX = 2.0;
export const START_DEG = 150;
export const SWEEP_DEG = 240; // ends at 150+240 = 390 ≡ 30 (lower-right)

const D2R = Math.PI / 180;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Which way does the needle point for a given health factor? (degrees, gauge space) */
export function hfToDeg(hf: number): number {
  const t = (clamp(hf, HF_MIN, HF_MAX) - HF_MIN) / (HF_MAX - HF_MIN);
  return START_DEG + t * SWEEP_DEG;
}

/** A point on a circle of radius r at gauge-degrees (origin = centre of dial). */
export function pt(r: number, deg: number): { x: number; y: number } {
  const rad = deg * D2R;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

/** SVG path for an arc of constant radius from deg a0 → a1 (clockwise). */
export function arcPath(r: number, a0: number, a1: number): string {
  const p0 = pt(r, a0);
  const p1 = pt(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(3)} ${p0.y.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`;
}

export interface Zone {
  a0: number;
  a1: number;
  color: string;
}

/** Split the rail into the three spec zones using the guardian's thresholds. */
export function zones(t: Thresholds): Zone[] {
  const deg = (hf: number) => hfToDeg(hf);
  return [
    { a0: deg(HF_MIN), a1: deg(t.actHF), color: C.danger },
    { a0: deg(t.actHF), a1: deg(t.warnHF), color: C.warn },
    { a0: deg(t.warnHF), a1: deg(HF_MAX), color: C.safe },
  ];
}

export interface Tick {
  deg: number;
  major: boolean;
  label?: string;
}

/** Fine ticks every 0.1, major ones (with numerals) at the labelled values. */
export function ticks(): Tick[] {
  const out: Tick[] = [];
  for (let hf = HF_MIN; hf <= HF_MAX + 1e-9; hf += 0.1) {
    const h = Math.round(hf * 10) / 10;
    const labelled = h === 0.6 || h === 1 || h === 1.5 || h === 2;
    out.push({ deg: hfToDeg(h), major: labelled, label: labelled ? h.toFixed(1) : undefined });
  }
  return out;
}
