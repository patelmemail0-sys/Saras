/**
 * projectile renderer. A hands-on 2D launch under gravity: drag speed, angle,
 * gravity, and launch height and watch the trajectory, range, apex, and flight
 * time respond live. Play to animate the flight, or scrub time by hand.
 *
 * It also hosts the equation column (EquationPanel): pick an equation, set the
 * known variables, and whatever is left over is solved for and pushed into THIS
 * same trajectory — the picture and the formula are one shared state. When a
 * launch parameter is the unknown, its left-hand control locks (the equation
 * owns it).
 *
 * All physics comes from projectileKinematics (validate.ts) — the same closed
 * form the correctness gate verified — so what's drawn is exactly what's checked.
 * Pure SVG, no 3D/physics library; the trajectory is sampled, not integrated.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { projectileKinematics, validateProjectile } from '../validate.ts';
import { equationsForSpecType, solveFor, type Equation } from '../equations.ts';
import { parseProjectileWordProblem } from '../projectileWordProblem.ts';
import EquationPanel from '../EquationPanel.tsx';
import type { ProjectileSpec, SpecResponse } from '../spec.ts';

const WP_EXAMPLE =
  'A ball is kicked at 22 m/s at 40° from the top of a 10 m cliff. How far does it land?';

// The word-problem box uses the offline parser by default. Set VITE_SPEC_AI=true
// (and run `vercel dev` with ANTHROPIC_API_KEY) to also try the AI backend for
// messier phrasing. Off by default → no API key needed, no wasted /api/spec call.
const AI_ENABLED = (import.meta.env as { VITE_SPEC_AI?: string }).VITE_SPEC_AI === 'true';

const W = 600;
const H = 320;
const PAD = 34;
const SAMPLES = 120;

const SET = equationsForSpecType('projectile')!;
const isBase = (sym: string) => SET.baseParams.includes(sym);
/** The single derived (non-base) variable of an equation, e.g. R / H / x. */
const auxOf = (eq: Equation) => eq.variables.find((v) => !isBase(v.symbol))!.symbol;

export default function ProjectileSim({ spec }: { spec: ProjectileSpec }) {
  // Raw launch state — what the left-hand controls edit directly.
  const [speed, setSpeed] = useState(spec.speed);
  const [angle, setAngle] = useState(spec.angle);
  const [gravity, setGravity] = useState(spec.gravity);
  const [height, setHeight] = useState(spec.height);
  const [tRaw, setT] = useState(0); // scrub time (s); may outrun a shrunk flight
  const [playing, setPlaying] = useState(false);

  // Equation-panel state.
  const [eqId, setEqId] = useState(SET.equations[0].id);
  const [unknown, setUnknown] = useState(auxOf(SET.equations[0])); // default: solve the output
  const [aux, setAux] = useState<Record<string, number>>({});

  // Word-problem state.
  const [wpText, setWpText] = useState('');
  const [wpBusy, setWpBusy] = useState(false);
  const [wpInfo, setWpInfo] = useState<{
    found: string[];
    askedLabel: string | null;
    source: 'AI' | 'parser' | null;
  } | null>(null);

  const eq = SET.equations.find((e) => e.id === eqId) ?? SET.equations[0];
  const rawBase: Record<string, number> = { v0: speed, theta: angle, g: gravity, h: height, t: tRaw };

  // Solve the chosen unknown from the other variables of the equation.
  const knowns: Record<string, number> = {};
  for (const v of eq.variables) {
    if (v.symbol === unknown) continue;
    knowns[v.symbol] = isBase(v.symbol) ? rawBase[v.symbol] : aux[v.symbol] ?? v.default;
  }
  const guessVar = eq.variables.find((v) => v.symbol === unknown);
  const guess = isBase(unknown) ? rawBase[unknown] : aux[unknown] ?? guessVar?.default;
  const solved = solveFor(eq, unknown, knowns, guess);

  // Resolved launch params drive the visual: if the unknown is a launch param,
  // its solved value overrides the raw one.
  const resolved: Record<string, number> = { ...rawBase };
  if (isBase(unknown) && solved.value != null) resolved[unknown] = solved.value;

  const k = useMemo(
    () =>
      projectileKinematics({
        ...spec,
        speed: resolved.v0,
        angle: resolved.theta,
        gravity: resolved.g,
        height: resolved.h,
      }),
    [spec, resolved.v0, resolved.theta, resolved.g, resolved.h],
  );

  // Effective time for the ball/trail, clamped to the (possibly shrunk) flight.
  const tEff = Math.max(0, Math.min(resolved.t, k.flightTime));
  const tLocked = unknown === 't';

  const worldW = Math.max(k.range, 1);
  const worldH = Math.max(k.maxHeight, 1);
  const scale = Math.min((W - 2 * PAD) / worldW, (H - 2 * PAD) / worldH);
  const sx = (x: number) => PAD + x * scale;
  const sy = (y: number) => H - PAD - y * scale;

  const path = useMemo(() => {
    let d = '';
    for (let i = 0; i <= SAMPLES; i++) {
      const p = k.at((k.flightTime * i) / SAMPLES);
      d += `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)} `;
    }
    return d.trim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, scale]);

  const trail = useMemo(() => {
    if (tEff <= 0 || k.flightTime <= 0) return '';
    const n = Math.max(2, Math.ceil((SAMPLES * tEff) / k.flightTime));
    let d = '';
    for (let i = 0; i <= n; i++) {
      const p = k.at((tEff * i) / n);
      d += `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)} `;
    }
    return d.trim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, scale, tEff]);

  // Animation loop: replay the flight over a watchable duration, looping. Never
  // auto-runs (honors prefers-reduced-motion); disabled while time is the unknown.
  const raf = useRef<number | undefined>(undefined);
  const start = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing || tLocked) return;
    const playback = Math.min(Math.max(k.flightTime, 1.2), 4);
    start.current = undefined;
    const tick = (now: number) => {
      if (start.current === undefined) start.current = now;
      const p = ((now - start.current) / 1000 / playback) % 1;
      setT(p * k.flightTime);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, tLocked, k.flightTime]);

  const ball = k.at(tEff);
  const vy = k.vy0 - resolved.g * tEff;
  const speedNow = Math.hypot(k.vx, vy) || 1;
  const arrowLen = 34;
  const ax = sx(ball.x) + (k.vx / speedNow) * arrowLen;
  const ay = sy(ball.y) - (vy / speedNow) * arrowLen;
  const apex = k.at(k.apexTime);

  function play() {
    if (tEff >= k.flightTime - 1e-3) setT(0);
    setPlaying((p) => !p);
  }

  // --- equation-panel handlers -------------------------------------------------
  const baseKnowns = (e: Equation, base: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const v of e.variables) if (isBase(v.symbol)) out[v.symbol] = base[v.symbol];
    return out;
  };

  function selectEquation(id: string) {
    const e = SET.equations.find((x) => x.id === id);
    if (!e) return;
    const a = auxOf(e);
    const derived = solveFor(e, a, baseKnowns(e, rawBase), aux[a]).value;
    setAux((p) => ({ ...p, [a]: derived ?? e.variables.find((v) => v.symbol === a)!.default }));
    setUnknown(a); // default to solving the equation's output
    setEqId(id);
    setPlaying(false);
  }

  function selectUnknown(sym: string) {
    const a = auxOf(eq);
    // When the aux variable becomes a known, seed it to the current value so
    // solving a launch param starts from where the picture already is.
    if (sym !== a) {
      const derived = solveFor(eq, a, baseKnowns(eq, rawBase), aux[a]).value;
      if (derived != null) setAux((p) => ({ ...p, [a]: derived }));
    }
    if (sym === 't') setPlaying(false);
    setUnknown(sym);
  }

  function baseChange(sym: string, val: number) {
    if (sym === 'v0') setSpeed(val);
    else if (sym === 'theta') setAngle(val);
    else if (sym === 'g') setGravity(val);
    else if (sym === 'h') setHeight(val);
    else if (sym === 't') setT(val);
  }

  // Read a word problem, fill the launch parameters, and surface the quantity it
  // asks for so the answer shows in the equation panel. Tries the AI backend
  // (/api/spec) for robust extraction from messy phrasing, falls back to the
  // deterministic local parser when the backend is unreachable or unhelpful.
  // Question detection ("how far / how long / how high") is always local — the
  // spec response doesn't carry it, and the phrasing is regex-reliable.
  async function modelProblem() {
    const text = wpText.trim();
    if (!text) return;
    setWpBusy(true);

    const local = parseProjectileWordProblem(text);
    let params: Pick<ProjectileSpec, 'speed' | 'angle' | 'gravity' | 'height'> | null = null;
    let source: 'AI' | 'parser' = 'parser';

    if (AI_ENABLED) {
      try {
        const res = await fetch('/api/spec', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: text }),
        });
        if (res.ok) {
          const data = (await res.json()) as SpecResponse;
          // Trust AI numbers only for a projectile spec that passes the gate.
          if (data.supported && data.spec?.type === 'projectile' && validateProjectile(data.spec).valid) {
            const s = data.spec;
            params = { speed: s.speed, angle: s.angle, gravity: s.gravity, height: s.height };
            source = 'AI';
          }
        }
      } catch {
        // Offline / no backend → fall through to the local parser.
      }
    }

    // Local extraction fills in if the AI path didn't produce usable numbers.
    const finalParams = {
      speed: params?.speed ?? local.speed,
      angle: params?.angle ?? local.angle,
      gravity: params?.gravity ?? local.gravity,
      height: params?.height ?? local.height,
    };

    if (finalParams.speed != null) setSpeed(finalParams.speed);
    if (finalParams.angle != null) setAngle(finalParams.angle);
    if (finalParams.gravity != null) setGravity(finalParams.gravity);
    if (finalParams.height != null) setHeight(finalParams.height);
    if (local.solveFor) {
      setEqId(local.solveFor.eqId);
      setUnknown(local.solveFor.unknown);
    }
    setPlaying(false);

    const found: string[] = [];
    if (finalParams.speed != null) found.push(`speed ${fmt(finalParams.speed)} m/s`);
    if (finalParams.angle != null) found.push(`angle ${fmt(finalParams.angle)}°`);
    if (finalParams.gravity != null) found.push(`gravity ${fmt(finalParams.gravity)} m/s²`);
    if (finalParams.height != null) found.push(`launch height ${fmt(finalParams.height)} m`);
    const askedLabel = local.solveFor
      ? SET.equations.find((e) => e.id === local.solveFor!.eqId)?.label ?? null
      : null;
    // Only surface a source tag when AI is enabled (so there are two paths to
    // distinguish); with the parser alone it adds nothing.
    setWpInfo({ found, askedLabel, source: AI_ENABLED ? source : null });
    setWpBusy(false);
  }

  return (
    <div className="pmodel">
      <div className="pmodel__wp">
        <div className="wp__bar">
          <input
            className="wp__input"
            type="text"
            placeholder="Word problem → model: e.g. a ball is kicked at 22 m/s at 40° from a 10 m cliff. How far does it land?"
            value={wpText}
            onChange={(e) => setWpText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') modelProblem();
            }}
          />
          <button
            type="button"
            className="wp__go"
            onClick={modelProblem}
            disabled={wpBusy || !wpText.trim()}
          >
            {wpBusy ? 'Modeling…' : 'Model it →'}
          </button>
          <button type="button" className="wp__ex" onClick={() => setWpText(WP_EXAMPLE)}>
            example
          </button>
        </div>
        {!wpBusy &&
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
              {wpInfo.source && <span className="wp__src"> · via {wpInfo.source}</span>}
            </p>
          ) : (
            <p className="wp__result wp__result--warn">
              Couldn't find the numbers. Try something like “20 m/s at 35° from a 10 m cliff”.
            </p>
          ))}
      </div>

      <div className="pmodel__body">
      <div className="pmodel__visual">
        <div className="ps">
          <svg className="ps__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title}>
            <defs>
              <marker
                id="ps-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" className="ps__arrowhead" />
              </marker>
            </defs>

            <line x1={PAD} x2={W - PAD} y1={sy(0)} y2={sy(0)} className="ps__ground" />

            <path d={path} className="ps__arc" />
            <path d={trail} className="ps__arc ps__arc--trail" />

            <line x1={sx(apex.x)} x2={sx(apex.x)} y1={sy(apex.y)} y2={sy(0)} className="ps__guide" />
            <circle cx={sx(apex.x)} cy={sy(apex.y)} r={3} className="ps__apex" />
            <text x={sx(apex.x)} y={sy(apex.y) - 8} className="ps__lbl ps__lbl--mid">
              apex {fmt(k.maxHeight)} m
            </text>

            {resolved.h > 0 && (
              <line x1={PAD} x2={sx(0)} y1={sy(resolved.h)} y2={sy(resolved.h)} className="ps__guide" />
            )}

            <line x1={sx(ball.x)} y1={sy(ball.y)} x2={ax} y2={ay} className="ps__vel" markerEnd="url(#ps-arrow)" />
            <circle cx={sx(ball.x)} cy={sy(ball.y)} r={6} className="ps__ball" />

            <text x={sx(k.range)} y={sy(0) + 18} className="ps__lbl ps__lbl--end">
              {fmt(k.range)} m
            </text>
            <text x={PAD} y={sy(0) + 18} className="ps__lbl">0</text>
          </svg>

          <div className="ps__readout">
            <span>range <b>{fmt(k.range)}</b> m</span>
            <span>max height <b>{fmt(k.maxHeight)}</b> m</span>
            <span>flight time <b>{fmt(k.flightTime)}</b> s</span>
          </div>

          <div className="ps__transport">
            <button type="button" className="ps__play" disabled={tLocked} onClick={play}>
              {playing ? '❚❚ pause' : '▶ play'}
            </button>
            <input
              className="ps__scrub"
              type="range"
              min={0}
              max={k.flightTime}
              step={k.flightTime / 200}
              value={tEff}
              disabled={tLocked}
              aria-label="Flight time"
              onChange={(e) => {
                setPlaying(false);
                setT(Number(e.target.value));
              }}
            />
            <span className="ps__time">t = {fmt(tEff)} s</span>
          </div>
        </div>
      </div>

      <EquationPanel
        set={SET}
        eqId={eqId}
        unknown={unknown}
        resolved={resolved}
        aux={aux}
        solved={solved}
        onSelectEquation={selectEquation}
        onSelectUnknown={selectUnknown}
        onBaseChange={baseChange}
        onAuxChange={(sym, val) => setAux((p) => ({ ...p, [sym]: val }))}
      />
      </div>
    </div>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}
