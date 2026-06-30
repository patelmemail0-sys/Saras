/**
 * Two-body orbit renderer — a true-3D scene in the "clean 3D, glass accents"
 * style. A central glass body sits at the focus; a smaller body orbits it on a
 * conic you can morph by hand. Drag the central mass, the launch distance and the
 * launch speed and watch the orbit slide between a circle, an ellipse and an
 * unbound escape: the path, eccentricity, semi-major axis and period all respond
 * live. The body sweeps fast at periapsis and slow at apoapsis (Kepler's 2nd law).
 *
 * It hosts the same equation column (EquationPanel) as the other models — pick a
 * relation (eccentricity, circular/escape speed, semi-major axis, period), set the
 * knowns, and the remaining variable is solved for and fed back into THIS orbit
 * when it is the mass, distance or speed.
 *
 * All physics comes from orbitMechanics (validate.ts) — the same closed form
 * (vis-viva + Kepler) the correctness gate verified — so what's drawn is exactly
 * what's checked. Units are natural (G = 1): the orbit's shape, not astronomical
 * constants, is the point. A 2D SVG fallback (same maths) renders without WebGL.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { orbitMechanics } from '../validate.ts';
import { equationsForSpecType } from '../equations.ts';
import { parseOrbitProblem } from '../wordProblems.ts';
import { fmt } from '../format.ts';
import { useEquationPanel } from '../useEquationPanel.ts';
import EquationPanel from '../EquationPanel.tsx';
import WordProblemBar from '../WordProblemBar.tsx';
import type { OrbitSpec } from '../spec.ts';
import Scene3D from './three/Scene3D.tsx';
import { Vector3D } from './three/primitives.tsx';
import { glassAccent, chrome, PALETTE } from './three/materials.ts';
import { hasWebGL } from './three/hasWebGL.ts';

const WP_EXAMPLE = 'A body launched at distance 1 from a central mass 1 with speed 1.2. How elliptical is the orbit?';

const W = 600;
const H = 320;
const CX = 300;
const CY = 158;
const TARGET = 2.6; // world-units the widest orbit extent maps to
const Y = 0.55; // orbit-plane height above the grid

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

const SET = equationsForSpecType('orbit-sim')!;

export default function OrbitSim({ spec }: { spec: OrbitSpec }) {
  const [mass, setMass] = useState(spec.centralMass);
  const [dist, setDist] = useState(spec.distance);
  const [speed, setSpeed] = useState(spec.speed);
  const [tRaw, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [wpText, setWpText] = useState('');
  const [wpInfo, setWpInfo] = useState<{ found: string[]; askedLabel: string | null } | null>(null);

  const webgl = useMemo(() => hasWebGL(), []);

  const base: Record<string, number> = { M: mass, r: dist, v: speed, t: tRaw };
  function setBase(sym: string, val: number) {
    if (sym === 'M') setMass(val);
    else if (sym === 'r') setDist(val);
    else if (sym === 'v') setSpeed(val);
    else if (sym === 't') setT(val);
  }

  const eqp = useEquationPanel(SET, base, setBase, () => setPlaying(false));
  const { resolved, unknown, setSolveTarget } = eqp;

  const k = useMemo(
    () =>
      orbitMechanics({
        type: 'orbit-sim',
        title: spec.title,
        centralMass: resolved.M,
        distance: resolved.r,
        speed: resolved.v,
        notes: spec.notes,
      }),
    [spec.title, spec.notes, resolved.M, resolved.r, resolved.v],
  );

  // Scene materials — stable instances (glass accent on the central body only).
  const sunMat = useMemo(() => glassAccent(), []);
  const bodyMat = useMemo(() => chrome(), []);

  const period = k.period;
  const tLocked = unknown === 't';
  const canPlay = k.bound && Number.isFinite(period);
  const tEff = canPlay ? Math.max(0, Math.min(resolved.t, period)) : 0;

  // World scale so the widest extent of the orbit fits the stage.
  const refDist = k.bound ? k.apoapsis : Math.max(k.periapsis * 3, k.semiLatus * 2);
  const scale = clamp(TARGET / (refDist || 1), 0.03, 12);

  // The orbit path (focus at origin, periapsis on +x): an ellipse when bound,
  // the open branch of the conic when not. Same geometry the readout reports.
  const pathPts = useMemo(() => {
    const w = (px: number, py: number): [number, number, number] => [px * scale, Y, -py * scale];
    const pts: [number, number, number][] = [];
    const e = k.eccentricity;
    if (k.bound) {
      const a = k.semiMajor;
      const b = a * Math.sqrt(Math.max(0, 1 - e * e));
      for (let i = 0; i <= 180; i++) {
        const E = (i / 180) * 2 * Math.PI;
        pts.push(w(a * (Math.cos(E) - e), b * Math.sin(E)));
      }
    } else {
      const p = k.semiLatus;
      const thMax = Math.acos(Math.max(-0.9999, -1 / Math.max(e, 1.0001))) * 0.96;
      for (let i = 0; i <= 180; i++) {
        const th = -thMax + 2 * thMax * (i / 180);
        const r = p / (1 + e * Math.cos(th));
        if (r > 0 && r < refDist * 1.6) pts.push(w(r * Math.cos(th), r * Math.sin(th)));
      }
    }
    return pts;
  }, [k.bound, k.semiMajor, k.eccentricity, k.semiLatus, scale, refDist]);

  // Body position + the two vectors (velocity tangent, gravity toward the focus).
  const st = k.at(tEff);
  const bodyPos: [number, number, number] = [st.x * scale, Y, -st.y * scale];
  const dt = Math.max(period / 600, 1e-3);
  const stN = k.at(tEff + dt);
  const velDir3: [number, number, number] = [stN.x - st.x, 0, -(stN.y - st.y)];
  const accDir3: [number, number, number] = [-st.x, 0, st.y]; // toward the focus
  const gravMag = resolved.M / (st.r * st.r); // |a| = M/r² with G = 1
  const velLen3 = clamp(0.35 + st.speed * 0.34, 0.35, 1.9);
  const accLen3 = clamp(0.3 + gravMag * 0.22, 0.3, 1.7);

  const raf = useRef<number | undefined>(undefined);
  const start = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing || tLocked || !canPlay) return;
    const playback = clamp(period, 2.5, 7);
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
  }, [playing, tLocked, canPlay, period]);

  function play() {
    if (tEff >= period - 1e-3) setT(0);
    setPlaying((p) => !p);
  }

  function modelProblem() {
    const text = wpText.trim();
    if (!text) return;
    const parsed = parseOrbitProblem(text);
    for (const [sym, val] of Object.entries(parsed.base)) setBase(sym, val);
    if (parsed.solveFor) setSolveTarget(parsed.solveFor.eqId, parsed.solveFor.unknown);
    setPlaying(false);
    const askedLabel = parsed.solveFor
      ? SET.equations.find((e) => e.id === parsed.solveFor!.eqId)?.label ?? null
      : null;
    setWpInfo({ found: parsed.found, askedLabel });
  }

  const shapeTag = !k.bound
    ? 'unbound — escape'
    : k.eccentricity < 0.02
      ? 'circular'
      : 'elliptical';

  return (
    <div className="pmodel">
      <WordProblemBar
        value={wpText}
        onChange={setWpText}
        onSubmit={modelProblem}
        onExample={() => setWpText(WP_EXAMPLE)}
        busy={false}
        placeholder="Word problem → model (natural units, G = 1): e.g. mass 1, distance 1, speed 1.2. How elliptical is the orbit?"
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
            <p className="wp__result wp__result--warn">Couldn't find the numbers. Try “mass 1, distance 1, speed 1.2”.</p>
          ))
        }
      />

      <div className="pmodel__body">
        <div className="pmodel__visual">
          <div className="ps">
            {webgl ? (
              <div className="ps__canvas">
                <Scene3D
                  label={spec.title}
                  axisSnap
                  frameloop={playing && !tLocked && canPlay ? 'always' : 'demand'}
                  camera={{ position: [5, 4, 6], fov: 44 }}
                  controls={{ target: [0, 0.4, 0], minDistance: 3, maxDistance: 16 }}
                >
                  {/* the central body — the one glass-accent object — at the focus */}
                  <mesh position={[0, Y, 0]} material={sunMat}>
                    <sphereGeometry args={[0.26, 36, 36]} />
                  </mesh>
                  <Line points={[[0, Y, 0], [0, 0, 0]]} color={PALETTE.pearl} lineWidth={1} transparent opacity={0.2} />

                  {/* the orbit path */}
                  {pathPts.length > 1 && <Line points={pathPts} color={PALETTE.azure} lineWidth={2} transparent opacity={0.85} />}

                  {/* radius line focus → body */}
                  <Line points={[[0, Y, 0], bodyPos]} color={PALETTE.pearl} lineWidth={1.4} transparent opacity={0.4} />

                  {/* the orbiting body */}
                  <mesh position={bodyPos} material={bodyMat}>
                    <sphereGeometry args={[0.12, 28, 28]} />
                  </mesh>

                  {/* velocity (tangent) + gravity (toward the focus), only when bound */}
                  {k.bound && (
                    <>
                      <Vector3D origin={bodyPos} dir={velDir3} length={velLen3} color={PALETTE.azure} />
                      <Vector3D origin={bodyPos} dir={accDir3} length={accLen3} color={PALETTE.azureWarm} />
                    </>
                  )}
                </Scene3D>

                <div className="ps__legend" aria-hidden="true">
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.glass }} /> central mass <b>M = {fmt(resolved.M)}</b></span>
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.azure }} /> velocity <b>v</b></span>
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.azureWarm }} /> gravity <b>g</b></span>
                </div>
              </div>
            ) : (
              <OrbitFallback2D k={k} title={spec.title} tEff={tEff} />
            )}

            <div className="ps__readout">
              <span>eccentricity <b>{fmt(k.eccentricity)}</b></span>
              <span>semi-major a <b>{k.bound ? fmt(k.semiMajor) : '∞'}</b></span>
              <span>period T <b>{k.bound ? fmt(period) : '∞'}</b></span>
              <span>{shapeTag}</span>
            </div>

            <div className="ps__transport">
              <button type="button" className="ps__play" disabled={tLocked || !canPlay} onClick={play}>
                {playing ? '❚❚ pause' : '▶ play'}
              </button>
              <input
                className="ps__scrub"
                type="range"
                min={0}
                max={canPlay ? period : 1}
                step={canPlay ? period / 200 : 0.01}
                value={tEff}
                disabled={tLocked || !canPlay}
                aria-label="Time"
                onChange={(e) => {
                  setPlaying(false);
                  setT(Number(e.target.value));
                }}
              />
              <span className="ps__time">{canPlay ? `t = ${fmt(tEff)}` : 'no closed orbit'}</span>
            </div>
          </div>
        </div>

        <EquationPanel {...eqp.panelProps} />
      </div>
    </div>
  );
}

/**
 * Non-WebGL fallback — a 2D SVG of the same conic, reading the same mechanics so
 * the verified picture still renders without a GPU.
 */
function OrbitFallback2D({
  k,
  title,
  tEff,
}: {
  k: ReturnType<typeof orbitMechanics>;
  title: string;
  tEff: number;
}) {
  const refDist = k.bound ? k.apoapsis : Math.max(k.periapsis * 3, k.semiLatus * 2);
  const s = clamp(120 / (refDist || 1), 4, 600);
  const map = (px: number, py: number) => ({ x: CX + px * s, y: CY - py * s });

  const pts: string[] = [];
  const e = k.eccentricity;
  if (k.bound) {
    const a = k.semiMajor;
    const b = a * Math.sqrt(Math.max(0, 1 - e * e));
    for (let i = 0; i <= 160; i++) {
      const E = (i / 160) * 2 * Math.PI;
      const p = map(a * (Math.cos(E) - e), b * Math.sin(E));
      pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
  } else {
    const p = k.semiLatus;
    const thMax = Math.acos(Math.max(-0.9999, -1 / Math.max(e, 1.0001))) * 0.96;
    for (let i = 0; i <= 160; i++) {
      const th = -thMax + 2 * thMax * (i / 160);
      const r = p / (1 + e * Math.cos(th));
      if (r > 0 && r < refDist * 1.6) {
        const q = map(r * Math.cos(th), r * Math.sin(th));
        pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`);
      }
    }
  }

  const st = k.at(tEff);
  const body = map(st.x, st.y);
  const focus = map(0, 0);

  return (
    <svg className="ps__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <polyline className="ps__path" points={pts.join(' ')} fill="none" />
      <line x1={focus.x} y1={focus.y} x2={body.x} y2={body.y} className="ps__guide" />
      <circle cx={focus.x} cy={focus.y} r={8} className="ps__ball" />
      <circle cx={body.x} cy={body.y} r={5} className="ps__apex" />
      <text x={focus.x + 12} y={focus.y - 12} className="ps__lbl ps__lbl--mid">M</text>
    </svg>
  );
}
