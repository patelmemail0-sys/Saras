/**
 * Simple-harmonic-motion renderer. A hands-on mass on a spring: drag the
 * amplitude, spring constant, and mass and watch the period, frequency, and
 * peak speed respond live. Play to animate the oscillation, or scrub time by hand.
 * Flip the spring between horizontal (on a wall) and vertical (hung from a ceiling)
 * — the motion is identical, only the axis changes.
 *
 * It hosts the same equation column (EquationPanel) as the projectile model:
 * pick an equation (period, frequency, energy…), set the knowns, and whatever is
 * left over is solved for and — when it's one of the spring's own parameters —
 * pushed straight into THIS oscillation. Picture and formula are one shared state.
 *
 * All physics comes from shmKinematics (validate.ts) — the same closed form the
 * correctness gate verified — so what's drawn is exactly what's checked.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { shmKinematics } from '../validate.ts';
import { equationsForSpecType } from '../equations.ts';
import { parseShmProblem } from '../wordProblems.ts';
import { fmt } from '../format.ts';
import { useEquationPanel } from '../useEquationPanel.ts';
import EquationPanel from '../EquationPanel.tsx';
import WordProblemBar from '../WordProblemBar.tsx';
import type { ShmSpec } from '../spec.ts';

const WP_EXAMPLE = 'A 0.5 kg mass on a spring of 20 N/m oscillates with amplitude 8 cm. Find the period.';

const W = 600;
const H = 320;
const A_MAX = 5; // amplitude slider ceiling → sets the pixels-per-metre scale
// Screen half-swing at A_MAX. Vertical gets less room (the SVG is short), so it
// uses a smaller scale — that keeps the full swing on-screen and stops the coil
// collapsing at large amplitudes. Within an orientation the scale is fixed, so
// "bigger A → bigger swing" still reads.
const TRACK_HORIZ = 120;
const TRACK_VERT = 96;
// Horizontal layout: spring grows rightward from a wall.
const WALL_X = 70;
const Y_MID = 158;
const X_EQ = 300;
// Vertical layout: spring hangs down from a ceiling.
const TOP_Y = 44;
const CX = 300;
const Y_EQ = 176;
const TICK = 50; // half-length of the equilibrium / amplitude guide ticks

type Vec = { x: number; y: number };

const SET = equationsForSpecType('wave-oscillator')!;

export default function ShmSim({ spec }: { spec: ShmSpec }) {
  const [amplitude, setAmplitude] = useState(spec.amplitude);
  const [springConstant, setK] = useState(spec.springConstant);
  const [mass, setMass] = useState(spec.mass);
  const [tRaw, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [vertical, setVertical] = useState(false);

  const [wpText, setWpText] = useState('');
  const [wpInfo, setWpInfo] = useState<{ found: string[]; askedLabel: string | null } | null>(null);

  const base: Record<string, number> = { A: amplitude, k: springConstant, m: mass, t: tRaw };
  function setBase(sym: string, val: number) {
    if (sym === 'A') setAmplitude(val);
    else if (sym === 'k') setK(val);
    else if (sym === 'm') setMass(val);
    else if (sym === 't') setT(val);
  }

  const eqp = useEquationPanel(SET, base, setBase, () => setPlaying(false));
  const { resolved, unknown, setSolveTarget } = eqp;

  const k = useMemo(
    () =>
      shmKinematics({
        type: 'wave-oscillator',
        title: spec.title,
        amplitude: resolved.A,
        springConstant: resolved.k,
        mass: resolved.m,
        notes: spec.notes,
      }),
    [spec.title, spec.notes, resolved.A, resolved.k, resolved.m],
  );

  const period = k.period;
  const tLocked = unknown === 't';
  const tEff = Math.max(0, Math.min(resolved.t, period));
  const motion = k.at(tEff);

  // Axis-generalised geometry: O = anchor, d = oscillation axis, pd = ⟂ axis.
  const SCALE = (vertical ? TRACK_VERT : TRACK_HORIZ) / A_MAX;
  const O: Vec = vertical ? { x: CX, y: TOP_Y } : { x: WALL_X, y: Y_MID };
  const d: Vec = vertical ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const pd: Vec = vertical ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const L0 = vertical ? Y_EQ - TOP_Y : X_EQ - WALL_X;
  const axial = (a: number): Vec => ({ x: O.x + d.x * a, y: O.y + d.y * a });

  const aPx = resolved.A * SCALE;
  const eqPt = axial(L0);
  const block = axial(L0 + motion.x * SCALE);
  const spring = coilSpring(O, block, d, pd);

  // Velocity arrow along the axis, length ∝ speed (zero at the turning points).
  const speedNow = Math.abs(motion.v);
  const arrowLen = k.maxSpeed > 0 ? 46 * (speedNow / k.maxSpeed) : 0;
  const vDir = motion.v >= 0 ? 1 : -1;
  const velTip: Vec = { x: block.x + d.x * vDir * arrowLen, y: block.y + d.y * vDir * arrowLen };

  // A guide tick (⟂ to the axis) through point P, with a label beside it.
  const tick = (P: Vec): [Vec, Vec] => [
    { x: P.x - pd.x * TICK, y: P.y - pd.y * TICK },
    { x: P.x + pd.x * TICK, y: P.y + pd.y * TICK },
  ];
  const plusPt = axial(L0 + aPx);
  // Push a label off a tick along ±pd so equilibrium and +A never collide
  // (side −1 = above/left, +1 = below/right).
  const labelOff = (P: Vec, side: number): Vec => {
    const off = TICK + (vertical ? 8 : 14);
    return { x: P.x + side * pd.x * off, y: P.y + side * pd.y * off + (vertical ? 4 : 0) };
  };

  // Animation loop: replay one period over a watchable duration, looping.
  const raf = useRef<number | undefined>(undefined);
  const start = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing || tLocked) return;
    const playback = Math.min(Math.max(period, 1.2), 4);
    start.current = undefined;
    const tick = (now: number) => {
      if (start.current === undefined) start.current = now;
      const p = ((now - start.current) / 1000 / playback) % 1;
      setT(p * period);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, tLocked, period]);

  function play() {
    if (tEff >= period - 1e-3) setT(0);
    setPlaying((p) => !p);
  }

  function modelProblem() {
    const text = wpText.trim();
    if (!text) return;
    const parsed = parseShmProblem(text);
    for (const [sym, val] of Object.entries(parsed.base)) setBase(sym, val);
    if (parsed.solveFor) setSolveTarget(parsed.solveFor.eqId, parsed.solveFor.unknown);
    setPlaying(false);
    const askedLabel = parsed.solveFor
      ? SET.equations.find((e) => e.id === parsed.solveFor!.eqId)?.label ?? null
      : null;
    setWpInfo({ found: parsed.found, askedLabel });
  }

  const [eqA, eqB] = tick(eqPt);
  const [pA, pB] = tick(plusPt);
  const eqLbl = labelOff(eqPt, 1); // below (horizontal) / right (vertical)
  const plusLbl = labelOff(plusPt, -1); // above (horizontal) / left (vertical)

  return (
    <div className="pmodel">
      <WordProblemBar
        value={wpText}
        onChange={setWpText}
        onSubmit={modelProblem}
        onExample={() => setWpText(WP_EXAMPLE)}
        busy={false}
        placeholder="Word problem → model: e.g. a 0.5 kg mass on a 20 N/m spring, amplitude 8 cm. Find the period."
        result={
          wpInfo &&
          (wpInfo.found.length ? (
            <p className="wp__result">
              Set {wpInfo.found.join(' · ')}
              {wpInfo.askedLabel && (
                <>
                  {' '}
                  · solving for <b>{wpInfo.askedLabel}</b>
                </>
              )}
            </p>
          ) : (
            <p className="wp__result wp__result--warn">
              Couldn't find the numbers. Try “0.5 kg mass, 20 N/m spring, 8 cm amplitude”.
            </p>
          ))
        }
      />

      <div className="pmodel__body">
        <div className="pmodel__visual">
          <div className="ps">
            <svg className="ps__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title}>
              <defs>
                <marker id="shm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" className="ps__arrowhead" />
                </marker>
              </defs>

              {/* Wall / ceiling with hatching */}
              <line x1={O.x - pd.x * 46} y1={O.y - pd.y * 46} x2={O.x + pd.x * 46} y2={O.y + pd.y * 46} className="ps__ground" />
              {Array.from({ length: 7 }, (_, i) => {
                const c = -39 + i * 13;
                return (
                  <line
                    key={i}
                    className="ps__hatch"
                    x1={O.x + pd.x * c}
                    y1={O.y + pd.y * c}
                    x2={O.x - d.x * 11 + pd.x * (c + 8)}
                    y2={O.y - d.y * 11 + pd.y * (c + 8)}
                  />
                );
              })}

              {/* Equilibrium + amplitude guides */}
              <line x1={eqA.x} y1={eqA.y} x2={eqB.x} y2={eqB.y} className="ps__guide" />
              <text x={eqLbl.x} y={eqLbl.y} className="ps__lbl ps__lbl--mid">equilibrium</text>
              <line x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y} className="ps__guide" />
              <text x={plusLbl.x} y={plusLbl.y} className="ps__lbl ps__lbl--mid">+A {fmt(resolved.A)} m</text>

              {/* Spring + block */}
              <path d={spring} className="ps__spring" />
              <rect x={block.x - 20} y={block.y - 20} width={40} height={40} rx={5} className="ps__block" />

              {/* Velocity arrow */}
              {arrowLen > 1 && (
                <line x1={block.x} y1={block.y} x2={velTip.x} y2={velTip.y} className="ps__vel" markerEnd="url(#shm-arrow)" />
              )}
            </svg>

            <div className="ps__readout">
              <span>period <b>{fmt(period)}</b> s</span>
              <span>frequency <b>{fmt(k.frequency)}</b> Hz</span>
              <span>ω <b>{fmt(k.omega)}</b> rad/s</span>
              <span>max speed <b>{fmt(k.maxSpeed)}</b> m/s</span>
            </div>

            <div className="ps__transport">
              <button type="button" className="ps__play" onClick={() => setVertical((v) => !v)}>
                {vertical ? '⇄ horizontal' : '⇅ vertical'}
              </button>
              <button type="button" className="ps__play" disabled={tLocked} onClick={play}>
                {playing ? '❚❚ pause' : '▶ play'}
              </button>
              <input
                className="ps__scrub"
                type="range"
                min={0}
                max={period}
                step={period / 200}
                value={tEff}
                disabled={tLocked}
                aria-label="Time"
                onChange={(e) => {
                  setPlaying(false);
                  setT(Number(e.target.value));
                }}
              />
              <span className="ps__time">t = {fmt(tEff)} s</span>
            </div>
          </div>
        </div>

        <EquationPanel {...eqp.panelProps} />
      </div>
    </div>
  );
}

/**
 * A coil spring drawn as a side-projected helix between the anchor O and the
 * block B along axis d (perpendicular pd). The small cos() term on the axial
 * position makes each loop lean, so it reads as a wound 3-D coil rather than a
 * flat zigzag; the loops space out as the spring stretches and bunch up tightly
 * as it compresses.
 *
 * Smoothness comes from sampling ~28 points PER loop (so each circle is a smooth
 * curve, not a faceted polygon) and the round line joins in CSS. The lead-in is
 * adaptive: on a short (compressed) spring it shrinks so the coil still shows
 * tight turns instead of collapsing to a straight line.
 */
function coilSpring(O: Vec, B: Vec, d: Vec, pd: Vec, coils = 16, R = 13): string {
  const len = (B.x - O.x) * d.x + (B.y - O.y) * d.y; // axial distance O→B
  const lead = Math.min(Math.max(len * 0.12, 6), 18);
  const coilLen = Math.max(len - 2 * lead, 2);
  const N = coils * 28; // ~28 samples per loop → smooth circles
  const at = (s: number, perp: number): Vec => ({
    x: O.x + d.x * s + pd.x * perp,
    y: O.y + d.y * s + pd.y * perp,
  });
  const pt = (p: Vec) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  let str = `M${pt(at(0, 0))} L${pt(at(lead, 0))} `;
  for (let i = 1; i <= N; i++) {
    const u = i / N;
    const ang = 2 * Math.PI * coils * u;
    const s = lead + u * coilLen + R * 0.55 * Math.cos(ang);
    str += `L${pt(at(s, R * Math.sin(ang)))} `;
  }
  str += `L${pt(at(len, 0))}`;
  return str;
}
