// Pure scroll-progress -> scene mapping for the horizontal "corridor". No DOM or
// three.js deps, so it is deterministic and unit-checkable. Shared by the r3f
// lotus (transform channels) and the scroll handler (horizontal pan + per-cell
// door-swing). Every value is a pure function of progress, so the whole
// experience scrubs identically forward and backward.

export const CELLS = 6 // hero + unfurl + data + reflection + steps + early
export const PAN_END = 0.86 // progress where the track pins and the climax dolly begins
// the bloom never opens past this — petals hold here (open but cupped) and the
// lower whorl never detaches, even through the climax
const BLOOM_MAX = 0.93
// the lotus begins to shatter once the last heading is crossing/fading out
const SHATTER_START = 0.74

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

// ---- Room headline orbit ---------------------------------------------------
// Each room's headline lives in the 3D scene as curved glass-lit text riding an
// ELLIPTICAL orbit around the lotus — narrow in X (so it stays over the petals'
// screen footprint, grazing through the glass at the sides) and deep in Z (so
// it passes clearly behind the bloom). As the corridor advances the headline
// sweeps in low from the front-right, reads at the front while its room is
// centred (easedIndex === cellIndex → u === 0), then wraps around the BACK of
// the lotus — occluded by the petals and refracted through the glass — and
// rises off to the upper-left. Pure function of progress so it scrubs both
// ways identically.
const DEG = Math.PI / 180
const ORBIT_RX = 1.22 // horizontal half-axis (kept tight to overlap the petals)
const ORBIT_RZ = 2.05 // depth half-axis (front readable, back clearly behind)
const ORBIT_CY = -0.12 // orbit centre height (≈ lotus centre)

export type RoomText = {
  x: number
  y: number
  z: number
  rotY: number // faces the camera at the front, turns as it wraps
  scale: number
  opacity: number
}

export function roomTextAt(cellIndex: number, p: number): RoomText {
  const u = easedIndex(p) - cellIndex // <0 upcoming (right), 0 centred, >0 past
  // a: 0 at the readable front, swings negative (clockwise from above) so the
  // headline travels front → left → behind as the room passes.
  const a = clamp(-126 * u, -210, 112) * DEG
  // enters slightly low, lifts gently as it drifts left
  const lift = u < 0 ? u * 0.55 : u * u * 0.42
  const near = 1 - smoothstep(0, 1.3, Math.abs(u))
  const scale = 0.58 + 0.42 * near
  // fade in as it arrives from the right; once it crosses centre (u = 0) start
  // fading out, fully gone by the left-perpendicular point — orbit angle −90°,
  // i.e. u = 90 / 126 ≈ 0.714.
  const opacity =
    clamp01(smoothstep(-1.0, -0.42, u)) * (1 - smoothstep(0, 0.714, u))
  return {
    x: ORBIT_RX * Math.sin(a),
    y: ORBIT_CY + lift,
    z: ORBIT_RZ * Math.cos(a),
    rotY: a,
    scale,
    opacity,
  }
}

export type Scene = {
  spin: number // rotation.y
  tiltX: number // rotation.x
  bloom: number // feeds the per-petal open cascade
  scale: number
  posY: number // vertical position (rises from below at scroll start)
  posZ: number
  fade: number // petal alpha during the flare
  climax: number // 0..1 within the climax (drives the final-page UI reveal)
  flare: number // 0..1 white-flare intensity (the explosion flash)
  shatter: number // 0..1 lotus shatter/explosion progress
  space: number // 0..1 space-scene morph (starfield in, atmosphere dims)
}

export function sceneAt(p: number): Scene {
  const climax = smoothstep(PAN_END, 1, p)
  const shatter = smoothstep(SHATTER_START, 0.96, p)
  const space = smoothstep(0.82, 1, p)
  const ei = easedIndex(p) // dwells per room
  // rotation follows the eased rooms (so it slows as each face arrives) plus a
  // gentle drift, then whirls up as it shatters
  const spin =
    -0.4 + (ei / (CELLS - 1)) * Math.PI * 2.3 + ei * 0.18 + shatter * 2.6
  const tiltX =
    p < 0.4
      ? lerp(-0.18, 0.06, smoothstep(0, 0.4, p))
      : lerp(0.04, -0.16, shatter)
  // opens toward BLOOM_MAX and holds there — never fully flat, never past the
  // capped state
  const bloom = Math.min(BLOOM_MAX, 0.18 + smoothstep(0, 0.56, p) * 0.77)
  // no camera dolly — the lotus shatters in place instead of the camera diving
  // in; a small swell as it bursts
  const scale = 1 + shatter * 0.12
  const posZ = 0
  // entrance: hidden below the frame at rest, rises into place as scroll begins
  const entry = smoothstep(0, 0.07, p)
  const posY = lerp(-6, -0.35, entry)
  const fade = 1 - smoothstep(0.93, 1, p)
  // a bright flash at the instant of the shatter
  const flare = smoothstep(SHATTER_START, 0.81, p) - smoothstep(0.81, 0.93, p)
  return { spin, tiltX, bloom, scale, posY, posZ, fade, climax, flare, shatter, space }
}
