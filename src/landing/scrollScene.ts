// Pure scroll-progress -> scene mapping for the horizontal "corridor". No DOM or
// three.js deps, so it is deterministic and unit-checkable. Shared by the r3f
// lotus (transform channels) and the scroll handler (horizontal pan + per-cell
// door-swing). Every value is a pure function of progress, so the whole
// experience scrubs identically forward and backward.

export const CELLS = 6 // hero + unfurl + data + reflection + steps + early
export const PAN_END = 0.86 // progress where the track pins and the climax dolly begins

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// Eased cell position: the corridor DWELLS near each room center and eases
// quickly between rooms, so the pan + rotation never read as constant-velocity.
export function easedIndex(p: number) {
  const panP = Math.min(p, PAN_END) / PAN_END // 0..1 across the corridor
  const ci = Math.min(panP * (CELLS - 1), CELLS - 1)
  const cell = Math.min(Math.floor(ci), CELLS - 2)
  const f = ci - cell
  // ease the in-between, then add a touch of overshoot-free anticipation
  return cell + smoothstep(0, 1, f)
}

// horizontal pan of the panel track / kinetic ribbon, in vw (negative = left)
export function panVw(p: number) {
  return -100 * easedIndex(p)
}
export function ribbonVw(p: number) {
  return -126 * easedIndex(p) // 1.26x parallax
}

// signed distance of cell `i` from screen center, in cell-widths
export function cellN(i: number, p: number) {
  return clamp(i - easedIndex(p), -1.6, 1.6)
}

export type Scene = {
  spin: number // rotation.y
  tiltX: number // rotation.x
  bloom: number // feeds the per-petal open cascade
  scale: number
  posY: number // vertical position (rises from below at scroll start)
  posZ: number
  shard: number // outer-whorl radial detach amount
  fade: number // petal alpha during the flare
  climax: number // 0..1 within the climax
  flare: number // 0..1 white-flare intensity
}

export function sceneAt(p: number): Scene {
  const climax = smoothstep(PAN_END, 1, p)
  const ei = easedIndex(p) // dwells per room
  // rotation follows the eased rooms (so it slows as each face arrives) plus a
  // gentle continuous drift, and a final quarter-turn into the dolly
  const spin = -0.4 + (ei / (CELLS - 1)) * Math.PI * 2.3 + ei * 0.18 + climax * 0.8
  const tiltX =
    p < 0.4
      ? lerp(-0.18, 0.06, smoothstep(0, 0.4, p))
      : lerp(0.04, -0.3, smoothstep(0, 1, climax))
  const bloom = climax > 0 ? 1 : clamp01(0.18 + smoothstep(0, 0.56, p) * 0.77)
  const shard = smoothstep(0.54, 0.64, p) - smoothstep(0.7, 0.8, p)
  const scale = 1 + smoothstep(0, 1, climax) * 5
  const posZ = smoothstep(0, 1, climax) * 2.2
  // entrance: hidden below the frame at rest, rises into place as scroll begins
  const entry = smoothstep(0, 0.07, p)
  const posY = lerp(-6, -0.35, entry)
  const fade = 1 - smoothstep(0.93, 1, p)
  const flare = smoothstep(0.86, 0.95, p) - smoothstep(0.97, 1, p) * 0.6
  return { spin, tiltX, bloom, scale, posY, posZ, shard, fade, climax, flare }
}
