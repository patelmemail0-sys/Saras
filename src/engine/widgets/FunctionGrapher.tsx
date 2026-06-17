/**
 * function-grapher renderer. Draws y = f(x) as an interactive SVG with a slider
 * per parameter. The spec is assumed already validated (validate.ts) — this
 * component only draws. Re-sampling is cheap (a few hundred points), so it runs
 * live as sliders move.
 */
import { useMemo, useState } from 'react';
import { validateFunctionGrapher } from '../validate.ts';
import type { FunctionGrapherSpec } from '../spec.ts';

const W = 560;
const H = 360;
const PAD = 40;
const SAMPLES = 400;

export default function FunctionGrapher({ spec }: { spec: FunctionGrapherSpec }) {
  // Compile once. The panel validates before mounting, but compiling here keeps
  // the widget self-contained and gives us the evaluator.
  const compiled = useMemo(() => validateFunctionGrapher(spec), [spec]);

  const [params, setParams] = useState<Record<string, number>>(() =>
    Object.fromEntries(spec.parameters.map((p) => [p.name, p.default])),
  );

  const { points, yMin, yMax } = useMemo(() => {
    const evaluate = compiled.evaluate;
    const { min, max } = spec.domain;
    const pts: Array<{ x: number; y: number } | null> = [];
    let lo = Infinity;
    let hi = -Infinity;
    if (evaluate) {
      for (let i = 0; i < SAMPLES; i++) {
        const x = min + ((max - min) * i) / (SAMPLES - 1);
        const y = evaluate(x, params);
        if (Number.isFinite(y)) {
          pts.push({ x, y });
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        } else {
          pts.push(null); // break the line at discontinuities
        }
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
      lo = -1;
      hi = 1;
    }
    const padY = (hi - lo) * 0.08 || 1;
    return { points: pts, yMin: lo - padY, yMax: hi + padY };
  }, [compiled, spec.domain, params]);

  const { min: xMin, max: xMax } = spec.domain;
  const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin)) * (H - 2 * PAD);

  // Build the path, breaking at nulls.
  const d = useMemo(() => {
    let path = '';
    let pen = false;
    for (const p of points) {
      if (!p) {
        pen = false;
        continue;
      }
      const X = sx(p.x);
      const Y = sy(p.y);
      path += `${pen ? 'L' : 'M'}${X.toFixed(1)} ${Y.toFixed(1)} `;
      pen = true;
    }
    return path.trim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, yMin, yMax, xMin, xMax]);

  const showXAxis = yMin < 0 && yMax > 0;
  const showYAxis = xMin < 0 && xMax > 0;

  return (
    <div className="fg">
      <svg className="fg__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title}>
        {/* frame */}
        <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} className="fg__frame" />
        {/* axes through origin when visible */}
        {showXAxis && <line x1={PAD} x2={W - PAD} y1={sy(0)} y2={sy(0)} className="fg__axis" />}
        {showYAxis && <line y1={PAD} y2={H - PAD} x1={sx(0)} x2={sx(0)} className="fg__axis" />}
        {/* the curve */}
        <path d={d} className="fg__curve" />
        {/* labels */}
        <text x={W - PAD} y={H - PAD + 22} className="fg__lbl fg__lbl--x">{spec.xLabel}</text>
        <text x={PAD - 8} y={PAD - 14} className="fg__lbl fg__lbl--y">{spec.yLabel}</text>
        {/* domain ticks */}
        <text x={PAD} y={H - PAD + 18} className="fg__tick">{fmt(xMin)}</text>
        <text x={W - PAD} y={H - PAD + 18} className="fg__tick fg__tick--end">{fmt(xMax)}</text>
        <text x={PAD - 8} y={PAD + 4} className="fg__tick fg__tick--right">{fmt(yMax)}</text>
        <text x={PAD - 8} y={H - PAD} className="fg__tick fg__tick--right">{fmt(yMin)}</text>
      </svg>

      {spec.parameters.length > 0 && (
        <div className="fg__controls">
          {spec.parameters.map((p) => (
            <label key={p.name} className="fg__ctrl">
              <span className="fg__ctrl-label">
                {p.label} <b>{fmt(params[p.name])}</b>
              </span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={params[p.name]}
                onChange={(e) =>
                  setParams((prev) => ({ ...prev, [p.name]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}
