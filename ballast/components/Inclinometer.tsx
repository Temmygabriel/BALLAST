'use client';

/**
 * The inclinometer — a ship's-brass tilt gauge, drawn by hand in SVG (no chart
 * library). The health factor IS the needle on the red/amber/green rail.
 *
 * The needle always eases toward its target; when a rescue lands the engine jumps
 * the HF from the red arc back to ~1.30, so the CSS transition becomes the rescue
 * swing. With prefers-reduced-motion the needle snaps instead of swinging.
 */
import { useId } from 'react';
import { C } from '../lib/tokens';
import { arcPath, hfToDeg, pt, ticks, zones } from '../lib/gauge';
import type { Status, Thresholds } from '../lib/types';

// Radii in viewBox units (viewBox spans -215…215).
const R_BEZEL_OUT = 208;
const R_BEZEL_IN = 186;
const RAIL_R = 138;
const RAIL_W = 26;
const R_NEEDLE = 150;
const R_NUMERALS = 176;
const TICK_IN = 160;
const TICK_OUT_MAJ = 174;
const TICK_OUT_MIN = 168;

export default function Inclinometer({
  hf,
  thresholds,
  status,
}: {
  hf: number;
  thresholds: Thresholds;
  status: Status;
}) {
  const gid = useId();
  const faceGrad = `${gid}-face`;
  const brassGrad = `${gid}-brass`;

  const deg = hfToDeg(hf);
  const zonesList = zones(thresholds);
  const tickList = ticks();

  return (
    <div className="inclinometer" data-status={status} aria-label={`health factor ${hf.toFixed(2)}`}>
      <svg viewBox="-215 -215 430 430" role="img">
        <defs>
          {/* The dark dial face, lit slightly from above. */}
          <radialGradient id={faceGrad} cx="50%" cy="38%" r="68%">
            <stop offset="0%" stopColor={C.faceTop} />
            <stop offset="70%" stopColor={C.night} />
            <stop offset="100%" stopColor={C.faceBottom} />
          </radialGradient>
          {/* Metallic brass bezel sheen, lit from the top-left. */}
          <linearGradient id={brassGrad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={C.brassHi} />
            <stop offset="35%" stopColor={C.brass} />
            <stop offset="62%" stopColor={C.brassLo} />
            <stop offset="100%" stopColor={C.brass} />
          </linearGradient>
        </defs>

        {/* Brass bezel + dark dial face. */}
        <circle r={R_BEZEL_OUT} fill={`url(#${brassGrad})`} />
        <circle r={R_BEZEL_IN} fill={`url(#${faceGrad})`} />
        <circle r={R_BEZEL_IN} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="2" />
        <circle r={R_BEZEL_OUT - 3} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />

        {/* The red/amber/green rail, from the guardian's thresholds. */}
        {zonesList.map((z, i) => (
          <path
            key={i}
            d={arcPath(RAIL_R, z.a0 + 0.4, z.a1 - 0.4)}
            stroke={z.color}
            strokeWidth={RAIL_W}
            fill="none"
            opacity={0.92}
          />
        ))}

        {/* Tick marks. */}
        {tickList.map((t, i) => {
          const a = pt(TICK_IN, t.deg);
          const b = pt(t.major ? TICK_OUT_MAJ : TICK_OUT_MIN, t.deg);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={t.major ? C.ivory : C.ivoryDim}
              strokeWidth={t.major ? 2 : 1}
              opacity={t.major ? 0.9 : 0.5}
            />
          );
        })}

        {/* Numerals. */}
        {tickList
          .filter((t) => t.label)
          .map((t, i) => {
            const p = pt(R_NUMERALS, t.deg);
            return (
              <text
                key={i}
                x={p.x}
                y={p.y + 4.5}
                textAnchor="middle"
                className="gauge-numeral"
                fill={C.ivory}
                opacity={t.label === '0.6' ? 0.55 : 0.92}
              >
                {t.label}
              </text>
            );
          })}

        {/* The needle — drawn pointing at +x, rotated to the health factor. */}
        <g
          className="needle"
          style={{ transform: `rotate(${deg}deg)`, transformOrigin: '0px 0px' }}
        >
          <polygon
            points={`-22,-2.4 0,-3.4 ${R_NEEDLE},0 0,3.4 -22,2.4`}
            fill={C.brassHi}
            stroke="rgba(0,0,0,0.45)"
            strokeWidth="0.6"
          />
          {/* centre counterweight + pivot cap */}
          <circle cx={-20} cy={0} r={7} fill={C.brassLo} />
          <circle cx={0} cy={0} r={12.5} fill="none" stroke={C.brassLo} strokeWidth={2.4} />
          <circle cx={0} cy={0} r={6.5} fill={C.brassHi} />
          <circle cx={0} cy={0} r={2.2} fill={C.night} />
        </g>
      </svg>
    </div>
  );
}
