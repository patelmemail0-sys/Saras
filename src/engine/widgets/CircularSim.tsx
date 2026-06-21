/**
 * Uniform-circular-motion renderer. A hands-on object on a circular path: drag
 * the radius and speed and watch the period, angular velocity, and centripetal
 * acceleration respond live. The velocity vector (tangent) and acceleration
 * vector (always toward the centre) ride along. Play to orbit, or scrub by hand.
 *
 * It hosts the same equation column (EquationPanel) as the other models: pick an
 * equation (ω, centripetal acceleration, period), set the knowns, and the
 * remaining variable is solved for — fed back into THIS orbit when it's the
 * radius or speed. Picture and formula are one shared state.
 *
 * All physics comes from circularKinematics (validate.ts) — the same closed form
 * the correctness gate verified — so what's drawn is exactly what's checked.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { circularKinematics } from '../validate.ts';
import { equationsForSpecType } from '../equations.ts';
import { parseCircularProblem } from '../wordProblems.ts';
import { fmt } from '../format.ts';
import { useEquationPanel } from '../useEquationPanel.ts';
import EquationPanel from '../EquationPanel.tsx';
import WordProblemBar from '../WordProblemBar.tsx';
import type { CircularSpec } from '../spec.ts';

const WP_EXAMPLE = 'A car goes 10 m/s around a circle of radius 5 m. Find the centripetal acceleration.';

const W = 600;
const H = 320;
const CX = 300;
const CY = 158;

const SET = equationsForSpecType('circular-motion')!;

export default function CircularSim({ spec }: { spec: CircularSpec }) {
  const [radius, setRadius] = useState(spec.radius);
  const [speed, setSpeed] = useState(spec.speed);
  const [tRaw, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [wpText, setWpText] = useState('');
  const [wpInfo, setWpInfo] = useState<{ found: string[]; askedLabel: string | null } | null>(null);

  const base: Record<string, number> = { r: radius, v: speed, t: tRaw };
  function setBase(sym: string, val: number) {
    if (sym === 'r') setRadius(val);
    else if (sym === 'v') setSpeed(val);
    else if (sym === 't') setT(val);
  }

  const eqp = useEquationPanel(SET, base, setBase, () => setPlaying(false));
  const { resolved, unknown, setSolveTarget } = eqp;

  const k = useMemo(
    () => circularKinematics({ type: 'circular-motion', title: spec.title, radius: resolved.r, speed: resolved.v, notes: spec.notes }),
    [spec.title, spec.notes, resolved.r, resolved.v],
  );

  const period = k.period;
  const tLocked = unknown === 't';
  const tEff = Math.max(0, Math.min(resolved.t, period));
  const phi = k.angleAt(tEff);

  // Screen radius grows with r but stays inside the frame.
  const screenR = Math.min(Math.max(34 + resolved.r * 7, 48), 128);
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const pos = { x: CX + screenR * cos, y: CY - screenR * sin }; // counter-clockwise

  // Velocity is tangent (CCW); acceleration points at the centre. Each scaled to
  // show its own magnitude (lengths are illustrative, the readouts carry units).
  const velLen = Math.min(18 + resolved.v * 2, 74);
  const vel = { x: -sin, y: -cos };
  const accLen = Math.min(14 + k.centripetal * 1.1, 82);
  const acc = { x: -cos, y: sin };

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
    const parsed = parseCircularProblem(text);
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
        placeholder="Word problem → model: e.g. a car at 10 m/s around a 5 m circle. Find the centripetal acceleration."
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
            <p className="wp__result wp__result--warn">Couldn't find the numbers. Try “10 m/s around a 5 m circle”.</p>
          ))
        }
      />

      <div className="pmodel__body">
        <div className="pmodel__visual">
          <div className="ps">
            <svg className="ps__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title}>
              <defs>
                <marker id="cm-arrow-v" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" className="ps__arrowhead" />
                </marker>
                <marker id="cm-arrow-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" className="ps__arrowhead--alt" />
                </marker>
              </defs>

              {/* Path + centre + radius */}
              <circle cx={CX} cy={CY} r={screenR} className="ps__path" />
              <circle cx={CX} cy={CY} r={3} className="ps__apex" />
              <line x1={CX} y1={CY} x2={pos.x} y2={pos.y} className="ps__guide" />
              {/* radius label nudged ⟂ to the radius line so it clears the a_c arrow */}
              <text
                x={(CX + pos.x) / 2 - sin * 16}
                y={(CY + pos.y) / 2 - cos * 16}
                className="ps__lbl ps__lbl--mid"
              >
                r {fmt(resolved.r)} m
              </text>

              {/* Acceleration (toward centre) then velocity (tangent) */}
              <line x1={pos.x} y1={pos.y} x2={pos.x + acc.x * accLen} y2={pos.y + acc.y * accLen} className="ps__force ps__fa" markerEnd="url(#cm-arrow-a)" />
              <text x={pos.x + acc.x * (accLen + 12)} y={pos.y + acc.y * (accLen + 12)} className="ps__lbl ps__lbl--mid">a_c</text>
              <line x1={pos.x} y1={pos.y} x2={pos.x + vel.x * velLen} y2={pos.y + vel.y * velLen} className="ps__vel" markerEnd="url(#cm-arrow-v)" />
              <text x={pos.x + vel.x * (velLen + 12)} y={pos.y + vel.y * (velLen + 12)} className="ps__lbl ps__lbl--mid">v</text>

              <circle cx={pos.x} cy={pos.y} r={7} className="ps__ball" />
            </svg>

            <div className="ps__readout">
              <span>period <b>{fmt(period)}</b> s</span>
              <span>ω <b>{fmt(k.omega)}</b> rad/s</span>
              <span>centripetal a <b>{fmt(k.centripetal)}</b> m/s²</span>
            </div>

            <div className="ps__transport">
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
