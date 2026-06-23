import { useEffect, useRef, type MutableRefObject } from 'react'
import { WHORLS, buildPetal, petalOpenness, type Petal } from './roseCurve'

// A glassy, pearlescent, chrome-rimmed lotus rendered on Canvas2D. Translucent
// layered petals read as frosted glass; a specular highlight sweeps across them
// like light through a prism; an iridescent hue drifts over the surface; the
// whole bloom sways and breathes. Decoupled from any equation: it is pure motif.
// This twin is also the reduced-motion / no-WebGL fallback.

const C = {
  bgTop: '#0e1319',
  bgMid: '#0a0e13',
  bgBottom: '#06080c',
}

type Mote = { x: number; y: number; r: number; sp: number; ph: number }
const MOTES: Mote[] = Array.from({ length: 30 }, (_, i) => {
  const rand = (n: number) => Math.abs((Math.sin(n) * 43758.5453) % 1)
  return {
    x: rand(i * 12.9898),
    y: rand(i * 78.233),
    r: 0.4 + rand(i + 3) * 1.5,
    sp: 0.2 + rand(i + 7) * 0.7,
    ph: rand(i + 11) * Math.PI * 2,
  }
})

function tracePath(ctx: CanvasRenderingContext2D, pts: Petal['outline'], s: number) {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i].x * s
    const y = pts[i].y * s
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function drawLotus(
  ctx: CanvasRenderingContext2D,
  bloom: number,
  scale: number,
  t: number,
  reflection: boolean,
) {
  ctx.save()
  ctx.scale(1, 0.84) // a bloom seen slightly from above the water
  const sweep = (t * 0.0006) % (Math.PI * 2)

  // outer whorls first so inner petals layer over them (glass depth)
  for (let wi = 0; wi < WHORLS.length; wi++) {
    const w = WHORLS[wi]
    for (let i = 0; i < w.count; i++) {
      const o = petalOpenness(bloom, wi, i, w.count)
      const petal = buildPetal(w, i, o)
      const tip = petal.tip
      const hue = 216 + 52 * Math.sin(petal.angle * 1.3 + t * 0.00028)

      // frosted glass body
      const g = ctx.createLinearGradient(0, 0, tip.x * scale, tip.y * scale)
      g.addColorStop(0, `hsla(${hue}, 20%, 68%, 0.1)`)
      g.addColorStop(0.5, `hsla(${hue}, 16%, 84%, 0.16)`)
      g.addColorStop(1, `hsla(${hue}, 24%, 94%, 0.28)`)
      tracePath(ctx, petal.outline, scale)
      ctx.fillStyle = g
      ctx.fill()

      // specular sweep: light sliding across the glass toward `sweep`
      if (!reflection) {
        let d = Math.abs(((petal.angle - sweep + Math.PI) % (Math.PI * 2)) - Math.PI)
        const boost = Math.max(0, 1 - d / 0.95)
        if (boost > 0.02) {
          ctx.save()
          tracePath(ctx, petal.outline, scale)
          ctx.clip()
          const sg = ctx.createLinearGradient(0, 0, tip.x * scale, tip.y * scale)
          sg.addColorStop(0, 'rgba(255,255,255,0)')
          sg.addColorStop(0.65, `rgba(244,250,255,${0.22 * boost})`)
          sg.addColorStop(1, `rgba(255,255,255,${0.5 * boost})`)
          ctx.fillStyle = sg
          ctx.fillRect(-scale, -scale, scale * 2, scale * 2)
          ctx.restore()
        }
      }

      // chrome rim
      tracePath(ctx, petal.outline, scale)
      ctx.strokeStyle = `rgba(236,243,249,${0.28 + 0.26 * o})`
      ctx.lineWidth = Math.max(1, scale * 0.004)
      ctx.stroke()
    }
  }

  // glassy pearl core with a bright glint
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 0.28)
  core.addColorStop(0, 'rgba(240,246,250,0.85)')
  core.addColorStop(0.4, 'rgba(188,203,216,0.32)')
  core.addColorStop(1, 'transparent')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(0, 0, scale * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bloom: number,
  t: number,
  focusX: number,
) {
  ctx.clearRect(0, 0, w, h)

  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, C.bgTop)
  bg.addColorStop(0.55, C.bgMid)
  bg.addColorStop(1, C.bgBottom)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // cool pearl mist on the horizon
  const mist = ctx.createRadialGradient(w * 0.5, h * 0.16, 0, w * 0.5, h * 0.16, h * 0.55)
  mist.addColorStop(0, 'rgba(204,222,232,0.1)')
  mist.addColorStop(1, 'transparent')
  ctx.fillStyle = mist
  ctx.fillRect(0, 0, w, h)

  const cx = w * focusX
  const waterY = h * 0.63
  const scale = Math.min(w, h) * 0.32
  const breathe = 1 + Math.sin(t * 0.0007) * 0.012
  const sway = Math.sin(t * 0.00026) * 0.1

  // reflection
  ctx.save()
  ctx.translate(cx, waterY)
  ctx.rotate(sway)
  ctx.scale(breathe, -breathe)
  ctx.globalAlpha = 0.14
  drawLotus(ctx, bloom, scale, t, true)
  ctx.restore()

  // water plane
  const water = ctx.createLinearGradient(0, waterY, 0, h)
  water.addColorStop(0, 'rgba(8,11,16,0.25)')
  water.addColorStop(1, 'rgba(6,9,13,0.92)')
  ctx.fillStyle = water
  ctx.fillRect(0, waterY, w, h - waterY)
  ctx.strokeStyle = 'rgba(204,222,232,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, waterY)
  ctx.lineTo(w, waterY)
  ctx.stroke()

  // the bloom
  ctx.save()
  ctx.translate(cx, waterY)
  ctx.rotate(sway)
  ctx.scale(breathe, breathe)
  drawLotus(ctx, bloom, scale, t, false)
  ctx.restore()

  // drifting light-motes
  for (const m of MOTES) {
    const y = (m.y - t * 0.00002 * m.sp) % 1
    const yy = (y < 0 ? y + 1 : y) * h
    const tw = 0.5 + 0.5 * Math.sin(t * 0.001 * m.sp + m.ph)
    ctx.fillStyle = 'rgba(226,238,246,0.6)'
    ctx.globalAlpha = 0.22 + 0.4 * tw
    ctx.beginPath()
    ctx.arc(m.x * w, yy, m.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

export default function LotusFallback({
  bloom = 0.62,
  focusX = 0.5,
  bloomRef: extBloomRef,
  focusRef: extFocusRef,
  className,
}: {
  bloom?: number
  focusX?: number
  bloomRef?: MutableRefObject<number>
  focusRef?: MutableRefObject<number>
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const localBloom = useRef(bloom)
  localBloom.current = bloom
  const localFocus = useRef(focusX)
  localFocus.current = focusX
  const bloomRef = extBloomRef ?? localBloom
  const focusRef = extFocusRef ?? localFocus

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let W = 0
    let H = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      W = rect.width
      H = rect.height
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reduce) draw(ctx, W, H, bloomRef.current, 0, focusRef.current)
    }
    resize()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let curBloom = bloomRef.current
    let curFocus = focusRef.current
    if (!reduce) {
      const loop = (t: number) => {
        curBloom += (bloomRef.current - curBloom) * 0.08
        curFocus += (focusRef.current - curFocus) * 0.06
        draw(ctx, W, H, curBloom, t, curFocus)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
