import './App.css'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { useReveal } from './hooks/useReveal'
import { usePointerField, useParallax, useTilt } from './hooks/useMotion'
import Aurora from './components/Aurora'
import ScrollProgress from './components/ScrollProgress'
import MagneticButton from './components/MagneticButton'
import RefractionScene from './components/RefractionScene'
import InteractiveGraph from './components/InteractiveGraph'
import EarlyAccessForm from './components/EarlyAccessForm'

function App() {
  const root = useReveal<HTMLDivElement>()
  usePointerField()
  const artPar = useParallax<HTMLDivElement>(0.05)
  const artTilt = useTilt<HTMLDivElement>(9)

  return (
    <div ref={root} id="top">
      <Aurora />
      <ScrollProgress />
      <Nav />

      <main>
        {/* HERO — asymmetric split, not a centered stack */}
        <section className="hero">
          <div className="shell hero__grid">
            <div className="hero__lede">
              <span className="label reveal">Intuition, not answers</span>
              <h1 className="hero__title reveal" style={revealDelay(60)}>
                See it
                <br />
                three ways.
              </h1>
              <p className="hero__sub reveal" style={revealDelay(120)}>
                Paste a formula or a problem. Watch one idea split into three
                interactive pictures you can push, drag, and replay until it
                clicks.
              </p>

              <div className="hero__io reveal" style={revealDelay(180)}>
                <span className="label">input</span>
                <code>d/dx [ a·x² ]</code>
              </div>

              <div className="hero__cta reveal" style={revealDelay(240)}>
                <MagneticButton href="#early">Get early access</MagneticButton>
                <a className="textlink" href="#how">
                  See how it works
                  <Arrow />
                </a>
              </div>
            </div>

            <div
              className="hero__art reveal-fade"
              ref={artPar}
              style={revealDelay(160)}
            >
              <div className="tilt" ref={artTilt}>
                <RefractionScene />
              </div>
            </div>
          </div>
        </section>

        {/* PROBLEM — editorial, the 1am scene */}
        <section className="problem">
          <div className="shell problem__grid">
            <span className="label reveal">The 1am problem</span>
            <h2 className="problem__title reveal" style={revealDelay(60)}>
              You have read the chapter three times. It still will not click.
            </h2>
            <div className="problem__cols">
              <p className="reveal" style={revealDelay(120)}>
                A video explains <em>some</em> concept, not the one on your
                worksheet. A chatbot hands you a wall of text and a single
                diagram. Both move on. The idea stays flat on the page.
              </p>
              <p className="reveal" style={revealDelay(180)}>
                Saras does the opposite. It takes the exact thing in front of you
                and shows it from three angles at once, because understanding
                rarely arrives from one picture.
              </p>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS — connected flow, not equal cards */}
        <section className="how" id="how">
          <div className="shell">
            <header className="section-head">
              <span className="label reveal">How it works</span>
              <h2 className="reveal" style={revealDelay(60)}>
                Paste it. Watch it refract. Push on it.
              </h2>
            </header>

            <ol className="flow">
              {STEPS.map((s, i) => (
                <li className="flow__step reveal" style={revealDelay(i * 90)} key={s.n}>
                  <span className="flow__n">{s.n}</span>
                  <h3 className="flow__t">{s.t}</h3>
                  <p className="flow__d">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* THE THREE CHANNELS — bento, the triad of meaning */}
        <section className="channels">
          <div className="shell">
            <header className="section-head">
              <span className="label reveal">The three channels</span>
              <h2 className="reveal" style={revealDelay(60)}>
                Not three pictures. Three ways of knowing.
              </h2>
              <p className="section-sub reveal" style={revealDelay(120)}>
                Saras never pads. If an idea has only two honest representations,
                you get two, and it says so.
              </p>
            </header>

            <div className="bento">
              <TiltCard className="card--lead" data-ch="graph">
                <div className="card__head">
                  <span className="dot" />
                  <span className="label">Channel 01 / Graph</span>
                </div>
                <h3 className="card__t">Change a variable, watch the shape answer.</h3>
                <InteractiveGraph />
              </TiltCard>

              <TiltCard data-ch="analogy" style={revealDelay(90)}>
                <div className="card__head">
                  <span className="dot" />
                  <span className="label">Channel 02 / Analogy</span>
                </div>
                <h3 className="card__t">A physical thing you already trust.</h3>
                <p className="card__d">
                  A spring, a pendulum, water in a tank. The math mapped onto
                  something your hands already understand.
                </p>
              </TiltCard>

              <TiltCard data-ch="steps" style={revealDelay(150)}>
                <div className="card__head">
                  <span className="dot" />
                  <span className="label">Channel 03 / Steps</span>
                </div>
                <h3 className="card__t">The walkthrough you can replay.</h3>
                <p className="card__d">
                  One move at a time, in order, with the why beside each step. Go
                  back as many times as you need.
                </p>
              </TiltCard>
            </div>
          </div>
        </section>

        {/* EARLY ACCESS — honest pre-product band */}
        <section className="early" id="early">
          <div className="shell early__grid">
            <div className="early__copy">
              <span className="label reveal">Pre-product</span>
              <h2 className="reveal" style={revealDelay(60)}>
                Saras does not exist yet. We are building it in the open.
              </h2>
              <p className="reveal" style={revealDelay(120)}>
                No hype, no demand we have not earned. If three interactive views
                of one idea sounds like the thing you needed at 1am, leave your
                email and help us build the right one.
              </p>
            </div>
            <div className="early__form reveal" style={revealDelay(160)}>
              <EarlyAccessForm />
              <p className="early__fine">
                We are watching real students before we write the real engine. You
                might get one email asking what finally made a concept click.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

function TiltCard({
  className = '',
  children,
  ...rest
}: { className?: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  // Channel cards hold still on hover (no 3D tilt) — only the glass and the
  // per-channel border glow respond. The hero panel keeps its tilt separately.
  return (
    <article className={`card reveal-fade ${className}`} {...rest}>
      {children}
    </article>
  )
}

function Nav() {
  return (
    <header className="nav">
      <div className="shell nav__inner">
        <a href="#top" className="brand" aria-label="Saras home">
          <Prismlet />
          <span>Saras</span>
        </a>
        <nav className="nav__links">
          <a href="#how">How it works</a>
          <a href="#early">The idea</a>
        </nav>
        <a href="#early" className="btn btn--ghost btn--sm">
          <span>Get early access</span>
        </a>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="foot">
      <div className="shell foot__inner">
        <div>
          <a href="#top" className="brand brand--lg">
            <Prismlet />
            <span>Saras</span>
          </a>
          <p className="foot__origin">
            From the Sanskrit <span className="foot__sanskrit">saras</span>, the
            flow of knowledge.
          </p>
        </div>
        <div className="foot__meta">
          <span className="label">© 2026 Saras · Pre-product</span>
        </div>
      </div>
    </footer>
  )
}

function Prismlet() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="prismlet">
      <path d="M12 4 L20 19 L4 19 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="12" y1="4" x2="12" y2="19" stroke="var(--ch-graph)" strokeWidth="1.4" />
      <line x1="12" y1="11.5" x2="20" y2="19" stroke="var(--ch-analogy)" strokeWidth="1.4" />
      <line x1="12" y1="11.5" x2="4" y2="19" stroke="var(--ch-steps)" strokeWidth="1.4" />
    </svg>
  )
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function revealDelay(ms: number): CSSProperties {
  return { '--reveal-delay': `${ms}ms` } as CSSProperties
}

const STEPS = [
  {
    n: '01',
    t: 'Paste',
    d: 'Drop in a concept, a formula, or a photo of the problem you are stuck on.',
  },
  {
    n: '02',
    t: 'Refract',
    d: 'Saras picks the views that fit and checks the math before it draws anything.',
  },
  {
    n: '03',
    t: 'Explore',
    d: 'Drag a slider, swap a variable, replay a step. The picture responds in real time.',
  },
]

export default App
