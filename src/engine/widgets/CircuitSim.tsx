/**
 * Ohm's-law renderer — now a true-3D scene. A hands-on single-loop circuit lying
 * on the grid: drag the source voltage and the resistance and watch the current
 * (animated charge flow around the loop) and the power dissipated (the resistor's
 * glow) respond live. Orbit the scene or snap to the top view for the textbook
 * diagram.
 *
 * It hosts the same equation column (EquationPanel) as the other models: pick
 * Ohm's law or the power relation, set the knowns, and the remaining variable is
 * solved for — and when it's the source voltage or resistance, fed straight back
 * into THIS loop. Picture and formula are one shared state.
 *
 * All values come from circuitState (validate.ts) — the same closed form the
 * correctness gate verified — so what's drawn is exactly what's checked. A 2D SVG
 * fallback (same maths) renders where WebGL is unavailable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { circuitState, type CircuitState } from '../validate.ts';
import { equationsForSpecType } from '../equations.ts';
import { parseCircuitProblem } from '../wordProblems.ts';
import { fmt } from '../format.ts';
import { useEquationPanel } from '../useEquationPanel.ts';
import EquationPanel from '../EquationPanel.tsx';
import WordProblemBar from '../WordProblemBar.tsx';
import type { CircuitSpec } from '../spec.ts';
import Scene3D from './three/Scene3D.tsx';
import { Vector3D } from './three/primitives.tsx';
import { chrome, emissive, PALETTE } from './three/materials.ts';
import { hasWebGL } from './three/hasWebGL.ts';

const WP_EXAMPLE = 'A 12 V battery drives a 60 Ω resistor. How much current flows, and what power is dissipated?';

const W = 600;
const H = 320;
// 2D loop rectangle (fallback), walked clockwise from the top-left corner.
const X0 = 120;
const X1 = 480;
const Y0 = 78;
const Y1 = 252;
const CORNERS: Array<[number, number]> = [
  [X0, Y0],
  [X1, Y0],
  [X1, Y1],
  [X0, Y1],
];
const DOTS = 12;

// 3D loop, flat on the grid (XZ plane), walked clockwise from above.
type V3 = [number, number, number];
const LY = 0.06; // loop height above the grid
const HX = 2.0;
const HZ = 1.1;
const CORNERS3: V3[] = [
  [-HX, LY, -HZ],
  [HX, LY, -HZ],
  [HX, LY, HZ],
  [-HX, LY, HZ],
];

const SET = equationsForSpecType('circuit-diagram')!;

export default function CircuitSim({ spec }: { spec: CircuitSpec }) {
  const [voltage, setVoltage] = useState(spec.voltage);
  const [resistance, setResistance] = useState(spec.resistance);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState(0);

  const [wpText, setWpText] = useState('');
  const [wpInfo, setWpInfo] = useState<{ found: string[]; askedLabel: string | null } | null>(null);

  const webgl = useMemo(() => hasWebGL(), []);

  const base: Record<string, number> = { V: voltage, R: resistance };
  function setBase(sym: string, val: number) {
    if (sym === 'V') setVoltage(val);
    else if (sym === 'R') setResistance(val);
  }

  const eqp = useEquationPanel(SET, base, setBase, () => setPlaying(false));
  const { resolved } = eqp;

  const s = useMemo(
    () => circuitState({ type: 'circuit-diagram', title: spec.title, voltage: resolved.V, resistance: resolved.R, notes: spec.notes }),
    [spec.title, spec.notes, resolved.V, resolved.R],
  );

  // Charge-flow rate ∝ current (loops/sec), clamped to stay watchable.
  const rate = Math.min(Math.max(0.08 + s.current * 0.12, 0.05), 2.2);
  // Resistor glow ∝ power, soft-normalised so a wide power range stays on-screen.
  const glow = s.power / (s.power + 8);

  // Scene materials.
  const batteryMat = useMemo(() => chrome(), []);
  const chargeMat = useMemo(() => emissive(PALETTE.azure, 0.85), []);
  const resistorMat = useMemo(() => emissive(PALETTE.azureWarm, 0.2 + glow * 1.7), [glow]);

  const raf = useRef<number | undefined>(undefined);
  const last = useRef<number | undefined>(undefined);
  const phaseRef = useRef(0);
  useEffect(() => {
    if (!playing) return;
    last.current = undefined;
    const tick = (now: number) => {
      if (last.current === undefined) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      phaseRef.current = (phaseRef.current + dt * rate) % 1;
      setPhase(phaseRef.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, rate]);

  const dots3 = useMemo(
    () => Array.from({ length: DOTS }, (_, i) => pointAt3D((i / DOTS + phase) % 1)),
    [phase],
  );

  function modelProblem() {
    const text = wpText.trim();
    if (!text) return;
    const parsed = parseCircuitProblem(text);
    for (const [sym, val] of Object.entries(parsed.base)) setBase(sym, val);
    if (parsed.solveFor) eqp.setSolveTarget(parsed.solveFor.eqId, parsed.solveFor.unknown);
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
        placeholder="Word problem → model: e.g. a 12 V battery drives a 60 Ω resistor. How much current flows?"
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
            <p className="wp__result wp__result--warn">Couldn't find the numbers. Try “12 V battery, 60 Ω resistor”.</p>
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
                  env="lite"
                  frameloop={playing ? 'always' : 'demand'}
                  camera={{ position: [3.4, 3.6, 4.8], fov: 46 }}
                  controls={{ target: [0, 0, 0], minDistance: 3, maxDistance: 16 }}
                >
                  {/* the wire loop */}
                  <Line points={[...CORNERS3, CORNERS3[0]]} color={PALETTE.chrome} lineWidth={3} />

                  {/* battery on the left edge (two plates) */}
                  <mesh position={[-HX, 0.24, -0.14]} material={batteryMat}>
                    <boxGeometry args={[0.05, 0.4, 0.5]} />
                  </mesh>
                  <mesh position={[-HX, 0.2, 0.04]} material={batteryMat}>
                    <boxGeometry args={[0.05, 0.28, 0.3]} />
                  </mesh>

                  {/* resistor on the far edge, glowing with power */}
                  <mesh position={[0, 0.2, -HZ]} rotation={[0, 0, Math.PI / 2]} material={resistorMat}>
                    <cylinderGeometry args={[0.13, 0.13, 0.7, 20]} />
                  </mesh>
                  <pointLight position={[0, 0.6, -HZ]} intensity={0.3 + glow * 3} color={PALETTE.azureWarm} distance={4} />

                  {/* conventional-current direction marker on the right edge */}
                  <Vector3D origin={[HX, 0.2, -0.25]} dir={[0, 0, 1]} length={0.5} color={PALETTE.azure} />

                  {/* flowing charges */}
                  {dots3.map((p, i) => (
                    <mesh key={i} position={p} material={chargeMat}>
                      <sphereGeometry args={[0.07, 16, 16]} />
                    </mesh>
                  ))}
                </Scene3D>

                <div className="ps__legend" aria-hidden="true">
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.azure }} /> charge flow</span>
                  <span className="ps__legend-row">source <b>V = {fmt(resolved.V)} V</b></span>
                  <span className="ps__legend-row">resistor <b>R = {fmt(resolved.R)} Ω</b></span>
                </div>
              </div>
            ) : (
              <CircuitFallback2D state={s} resolved={resolved} phase={phase} title={spec.title} />
            )}

            <div className="ps__readout">
              <span>current <b>{fmt(s.current)}</b> A</span>
              <span>power <b>{fmt(s.power)}</b> W</span>
            </div>

            <div className="ps__transport">
              <button type="button" className="ps__play" onClick={() => setPlaying((p) => !p)}>
                {playing ? '❚❚ pause flow' : '▶ play flow'}
              </button>
              <span className="ps__time">charge flow speed ∝ current</span>
            </div>
          </div>
        </div>

        <EquationPanel {...eqp.panelProps} />
      </div>
    </div>
  );
}

/** Point at fractional position `frac` (0–1) clockwise around the 3D loop. */
function pointAt3D(frac: number): V3 {
  const n = CORNERS3.length;
  const segLen = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const lens = CORNERS3.map((c, i) => segLen(c, CORNERS3[(i + 1) % n]));
  const total = lens.reduce((t, l) => t + l, 0);
  let d = (((frac % 1) + 1) % 1) * total;
  for (let i = 0; i < n; i++) {
    if (d <= lens[i]) {
      const a = CORNERS3[i];
      const b = CORNERS3[(i + 1) % n];
      const u = d / lens[i];
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    }
    d -= lens[i];
  }
  return CORNERS3[0];
}

/** Non-WebGL fallback — the original 2D SVG, reading the same circuit state. */
function CircuitFallback2D({
  state,
  resolved,
  phase,
  title,
}: {
  state: CircuitState;
  resolved: Record<string, number>;
  phase: number;
  title: string;
}) {
  const glow = state.power / (state.power + 8);
  const dots = Array.from({ length: DOTS }, (_, i) => pointAt((i / DOTS + phase) % 1));
  return (
    <svg className="ps__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <defs>
        <marker id="cir-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="ps__arrowhead" />
        </marker>
        <filter id="cir-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <path
        d={`M${X0} ${Y0 + 36} L${X0} ${Y1} L${X1} ${Y1} L${X1} ${Y0} L${(X0 + X1) / 2 + 32} ${Y0}
            M${(X0 + X1) / 2 - 32} ${Y0} L${X0} ${Y0} L${X0} ${Y0 + 4}`}
        className="ps__wire"
      />
      <line x1={X0 - 11} x2={X0 + 11} y1={Y0 + 12} y2={Y0 + 12} className="ps__plate ps__plate--lg" />
      <line x1={X0 - 6} x2={X0 + 6} y1={Y0 + 24} y2={Y0 + 24} className="ps__plate" />
      <text x={X0 - 18} y={Y0 + 16} className="ps__lbl ps__lbl--end">+</text>
      <text x={X0 + 26} y={Y0 + 34} className="ps__lbl">{fmt(resolved.V)} V</text>
      <ellipse
        cx={(X0 + X1) / 2}
        cy={Y0}
        rx={40}
        ry={20}
        className="ps__rglow"
        filter="url(#cir-glow)"
        style={{ opacity: 0.15 + 0.75 * glow }}
      />
      <path d={resistorPath((X0 + X1) / 2 - 30, (X0 + X1) / 2 + 30, Y0)} className="ps__resistor" />
      <text x={(X0 + X1) / 2} y={Y0 - 22} className="ps__lbl ps__lbl--mid">{fmt(resolved.R)} Ω</text>
      <line x1={X1} y1={(Y0 + Y1) / 2 - 14} x2={X1} y2={(Y0 + Y1) / 2 + 14} className="ps__vel" markerEnd="url(#cir-arrow)" />
      {dots.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} className="ps__charge" />
      ))}
    </svg>
  );
}

/** Point at fractional position `frac` (0–1) clockwise around the 2D loop. */
function pointAt(frac: number): { x: number; y: number } {
  const segs = CORNERS.map((c, i) => [c, CORNERS[(i + 1) % CORNERS.length]] as const);
  const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lens.reduce((s, l) => s + l, 0);
  let d = ((frac % 1) + 1) % 1 * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= lens[i]) {
      const [a, b] = segs[i];
      const u = d / lens[i];
      return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u };
    }
    d -= lens[i];
  }
  return { x: CORNERS[0][0], y: CORNERS[0][1] };
}

/** A resistor drawn as a horizontal zigzag between two wire ends. */
function resistorPath(x1: number, x2: number, y: number, zig = 6, amp = 9): string {
  const len = x2 - x1;
  const seg = len / zig;
  let d = `M${x1} ${y} `;
  for (let i = 1; i < zig; i++) {
    const x = x1 + seg * i;
    const yy = y + (i % 2 ? -amp : amp);
    d += `L${x.toFixed(1)} ${yy.toFixed(1)} `;
  }
  d += `L${x2} ${y}`;
  return d;
}
