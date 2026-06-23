import { Suspense, lazy, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import Lenis from 'lenis'
import './landing.css'
import LotusFallback from './lotus/LotusFallback'
import { CELLS, panVw, ribbonVw, cellN, sceneAt, easedIndex } from './scrollScene'
import type { RoomCopy } from './lotus/LotusCanvas'

const LotusCanvas = lazy(() => import('./lotus/LotusCanvas'))

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

const HERO_LINES: { word: string; accent?: boolean }[][] = [
  [{ word: 'Understanding' }],
  [{ word: 'rises', accent: true }, { word: 'out' }, { word: 'of' }],
  [{ word: 'still' }, { word: 'water.' }],
]

type Room = {
  id: string
  align: 'left' | 'right'
  ribbon: string
  hue: number
  eyebrow: string
  headline: string
  body: string
  variant?: 'split' | 'surface'
}

const ROOMS: Room[] = [
  {
    id: 'unfurl',
    align: 'right',
    ribbon: 'Open',
    hue: 270,
    eyebrow: 'It opens up',
    headline: 'A whole idea, in parts you can see.',
    body: 'Most tools hand you one answer and move on. Saras opens the idea up, so the pieces it is built from are out in the light instead of hidden behind a single number.',
  },
  {
    id: 'data',
    align: 'left',
    ribbon: 'Move',
    hue: 200,
    eyebrow: 'Grab it, it answers',
    headline: 'Move one thing. The model responds.',
    body: 'You learn the shape of an idea by bending it, not by rereading it. Pull on the model and everything updates at once, in real time, so the relationship becomes something you feel.',
  },
  {
    id: 'reflection',
    align: 'right',
    ribbon: 'Visualize',
    hue: 295,
    variant: 'split',
    eyebrow: 'The same idea, twice',
    headline: 'Abstract on top, physical below.',
    body: 'Seen from another angle, a curve becomes a swing and a rate becomes a flow. Two honest readings of one idea, so it lands whichever way your mind reaches for it.',
  },
  {
    id: 'steps',
    align: 'left',
    ribbon: 'Solve',
    hue: 225,
    variant: 'surface',
    eyebrow: 'Or follow the work',
    headline: 'Watch it solve, step by step.',
    body: 'When you want the procedure, Saras lays the work out in order, and you can replay any step until it finally holds.',
  },
]

// ROOMS[i] is rendered in corridor cell i+1 (cell 0 is the hero). The headline
// is drawn in the 3D scene (orbiting the lotus), the eyebrow + body stay in the
// fixed copy layer.
const HEADLINE_ROOMS: RoomCopy[] = ROOMS.map((r, i) => ({
  id: r.id,
  cell: i + 1,
  headline: r.headline,
  ribbon: r.ribbon,
}))

export default function LandingLotus() {
  const rootRef = useRef<HTMLDivElement>(null)
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const webgl = useMemo(() => hasWebGL(), [])
  const horizontal = useMemo(
    () =>
      webgl &&
      !prefersReduced &&
      typeof window !== 'undefined' &&
      window.innerWidth > 760,
    [webgl, prefersReduced],
  )
  const bloomRef = useRef(prefersReduced ? 0.85 : 0.3)
  const focusRef = useRef(0.62)
  const progressRef = useRef(0)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // ---------- HORIZONTAL CORRIDOR ----------
    if (horizontal) {
      const cells = Array.from(root.querySelectorAll<HTMLElement>('.lh-cell'))
      const copies = Array.from(root.querySelectorAll<HTMLElement>('.lh-copy'))
      const update = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
        const s = sceneAt(p)
        progressRef.current = p
        bloomRef.current = s.bloom
        root.style.setProperty('--pan', panVw(p).toFixed(2) + 'vw')
        root.style.setProperty('--ribbon', ribbonVw(p).toFixed(2) + 'vw')
        root.style.setProperty('--flare', s.flare.toFixed(3))
        root.style.setProperty('--climax', s.climax.toFixed(3))
        root.style.setProperty('--space', s.space.toFixed(3))
        root.style.setProperty('--prog', p.toFixed(4))
        for (let i = 0; i < cells.length; i++) {
          const n = cellN(i, p)
          cells[i].style.setProperty('--d', n.toFixed(3))
          cells[i].style.setProperty('--dz', Math.min(Math.abs(n), 1).toFixed(3))
        }
        // fixed copy layer: eyebrow + body fade/drift in step with their room's
        // 3D headline (which orbits the lotus). cell index = room index + 1.
        // The whole layer is also killed off as the lotus shatters, so the last
        // room's copy is fully gone once the explosion starts.
        const ei = easedIndex(p)
        const kill = 1 - Math.min(1, s.shatter / 0.15)
        for (let i = 0; i < copies.length; i++) {
          const u = ei - (i + 1)
          const a = Math.abs(u)
          // reaches 0 by one cell-width away (no faint residual at the hero or
          // the final scene), and is killed entirely once the lotus shatters
          const op = (a < 0.5 ? 1 : Math.max(0, 1 - (a - 0.5) / 0.5)) * kill
          copies[i].style.setProperty('--u', u.toFixed(3))
          copies[i].style.setProperty('--op', op.toFixed(3))
        }
      }
      const lenis = new Lenis({ lerp: 0.08, smoothWheel: true })
      let raf = 0
      const loop = (t: number) => {
        lenis.raf(t)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
      lenis.on('scroll', update)
      window.addEventListener('scroll', update, { passive: true })
      update()
      return () => {
        cancelAnimationFrame(raf)
        lenis.destroy()
        window.removeEventListener('scroll', update)
      }
    }

    // ---------- VERTICAL FALLBACK (mobile / reduced-motion / no-WebGL) ----------
    const sections = Array.from(root.querySelectorAll<HTMLElement>('.lh-chapter'))
    if (prefersReduced) {
      root.querySelectorAll('.lh-reveal').forEach((el) => el.classList.add('in'))
      bloomRef.current = 0.85
      return
    }
    const update = () => {
      const vh = window.innerHeight
      const progress = Math.min(1, window.scrollY / (vh * 1.8))
      bloomRef.current = Math.min(0.93, 0.24 + progress * 0.76)
      for (const sec of sections) {
        const r = sec.getBoundingClientRect()
        if (r.top < vh * 0.8 && r.bottom > 0) {
          sec.querySelector('.lh-reveal')?.classList.add('in')
        }
        if (r.top <= vh * 0.5 && r.bottom >= vh * 0.5) {
          if (sec.dataset.hue) root.style.setProperty('--hue', sec.dataset.hue)
          if (sec.dataset.focus) focusRef.current = parseFloat(sec.dataset.focus)
        }
      }
    }
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true })
    let raf = 0
    const loop = (t: number) => {
      lenis.raf(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    lenis.on('scroll', update)
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
      window.removeEventListener('scroll', update)
    }
  }, [horizontal, prefersReduced])

  let wordIndex = 0
  const heroTitle = (
    <h1 className="lh-title">
      {HERO_LINES.map((line, li) => (
        <span className="ln" key={li}>
          {line.map((w, i) => {
            const delay = 0.28 + wordIndex * 0.075
            wordIndex += 1
            return (
              <span
                key={i}
                className={`wd${w.accent ? ' wd--accent' : ''}`}
                style={{ animationDelay: `${delay}s` } as CSSProperties}
              >
                {w.word}
                {i < line.length - 1 ? ' ' : ''}
              </span>
            )
          })}
        </span>
      ))}
    </h1>
  )

  const heroLede = (
    <div className="lh-lede">
      <span className="lh-eyebrow">
        Saras — from the Sanskrit for lake, the water a lotus rises from
      </span>
      {heroTitle}
      <p className="lh-sub">
        Paste a formula or a concept. Watch it open into a model you can grab,
        turn, and take apart, until the idea behind it finally makes sense.
      </p>
      <div className="lh-cta">
        <a className="lh-btn lh-btn--chrome" href="#/get-started">
          Get early access
        </a>
        <a className="lh-textlink" href="#unfurl">
          See how it works →
        </a>
      </div>
    </div>
  )

  return (
    <div className="lotus-landing" ref={rootRef} data-mode={horizontal ? 'h' : 'v'}>
      <header className="lh-nav">
        <div className="lh-nav-inner">
          <a className="lh-brand" href="#top" aria-label="Saras home">
            <LotusMark />
            <span>Saras</span>
          </a>
          <nav className="lh-links">
            <a href="#unfurl">How it works</a>
            <a href="#steps">The idea</a>
            <a href="#/login">Log in</a>
          </nav>
          <a className="lh-btn lh-btn--ghost lh-btn--sm" href="#/get-started">
            Get started
          </a>
        </div>
      </header>

      <div className="lh-stage" aria-hidden="true">
        {webgl ? (
          <Suspense fallback={null}>
            <LotusCanvas
              bloomRef={bloomRef}
              focusRef={focusRef}
              progressRef={horizontal ? progressRef : undefined}
              rooms={horizontal ? HEADLINE_ROOMS : undefined}
            />
          </Suspense>
        ) : (
          <LotusFallback bloomRef={bloomRef} focusRef={focusRef} className="lh-canvas" />
        )}
        <div className="lh-wash" />
        <div className="lh-vignette" />
      </div>

      {horizontal ? (
        <>
          {/* fixed copy layer: eyebrow + supporting line per room. The headline
              itself is drawn in the 3D scene, orbiting the lotus. */}
          <div className="lh-copy-layer" aria-hidden="false">
            {ROOMS.map((r) => (
              <div className="lh-copy" data-align={r.align} key={r.id}>
                <span className="lh-eyebrow2">{r.eyebrow}</span>
                <h2 className="lh-h2 lh-sr">{r.headline}</h2>
                <p className="lh-body">{r.body}</p>
              </div>
            ))}
          </div>

          <div className="lh-viewport">
            {/* the corridor of rooms (the kinetic ribbon words now live in the
                3D scene, sliding behind the lotus) */}
            <div className="lh-track">
              <section className="lh-cell lh-cell--hero" id="top">
                <div className="lh-cell__inner">{heroLede}</div>
              </section>

              {ROOMS.map((r) => (
                <section
                  className="lh-cell lh-cell--room"
                  id={r.id}
                  key={r.id}
                  data-hue={String(r.hue)}
                  aria-hidden="true"
                />
              ))}

              <section className="lh-cell lh-cell--climax" id="early">
                <div className="lh-cell__inner" />
              </section>
            </div>

            {/* climax: white flare, then wordmark + CTA */}
            <div className="lh-flare" aria-hidden="true" />
            <div className="lh-climax">
              <div className="lh-wordmark">Saras</div>
              <div className="lh-block lh-climax__cta">
                <span className="lh-eyebrow2">Early access</span>
                <h2 className="lh-h2">This is the tool, not the trailer.</h2>
                <p className="lh-body">
                  The lotus you just reshaped is the same engine inside Saras,
                  running on 734 concepts across math and science. Add your campus
                  email and we will hand you the first one to grow.
                </p>
                <div className="lh-cta">
                  <a className="lh-btn lh-btn--chrome" href="#/get-started">
                    Request access
                  </a>
                  <a className="lh-textlink" href="#/try">
                    Open the engine →
                  </a>
                </div>
              </div>
            </div>

            <div className="lh-rail" aria-hidden="true">
              <i />
            </div>
            <div className="lh-scrollcue lh-scrollcue--h" aria-hidden="true">
              Scroll →
            </div>
          </div>
          <div className="lh-spacer" style={{ height: `${CELLS * 100}svh` }} />
        </>
      ) : (
        <>
          <main>
            <section className="lh-chapter lh-hero" id="top" data-hue="250" data-focus="0.62">
              <div className="lh-shell">{heroLede}</div>
            </section>
            {ROOMS.map((r) => (
              <section
                key={r.id}
                id={r.id}
                className={`lh-chapter lh-ch--${r.align}`}
                data-hue={String(r.hue)}
                data-focus={r.align === 'left' ? '0.7' : '0.32'}
              >
                <div className="lh-shell">
                  <div className="lh-block lh-reveal">
                    <span className="lh-eyebrow2">{r.eyebrow}</span>
                    <h2 className="lh-h2">{r.headline}</h2>
                    <p className="lh-body">{r.body}</p>
                  </div>
                </div>
              </section>
            ))}
            <section className="lh-chapter lh-ch--left" id="early" data-hue="250" data-focus="0.7">
              <div className="lh-shell">
                <div className="lh-block lh-reveal">
                  <span className="lh-eyebrow2">Early access</span>
                  <h2 className="lh-h2">This is the tool, not the trailer.</h2>
                  <p className="lh-body">
                    The lotus you just reshaped is the same engine inside Saras,
                    running on 734 concepts across math and science. Add your campus
                    email and we will hand you the first one to grow.
                  </p>
                  <div className="lh-cta">
                    <a className="lh-btn lh-btn--chrome" href="#/get-started">
                      Request access
                    </a>
                    <a className="lh-textlink" href="#/try">
                      Open the engine →
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </main>
          <footer className="lh-foot">
            <div className="lh-shell lh-foot-inner">
              <a className="lh-brand" href="#top" aria-label="Saras home">
                <LotusMark />
                <span>Saras</span>
              </a>
              <span>© 2026 Saras · Pre-product · Built in the open</span>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}

function LotusMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20 C 7 16 7 9 12 4 C 17 9 17 16 12 20 Z"
        fill="none"
        stroke="var(--chrome-1)"
        strokeWidth="1.4"
      />
      <path
        d="M12 20 C 8 18 4.5 14 4 9 C 9 10.5 11 15 12 20 Z"
        fill="none"
        stroke="var(--chrome-3)"
        strokeWidth="1.2"
      />
      <path
        d="M12 20 C 16 18 19.5 14 20 9 C 15 10.5 13 15 12 20 Z"
        fill="none"
        stroke="var(--chrome-3)"
        strokeWidth="1.2"
      />
      <line
        x1="3"
        y1="20.5"
        x2="21"
        y2="20.5"
        stroke="var(--pearl)"
        strokeWidth="1"
        opacity="0.45"
      />
    </svg>
  )
}
