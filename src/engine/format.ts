/** Round to 2 decimals for display; show "–" for non-finite, never "-0". */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}
