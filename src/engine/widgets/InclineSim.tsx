/**
 * Inclined-plane renderer. A hands-on block on a ramp: drag the angle, mass,
 * friction, and gravity and watch the free-body diagram (weight, normal, and
 * friction vectors) and the down-slope acceleration respond live. Play to watch
 * it slide, or scrub time by hand — and when friction wins, it stays put.
 *
 * It hosts the same equation column (EquationPanel) as the other models: pick an
 * equation (acceleration, normal force, friction…), set the knowns, and the
 * remaining variable is solved for — fed back into THIS scene when it's one of
 * the block's own parameters. Picture and formula are one shared state.
 *
 * All forces come from inclineState (validate.ts) — the same closed form the
 * correctness gate verified — so what's drawn is exactly what's checked.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { inclineState } from '../validate.ts';
import { equationsForSpecType } from '../equations.ts';
import { parseInclineProblem } from '../wordProblems.ts';
import { fmt } from '../format.ts';
import { useEquationPanel } from '../useEquationPanel.ts';
import EquationPanel from '../EquationPanel.tsx';
import WordProblemBar from '../WordProblemBar.tsx';
import type { InclineSpec } from '../spec.ts';

const WP_EXAMPLE = 'A 2 kg block sits on a 30° incline with coefficient of friction 0.2. What is its acceleration?';

const W = 600;
const H = 320;
const ANCHOR_X = 120; // bottom of the ramp (foot of the slope)
const ANCHOR_Y = 250;
const RAMP_M = 10; // metres of slope the block can travel
const BLOCK = 30; // block size (px)

const SET = equationsForSpecType('free-body-diagram')!;

export default function InclineSim({ spec }: { spec: InclineSpec }) {
  const [angle, setAngle] = useState(spec.angle);
  const [mass, setMass] = useState(spec.mass);
  const [friction, setFriction] = useState(spec.friction);
  const [gravity, setGravity] = useState(spec.gravity);
  const [tRaw, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [wpText, setWpText] = useState('');
  const [wpInfo, setWpInfo] = useState<{ found: string[]; askedLabel: string | null } | null>(null);

  const base: Record<string, number> = { theta: angle, mu: friction, m: mass, g: gravity, t: tRaw };
  function setBase(sym: string, val: number) {
    if (sym === 'theta') setAngle(val);
    else if (sym === 'mu') setFriction(val);
    else if (sym === 'm') setMass(val);
    else if (sym === 'g') setGravity(val);
    else if (sym === 't') setT(val);
  }

  const eqp = useEquationPanel(SET, base, setBase, () => setPlaying(false));
  const { resolved, unknown, setSolveTarget } = eqp;

  const st = useMemo(
    () =>
      inclineState({
        type: 'free-body-diagram',
        title: spec.title,
        angle: resolved.theta,
        mass: resolved.m,
        friction: resolved.mu,
        gravity: resolved.g,
        notes: spec.notes,
      }),
    [spec.title, spec.notes, resolved.theta, resolved.m, resolved.mu, resolved.g],
  );

  const th = (resolved.theta * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);

  // Keep the wedge on-screen at any angle by fitting the ramp length to the box.
  const rampLen = Math.min(
    255,
    (ANCHOR_Y - 36) / Math.max(sin, 0.12),
    (W - 70 - ANCHOR_X) / Math.max(cos, 0.12),
  );
  const pxPerM = rampLen / RAMP_M;

  const tBottom = st.sliding && st.accel > 0 ? Math.sqrt((2 * RAMP_M) / st.accel) : 4;
  const tLocked = unknown === 't';
  const tEff = Math.max(0, Math.min(resolved.t, tBottom));
  // Distance slid from the top of the ramp (m), clamped to the ramp length.
  const slid = Math.min(0.5 * st.accel * tEff * tEff, RAMP_M);

  // Ramp geometry: foot at the anchor, top up-slope; the wedge fills below.
  const up = { x: cos, y: -sin }; // up-slope unit vector
  const top = { x: ANCHOR_X + rampLen * up.x, y: ANCHOR_Y + rampLen * up.y };
  const footRight = { x: top.x, y: ANCHOR_Y };
  const downHill = { x: -cos, y: sin }; // down-slope unit vector
  const outNormal = { x: -sin, y: -cos }; // surface outward normal (up-left)

  // Block centre: slid from the top, lifted off the surface by half its size.
  const surf = { x: top.x + slid * pxPerM * downHill.x, y: top.y + slid * pxPerM * downHill.y };
  const bc = { x: surf.x + outNormal.x * (BLOCK / 2), y: surf.y + outNormal.y * (BLOCK / 2) };

  // Force arrows, all to a common scale (weight mg is the longest).
  const weight = resolved.m * resolved.g;
  const fScale = weight > 0 ? 62 / weight : 0;
  const arrows = [
    { x: 0, y: 1, len: weight * fScale, cls: 'ps__fw', label: `mg ${fmt(weight)} N` },
    { x: outNormal.x, y: outNormal.y, len: st.normal * fScale, cls: 'ps__fn', label: `N ${fmt(st.normal)} N` },
    { x: up.x, y: up.y, len: st.friction * fScale, cls: 'ps__ff', label: `f ${fmt(st.friction)} N` },
  ];

  const raf = useRef<number | undefined>(undefined);
  const start = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing || tLocked || !st.sliding) return;
    const playback = Math.min(Math.max(tBottom, 1.2), 4);
    start.current = undefined;
    const tick = (now: number) => {
      if (start.current === undefined) start.current = now;
      const p = ((now - start.current) / 1000 / playback) % 1;
      setT(p * tBottom);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, tLocked, st.sliding, tBottom]);

  function play() {
    if (tEff >= tBottom - 1e-3) setT(0);
    setPlaying((p) => !p);
  }

  function modelProblem() {
    const text = wpText.trim();
    if (!text) return;
    const parsed = parseInclineProblem(text);
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
        placeholder="Word problem → model: e.g. a 2 kg block on a 30° incline, friction 0.2. What is its acceleration?"
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
            <p className="wp__result wp__result--warn">Couldn't find the numbers. Try “2 kg block, 30° incline, friction 0.2”.</p>
          ))
        }
      />

      <div className="pmodel__body">
        <div className="pmodel__visual">
          <div className="ps">
            <svg className="ps__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title}>
              <defs>
                <marker id="inc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                  {/* context-stroke → each arrowhead matches its force line's colour */}
                  <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
                </marker>
              </defs>

              {/* Ground + wedge */}
              <line x1={40} x2={W - 30} y1={ANCHOR_Y} y2={ANCHOR_Y} className="ps__ground" />
              <polygon
                points={`${ANCHOR_X},${ANCHOR_Y} ${footRight.x},${footRight.y} ${top.x},${top.y}`}
                className="ps__wedge"
              />
              <text x={ANCHOR_X + 26} y={ANCHOR_Y - 6} className="ps__lbl">{fmt(resolved.theta)}°</text>

              {/* Block */}
              <rect
                x={-BLOCK / 2}
                y={-BLOCK / 2}
                width={BLOCK}
                height={BLOCK}
                rx={4}
                className="ps__block"
                transform={`translate(${bc.x} ${bc.y}) rotate(${-resolved.theta})`}
              />

              {/* Force vectors from the block centre */}
              {arrows
                .filter((a) => a.len > 1)
                .map((a, i) => (
                  <g key={i}>
                    <line
                      x1={bc.x}
                      y1={bc.y}
                      x2={bc.x + a.x * a.len}
                      y2={bc.y + a.y * a.len}
                      className={`ps__force ${a.cls}`}
                      markerEnd="url(#inc-arrow)"
                    />
                    <text x={bc.x + a.x * (a.len + 16)} y={bc.y + a.y * (a.len + 16)} className="ps__lbl ps__lbl--mid">
                      {a.label}
                    </text>
                  </g>
                ))}
            </svg>

            <div className="ps__readout">
              <span>acceleration <b>{fmt(st.accel)}</b> m/s²</span>
              <span>normal <b>{fmt(st.normal)}</b> N</span>
              <span>friction <b>{fmt(st.friction)}</b> N</span>
              <span className={st.sliding ? 'ps__tag ps__tag--go' : 'ps__tag ps__tag--hold'}>
                {st.sliding ? 'sliding' : 'static — friction holds it'}
              </span>
            </div>

            <div className="ps__transport">
              <button type="button" className="ps__play" disabled={tLocked || !st.sliding} onClick={play}>
                {playing ? '❚❚ pause' : '▶ play'}
              </button>
              <input
                className="ps__scrub"
                type="range"
                min={0}
                max={tBottom}
                step={tBottom / 200}
                value={tEff}
                disabled={tLocked || !st.sliding}
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
