import { useEffect, useRef } from 'react'

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Global pointer field. Writes the cursor position to the document root as
 * CSS custom properties so any element can react to it without React renders:
 *   --px / --py  → -0.5..0.5 (centered, for parallax/tilt math)
 *   --mx / --my  → raw px (for a cursor-following spotlight)
 * rAF-throttled, passive, disabled under reduced-motion.
 */
export function usePointerField() {
  useEffect(() => {
    if (prefersReduced()) return
    const root = document.documentElement
    // target (cursor) vs current (eased) — the gap is what makes it glide
    let tx = window.innerWidth / 2
    let ty = window.innerHeight / 2
    let cx = tx
    let cy = ty
    let raf = 0
    let running = false

    const tick = () => {
      // critically-damped-ish easing toward the cursor
      cx += (tx - cx) * 0.06
      cy += (ty - cy) * 0.06
      root.style.setProperty('--mx', `${cx.toFixed(1)}px`)
      root.style.setProperty('--my', `${cy.toFixed(1)}px`)
      root.style.setProperty('--px', `${(cx / window.innerWidth - 0.5).toFixed(4)}`)
      root.style.setProperty('--py', `${(cy / window.innerHeight - 0.5).toFixed(4)}`)
      if (Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4) {
        raf = requestAnimationFrame(tick)
      } else {
        running = false
      }
    }
    const onMove = (e: PointerEvent) => {
      tx = e.clientX
      ty = e.clientY
      if (!running) {
        running = true
        raf = requestAnimationFrame(tick)
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}

/** Drives a top progress bar via scaleX (0..1). */
export function useScrollProgress<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const h = document.documentElement
      const max = h.scrollHeight - h.clientHeight
      const p = max > 0 ? Math.min(1, Math.max(0, h.scrollTop / max)) : 0
      el.style.transform = `scaleX(${p})`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return ref
}

/**
 * Scroll-linked parallax. Translates the element on Y proportional to its
 * distance from viewport center. factor > 0 moves with scroll, < 0 against.
 */
export function useParallax<T extends HTMLElement = HTMLElement>(factor = 0.12) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReduced()) return
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const center = r.top + r.height / 2 - window.innerHeight / 2
      el.style.transform = `translate3d(0, ${(-center * factor).toFixed(2)}px, 0)`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [factor])
  return ref
}

/**
 * Pointer-reactive 3D tilt + glare for glass panels. Sets rotation on the node
 * and a moving highlight position via --gx/--gy (0..100%). Smoothly resets.
 */
export function useTilt<T extends HTMLElement = HTMLElement>(max = 7) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReduced()) return

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      const rx = (0.5 - py) * max * 2
      const ry = (px - 0.5) * max * 2
      el.style.setProperty('--rx', `${rx.toFixed(2)}deg`)
      el.style.setProperty('--ry', `${ry.toFixed(2)}deg`)
      el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`)
      el.style.setProperty('--glare', '1')
    }
    const reset = () => {
      el.style.setProperty('--rx', '0deg')
      el.style.setProperty('--ry', '0deg')
      el.style.setProperty('--glare', '0')
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', reset)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', reset)
    }
  }, [max])
  return ref
}
