/**
 * Ohm's-law renderer. A hands-on single-loop circuit: drag the source voltage
 * and the resistance and watch the current (animated charge flow around the
 * loop) and the power dissipated (the resistor's glow) respond live.
 *
 * It hosts the same equation column (EquationPanel) as the other models: pick
 * Ohm's law or the power relation, set the knowns, and the remaining variable is
 * solved for — and when it's the source voltage or resistance, fed straight back
 * into THIS loop. Picture and formula are one shared state.
 *
 * All values come from circuitState (validate.ts) — the same closed form the
 * correctness gate verified — so what's drawn is exactly what's checked.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { circuitState } from '../validate.ts';
import { equationsForSpecType } from '../equations.ts';
import { parseCircuitProblem } from '../wordProblems.ts';
import { fmt } from '../format.ts';
import { useEquationPanel } from '../useEquationPanel.ts';
import EquationPanel from '../EquationPanel.tsx';
import WordProblemBar from '../WordProblemBar.tsx';
import type { CircuitSpec } from '../spec.ts';

const WP_EXAMPLE = 'A 12 V battery drives a 60 Ω resistor. How much current flows, and what power is dissipated?';

const W = 600;
const H = 320;
// Loop rectangle, walked clockwise from the top-left corner.
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

const SET = equationsForSpecType('circuit-diagram')!;

export default function CircuitSim({ spec }: { spec: CircuitSpec }) {
  const [voltage, setVoltage] = useState(spec.voltage);
  const [resistance, setResistance] = useState(spec.resistance);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState(0);

  const [wpText, setWpText] = useState('');
  const [wpInfo, setWpInfo] = useState<{ found: string[]; askedLabel: string | null } | null>(null);

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

  const dots = useMemo(
    () => Array.from({ length: DOTS }, (_, i) => pointAt((i / DOTS + phase) % 1)),
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
            <svg className="ps__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title}>
              <defs>
                <marker id="cir-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" className="ps__arrowhead" />
                </marker>
                <filter id="cir-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="7" />
                </filter>
              </defs>

              {/* Wires: the loop minus the battery gap (left) and resistor gap (top). */}
              <path
                d={`M${X0} ${Y0 + 36} L${X0} ${Y1} L${X1} ${Y1} L${X1} ${Y0} L${(X0 + X1) / 2 + 32} ${Y0}
                    M${(X0 + X1) / 2 - 32} ${Y0} L${X0} ${Y0} L${X0} ${Y0 + 4}`}
                className="ps__wire"
              />

              {/* Battery on the left edge (long plate = +, short plate = −). */}
              <line x1={X0 - 11} x2={X0 + 11} y1={Y0 + 12} y2={Y0 + 12} className="ps__plate ps__plate--lg" />
              <line x1={X0 - 6} x2={X0 + 6} y1={Y0 + 24} y2={Y0 + 24} className="ps__plate" />
              <text x={X0 - 18} y={Y0 + 16} className="ps__lbl ps__lbl--end">+</text>
              <text x={X0 + 26} y={Y0 + 34} className="ps__lbl">{fmt(resolved.V)} V</text>

              {/* Resistor on the top edge, with a soft power-glow halo behind it. */}
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

              {/* Conventional-current direction marker. */}
              <line x1={X1} y1={(Y0 + Y1) / 2 - 14} x2={X1} y2={(Y0 + Y1) / 2 + 14} className="ps__vel" markerEnd="url(#cir-arrow)" />

              {/* Flowing charges. */}
              {dots.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} className="ps__charge" />
              ))}
            </svg>

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

/** Point at fractional position `frac` (0–1) clockwise around the loop. */
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
