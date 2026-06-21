// The lotus is PLOTTED, not modeled. Petal tips ride the polar rose
// r(theta) = A * cos(k * theta); we sample that locus into whorls of petals and
// give each petal a pointed-almond outline so the SAME geometry strokes
// identically in WebGL (3D ribbon) and in the Canvas2D fallback. This file is
// pure math with no DOM/three dependency.

export type Pt = { x: number; y: number }

export interface Whorl {
  count: number
  radius: number // tip radius in unit space (~0..1)
  halfWidth: number
  phase: number
  tilt: number // how far this whorl splays at full bloom (outer opens most)
}

// Outer 8 + mid 8 + inner 6 = 22 petals. Phase offsets interleave the whorls so
// the bloom reads dense, like a real lotus rather than a flat rose.
export const WHORLS: Whorl[] = [
  { count: 8, radius: 1.0, halfWidth: 0.3, phase: 0, tilt: 1.0 },
  { count: 8, radius: 0.7, halfWidth: 0.26, phase: Math.PI / 8, tilt: 0.78 },
  { count: 6, radius: 0.46, halfWidth: 0.22, phase: Math.PI / 6, tilt: 0.52 },
]

const UP = -Math.PI / 2 // a closed bud points up (screen coords: +y is down)

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function shortAngle(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export interface Petal {
  whorl: number
  index: number
  openness: number
  angle: number // outward direction at full bloom
  outline: Pt[] // closed almond loop, origin at the flower base
  midline: Pt[] // base -> tip centerline (the vein)
  tip: Pt
}

// openness 0 = gathered upright (closed bud), 1 = splayed to its angle.
export function buildPetal(
  w: Whorl,
  index: number,
  openness: number,
  samples = 18,
): Petal {
  const target = w.phase + (index / w.count) * Math.PI * 2
  const open = clamp01(openness) * w.tilt
  const dir = UP + shortAngle(UP, target) * open
  const len = lerp(0.2, w.radius, open)
  const hw = w.halfWidth * (0.32 + 0.68 * open)
  const cos = Math.cos(dir)
  const sin = Math.sin(dir)
  const perpX = -sin
  const perpY = cos

  const left: Pt[] = []
  const right: Pt[] = []
  const mid: Pt[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const along = t * len
    const cx = cos * along
    const cy = sin * along
    // almond envelope: wide near the lower-third, tapering to a point at the tip
    const width = hw * Math.pow(Math.sin(Math.PI * t), 0.7) * (1 - 0.4 * t)
    left.push({ x: cx + perpX * width, y: cy + perpY * width })
    right.push({ x: cx - perpX * width, y: cy - perpY * width })
    mid.push({ x: cx, y: cy })
  }
  const outline = [...left, ...right.reverse()]
  return {
    whorl: WHORLS.indexOf(w),
    index,
    openness: open,
    angle: target,
    outline,
    midline: mid,
    tip: mid[mid.length - 1],
  }
}

// Per-petal staggered opening: outer whorls and earlier indices lead, inner
// whorls trail, so the bloom cascades in a spiral instead of popping at once.
export function petalOpenness(
  bloom: number,
  whorl: number,
  index: number,
  count: number,
): number {
  const lead = whorl * 0.16 + (index / count) * 0.08
  const span = 1 - lead * 0.5
  return clamp01((bloom - lead) / span)
}

export function buildLotus(bloom: number): Petal[] {
  const petals: Petal[] = []
  WHORLS.forEach((w, wi) => {
    for (let i = 0; i < w.count; i++) {
      petals.push(buildPetal(w, i, petalOpenness(bloom, wi, i, w.count)))
    }
  })
  return petals
}
