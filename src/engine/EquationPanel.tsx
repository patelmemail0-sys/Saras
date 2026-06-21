/**
 * EquationPanel — the "work the equation" side column for equation-based widgets.
 *
 * Generic + fully controlled: the parent owns the shared state and passes the
 * resolved values down. The student picks an equation, picks which variable is
 * the unknown, types the knowns, and the solved unknown is shown (and, when it's
 * one of the visual's parameters, fed straight back into the picture by the
 * parent). Works for any {@link EquationSet}, not just projectiles.
 *
 * Each variable's unit is a dropdown: a student can read or enter any value in a
 * unit of their choosing (cm, ft, rad, kΩ…). That choice is display-only — values
 * are converted to/from the variable's canonical unit (see units.ts) so the parent
 * state, the solver, and the picture always run in canonical SI.
 */
import { useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { EquationSet, SolveResult } from './equations.ts';
import { unitsFor, toCanonical, fromCanonical, type UnitOption } from './units.ts';

interface EquationPanelProps {
  set: EquationSet;
  eqId: string;
  /** Symbol of the variable currently being solved for. */
  unknown: string;
  /** Resolved base values keyed by symbol (drives the visual). */
  resolved: Record<string, number>;
  /** Aux (non-base) known values keyed by symbol. */
  aux: Record<string, number>;
  /** Solved value of the current unknown. */
  solved: SolveResult;
  onSelectEquation: (id: string) => void;
  onSelectUnknown: (sym: string) => void;
  onBaseChange: (sym: string, val: number) => void;
  onAuxChange: (sym: string, val: number) => void;
}

export default function EquationPanel({
  set,
  eqId,
  unknown,
  resolved,
  aux,
  solved,
  onSelectEquation,
  onSelectUnknown,
  onBaseChange,
  onAuxChange,
}: EquationPanelProps) {
  const eq = set.equations.find((e) => e.id === eqId) ?? set.equations[0];
  const isBase = (sym: string) => set.baseParams.includes(sym);

  // Per-variable chosen display unit (symbol → unit symbol). Display-only; the
  // values handed to the parent stay canonical.
  const [unitSel, setUnitSel] = useState<Record<string, string>>({});
  const optFor = (sym: string, canonicalUnit: string): { opts: UnitOption[]; opt: UnitOption } => {
    const opts = unitsFor(canonicalUnit);
    const opt = opts.find((o) => o.symbol === unitSel[sym]) ?? opts[0];
    return { opts, opt };
  };

  // Typeset the relation as real math (KaTeX). throwOnError:false degrades to the
  // raw source rather than crashing if a display string ever has bad LaTeX.
  const formulaHtml = useMemo(
    () => katex.renderToString(eq.display, { throwOnError: false, displayMode: true }),
    [eq.display],
  );

  return (
    <aside className="eqp" aria-label="Equation explorer">
      <div className="eqp__head">work the equation</div>

      <label className="eqp__pick">
        <span className="eqp__pick-label">equation</span>
        <select
          className="eqp__select"
          value={eq.id}
          onChange={(e) => onSelectEquation(e.target.value)}
        >
          {set.equations.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>

      <div className="eqp__formula" dangerouslySetInnerHTML={{ __html: formulaHtml }} />

      <div className="eqp__solvefor">
        <span className="eqp__solvefor-label">solve for</span>
        <div className="eqp__chips">
          {eq.variables.map((v) => (
            <button
              key={v.symbol}
              type="button"
              className={`eqp__chip${v.symbol === unknown ? ' eqp__chip--on' : ''}`}
              onClick={() => onSelectUnknown(v.symbol)}
            >
              {v.label.split(' ').pop()}
            </button>
          ))}
        </div>
      </div>

      <div className="eqp__vars">
        {eq.variables.map((v) => {
          const isUnknown = v.symbol === unknown;
          const canonical = isBase(v.symbol) ? resolved[v.symbol] : aux[v.symbol] ?? v.default;
          const { opts, opt } = optFor(v.symbol, v.unit);

          // A unit <select> when there's a real choice, else a static label.
          const unitNode =
            opts.length > 1 ? (
              <select
                className="eqp__unitsel"
                value={opt.symbol}
                aria-label={`unit for ${v.label}`}
                onChange={(e) => setUnitSel((p) => ({ ...p, [v.symbol]: e.target.value }))}
              >
                {opts.map((o) => (
                  <option key={o.symbol} value={o.symbol}>
                    {o.symbol}
                  </option>
                ))}
              </select>
            ) : (
              <span className="eqp__unit">{v.unit}</span>
            );

          return (
            <div key={v.symbol} className={`eqp__var${isUnknown ? ' eqp__var--unknown' : ''}`}>
              <span className="eqp__var-label">{v.label}</span>
              {isUnknown ? (
                <span className="eqp__solved">
                  {solved.value == null ? (
                    <span className="eqp__nores">no solution</span>
                  ) : (
                    <b>{fmt(fromCanonical(solved.value, opt))}</b>
                  )}
                  {unitNode}
                </span>
              ) : (
                <span className="eqp__input">
                  <input
                    type="number"
                    step={dispStep(v.step, opt)}
                    value={round(fromCanonical(canonical, opt))}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      const canon = toCanonical(n, opt);
                      if (isBase(v.symbol)) onBaseChange(v.symbol, canon);
                      else onAuxChange(v.symbol, canon);
                    }}
                  />
                  {unitNode}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {solved.value == null && solved.reason && (
        <p className="eqp__hint">{solved.reason}</p>
      )}
      <p className="eqp__note">
        Set the knowns; the highlighted unknown is solved and drawn on the left. Tap a unit to
        change it.
      </p>
    </aside>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

/** Looser rounding for editable inputs so typing isn't fought by re-formatting. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The canonical slider step expressed in the chosen display unit. */
function dispStep(step: number, opt: UnitOption): number | 'any' {
  const s = step / opt.factor;
  return s > 0 && Number.isFinite(s) ? s : 'any';
}
