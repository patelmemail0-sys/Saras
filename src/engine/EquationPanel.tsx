/**
 * EquationPanel — the "work the equation" side column for equation-based widgets.
 *
 * Generic + fully controlled: the parent owns the shared state and passes the
 * resolved values down. The student picks an equation, picks which variable is
 * the unknown, types the knowns, and the solved unknown is shown (and, when it's
 * one of the visual's parameters, fed straight back into the picture by the
 * parent). Works for any {@link EquationSet}, not just projectiles.
 */
import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { EquationSet, SolveResult } from './equations.ts';

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
          const value = isBase(v.symbol) ? resolved[v.symbol] : aux[v.symbol] ?? v.default;
          return (
            <div key={v.symbol} className={`eqp__var${isUnknown ? ' eqp__var--unknown' : ''}`}>
              <span className="eqp__var-label">{v.label}</span>
              {isUnknown ? (
                <span className="eqp__solved">
                  {solved.value == null ? (
                    <span className="eqp__nores">no solution</span>
                  ) : (
                    <>
                      <b>{fmt(solved.value)}</b> {v.unit}
                    </>
                  )}
                </span>
              ) : (
                <span className="eqp__input">
                  <input
                    type="number"
                    step={v.step}
                    value={round(value)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      if (isBase(v.symbol)) onBaseChange(v.symbol, n);
                      else onAuxChange(v.symbol, n);
                    }}
                  />
                  <span className="eqp__unit">{v.unit}</span>
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
        Set the knowns; the highlighted unknown is solved and drawn on the left.
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
