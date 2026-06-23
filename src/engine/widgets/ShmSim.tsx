/**
 * Simple-harmonic-motion renderer — now a true-3D scene. A hands-on mass on a
 * spring: drag the amplitude, spring constant, and mass and watch the period,
 * frequency, and peak speed respond live. Orbit the scene; play to animate the
 * oscillation, or scrub time by hand. Flip the spring between horizontal (off a
 * wall) and vertical (hung from a ceiling) — the motion is identical, only the
 * axis changes.
 *
 * It hosts the same equation column (EquationPanel) as the projectile model:
 * pick an equation (period, frequency, energy…), set the knowns, and whatever is
 * left over is solved for and — when it's one of the spring's own parameters —
 * pushed straight into THIS oscillation. Picture and formula are one shared state.
 *
 * All physics comes from shmKinematics (validate.ts) — the same closed form the
 * correctness gate verified — so what's drawn is exactly what's checked. A 2D SVG
 * fallback (same maths) renders where WebGL is unavailable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { shmKinematics } from '../validate.ts';
import { equationsForSpecType } from '../equations.ts';
import { parseShmProblem } from '../wordProblems.ts';
import { fmt } from '../format.ts';
import { useEquationPanel } from '../useEquationPanel.ts';
import EquationPanel from '../EquationPanel.tsx';
import WordProblemBar from '../WordProblemBar.tsx';
import type { ShmSpec } from '../spec.ts';
import Scene3D from './three/Scene3D.tsx';
import { Vector3D } from './three/primitives.tsx';
import { glassAccent, chrome, PALETTE } from './three/materials.ts';
import { hasWebGL } from './three/hasWebGL.ts';

const WP_EXAMPLE = 'A 0.5 kg mass on a spring of 20 N/m oscillates with amplitude 8 cm. Find the period.';

const W = 600;
const H = 320;
const A_MAX = 5; // amplitude slider ceiling → sets the pixels-per-metre scale
const TRACK_HORIZ = 120;
const TRACK_VERT = 96;
const WALL_X = 70;
const Y_MID = 158;
const X_EQ = 300;
const TOP_Y = 44;
const CX = 300;
const Y_EQ = 176;
const TICK = 50;

type Vec = { x: number; y: number };
type V3 = [number, number, number];

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

  const webgl = useMemo(() => hasWebGL(), []);

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

  // --- 3D scene geometry (world units) ----------------------------------------
  const blockMat = useMemo(() => glassAccent(), []);
  const plateMat = useMemo(() => chrome(), []);
  const AXIS: V3 = vertical ? [0, -1, 0] : [1, 0, 0];
  const U: V3 = vertical ? [1, 0, 0] : [0, 1, 0]; // helix radius axis 1
  const Wv: V3 = [0, 0, 1]; //                       helix radius axis 2
  const anchor: V3 = vertical ? [0, 2.8, 0] : [-2.4, 0.9, 0];
  const L0w = vertical ? 1.6 : 2.2;
  const ampScale = vertical ? 0.2 : 0.28; // metres → world for the swing
  const axialLen = L0w + motion.x * ampScale; // anchor → block distance
  const blockPos: V3 = [
    anchor[0] + AXIS[0] * axialLen,
    anchor[1] + AXIS[1] * axialLen,
    anchor[2] + AXIS[2] * axialLen,
  ];
  const eqPos: V3 = [anchor[0] + AXIS[0] * L0w, anchor[1] + AXIS[1] * L0w, anchor[2] + AXIS[2] * L0w];
  const helixPts = useMemo(
    () => springHelix(anchor, AXIS, U, Wv, axialLen),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vertical, axialLen],
  );
  const eqTick: [V3, V3] = [
    [eqPos[0] - U[0] * 0.32, eqPos[1] - U[1] * 0.32, eqPos[2] - U[2] * 0.32],
    [eqPos[0] + U[0] * 0.32, eqPos[1] + U[1] * 0.32, eqPos[2] + U[2] * 0.32],
  ];
  const vSign = motion.v >= 0 ? 1 : -1;
  const velDir3: V3 = [AXIS[0] * vSign, AXIS[1] * vSign, AXIS[2] * vSign];
  const velLen3 = k.maxSpeed > 0 ? 1.4 * (Math.abs(motion.v) / k.maxSpeed) : 0;

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
            {webgl ? (
              <div className="ps__canvas">
                <Scene3D
                  label={spec.title}
                  axisSnap
                  frameloop={playing && !tLocked ? 'always' : 'demand'}
                  camera={{ position: [1.6, 1.9, 5.8], fov: 46 }}
                  controls={{ target: vertical ? [0, 1.4, 0] : [-0.5, 0.9, 0], minDistance: 3, maxDistance: 16 }}
                >
                  {/* mounting plate (wall / ceiling) */}
                  <mesh
                    position={[
                      anchor[0] - AXIS[0] * 0.09,
                      anchor[1] - AXIS[1] * 0.09,
                      anchor[2],
                    ]}
                    material={plateMat}
                  >
                    <boxGeometry args={vertical ? [1.3, 0.18, 1.3] : [0.18, 1.3, 1.3]} />
                  </mesh>

                  {/* equilibrium guide tick */}
                  <Line points={[eqTick[0], eqTick[1]]} color={PALETTE.pearl} lineWidth={1} transparent opacity={0.3} />

                  {/* the coil spring */}
                  <Line points={helixPts} color={PALETTE.chrome} lineWidth={2.4} />

                  {/* the bob (glass accent) + its velocity */}
                  <mesh position={blockPos} material={blockMat}>
                    <boxGeometry args={[0.34, 0.34, 0.34]} />
                  </mesh>
                  <Vector3D origin={blockPos} dir={velDir3} length={velLen3} color={PALETTE.azure} />
                </Scene3D>

                <div className="ps__legend" aria-hidden="true">
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.azure }} /> velocity <b>v</b></span>
                  <span className="ps__legend-row">amplitude <b>A = {fmt(resolved.A)} m</b></span>
                </div>
              </div>
            ) : (
              <ShmFallback2D resolved={resolved} motion={motion} maxSpeed={k.maxSpeed} vertical={vertical} title={spec.title} />
            )}

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
 * A coil spring as a 3-D helix from `anchor` along `axis` (radius in the U/W
 * plane), `length` world-units long. The loops space out as it stretches and
 * bunch up as it compresses; straight lead-ins at each end seat it on the plate
 * and the bob.
 */
function springHelix(anchor: V3, axis: V3, u: V3, w: V3, length: number, coils = 12, R = 0.16): V3[] {
  const lead = Math.min(Math.max(length * 0.12, 0.12), 0.4);
  const coilLen = Math.max(length - 2 * lead, 0.05);
  const N = coils * 18;
  const along = (s: number, rad = 0, ang = 0): V3 => [
    anchor[0] + axis[0] * s + (u[0] * Math.cos(ang) + w[0] * Math.sin(ang)) * rad,
    anchor[1] + axis[1] * s + (u[1] * Math.cos(ang) + w[1] * Math.sin(ang)) * rad,
    anchor[2] + axis[2] * s + (u[2] * Math.cos(ang) + w[2] * Math.sin(ang)) * rad,
  ];
  const pts: V3[] = [along(0), along(lead)];
  for (let i = 1; i <= N; i++) {
    const uu = i / N;
    pts.push(along(lead + uu * coilLen, R, 2 * Math.PI * coils * uu));
  }
  pts.push(along(length));
  return pts;
}

/** Non-WebGL fallback — the original 2D SVG, reading the same kinematics. */
function ShmFallback2D({
  resolved,
  motion,
  maxSpeed,
  vertical,
  title,
}: {
  resolved: Record<string, number>;
  motion: { x: number; v: number; a: number };
  maxSpeed: number;
  vertical: boolean;
  title: string;
}) {
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

  const speedNow = Math.abs(motion.v);
  const arrowLen = maxSpeed > 0 ? 46 * (speedNow / maxSpeed) : 0;
  const vDir = motion.v >= 0 ? 1 : -1;
  const velTip: Vec = { x: block.x + d.x * vDir * arrowLen, y: block.y + d.y * vDir * arrowLen };

  const tick = (P: Vec): [Vec, Vec] => [
    { x: P.x - pd.x * TICK, y: P.y - pd.y * TICK },
    { x: P.x + pd.x * TICK, y: P.y + pd.y * TICK },
  ];
  const plusPt = axial(L0 + aPx);
  const labelOff = (P: Vec, side: number): Vec => {
    const off = TICK + (vertical ? 8 : 14);
    return { x: P.x + side * pd.x * off, y: P.y + side * pd.y * off + (vertical ? 4 : 0) };
  };
  const [eqA, eqB] = tick(eqPt);
  const [pA, pB] = tick(plusPt);
  const eqLbl = labelOff(eqPt, 1);
  const plusLbl = labelOff(plusPt, -1);

  return (
    <svg className="ps__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <defs>
        <marker id="shm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="ps__arrowhead" />
        </marker>
      </defs>
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
      <line x1={eqA.x} y1={eqA.y} x2={eqB.x} y2={eqB.y} className="ps__guide" />
      <text x={eqLbl.x} y={eqLbl.y} className="ps__lbl ps__lbl--mid">equilibrium</text>
      <line x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y} className="ps__guide" />
      <text x={plusLbl.x} y={plusLbl.y} className="ps__lbl ps__lbl--mid">+A {fmt(resolved.A)} m</text>
      <path d={spring} className="ps__spring" />
      <rect x={block.x - 20} y={block.y - 20} width={40} height={40} rx={5} className="ps__block" />
      {arrowLen > 1 && (
        <line x1={block.x} y1={block.y} x2={velTip.x} y2={velTip.y} className="ps__vel" markerEnd="url(#shm-arrow)" />
      )}
    </svg>
  );
}

/** Side-projected helix between anchor O and block B (axis d, perpendicular pd). */
function coilSpring(O: Vec, B: Vec, d: Vec, pd: Vec, coils = 16, R = 13): string {
  const len = (B.x - O.x) * d.x + (B.y - O.y) * d.y;
  const lead = Math.min(Math.max(len * 0.12, 6), 18);
  const coilLen = Math.max(len - 2 * lead, 2);
  const N = coils * 28;
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
