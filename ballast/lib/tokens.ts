/**
 * Ballast design tokens — the ship's-brass instrument palette from the spec.
 * SVG needs concrete hex, so this object is the source of truth; globals.css
 * mirrors the same values as CSS custom properties.
 */
export const C = {
  night: '#0E1B24', // bridge-night — deep teal-navy ground
  nightDeep: '#081019', // vignette edge
  faceTop: '#162734',
  faceBottom: '#0A151E', // dial face gradient
  ivory: '#EDE7D9', // dial-ivory — labels, text
  ivoryDim: 'rgba(237,231,217,0.55)',
  brass: '#B08D45', // the brass accent
  brassHi: '#E0C27E',
  brassLo: '#6E5630',
  danger: '#B23A2E', // arc-danger (red)
  warn: '#C98A3B', // arc-warn (amber)
  safe: '#3B6E52', // arc-safe (green)
  ink: '#1E1B16', // ink — dark text on light chips
  line: 'rgba(237,231,217,0.14)',
} as const;

export type Palette = typeof C;
