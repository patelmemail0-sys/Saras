/**
 * useEquationPanel — the shared "work the equation" wiring behind every
 * equation-based widget (projectile, SHM, circuit, incline, circular motion).
 *
 * It owns the equation-panel state (which equation, which variable is the
 * unknown, the typed-in aux knowns), solves the chosen unknown from the rest,
 * and hands back a `resolved` map: the widget's base parameters with the solved
 * value substituted in when the unknown is itself one of them. The widget reads
 * `resolved` to draw the picture and spreads `panelProps` into <EquationPanel/>.
 *
 * Generic on the {@link EquationSet}, so a new topic gets the whole side panel —
 * pick an equation, solve for any variable, feed it back into the visual — for
 * free, with no per-widget solver code.
 */
import { useState } from 'react';
import { solveFor, type Equation, type EquationSet, type SolveResult } from './equations.ts';

/** The single derived (non-base) variable of an equation — its natural output. */
function auxOf(set: EquationSet, eq: Equation): string {
  return eq.variables.find((v) => !set.baseParams.includes(v.symbol))!.symbol;
}

export interface EquationPanelState {
  /** Currently selected equation id. */
  eqId: string;
  /** Symbol of the variable currently being solved for. */
  unknown: string;
  /** Solved value of the unknown (or null with a reason). */
  solved: SolveResult;
  /** Base values with the solved value substituted when the unknown is a base. */
  resolved: Record<string, number>;
  /** Props to spread straight into <EquationPanel/>. */
  panelProps: {
    set: EquationSet;
    eqId: string;
    unknown: string;
    resolved: Record<string, number>;
    aux: Record<string, number>;
    solved: SolveResult;
    onSelectEquation: (id: string) => void;
    onSelectUnknown: (sym: string) => void;
    onBaseChange: (sym: string, val: number) => void;
    onAuxChange: (sym: string, val: number) => void;
  };
  /** Imperatively point the panel at an equation + unknown (used by word problems). */
  setSolveTarget: (eqId: string, unknown: string) => void;
}

/**
 * @param set    the topic's equation set
 * @param base   the widget's current base parameters keyed by symbol
 * @param setBase  apply a change to a single base parameter (drives the visual)
 * @param onInteract  optional side effect on any panel interaction (e.g. pause)
 */
export function useEquationPanel(
  set: EquationSet,
  base: Record<string, number>,
  setBase: (sym: string, val: number) => void,
  onInteract?: () => void,
): EquationPanelState {
  const isBase = (sym: string) => set.baseParams.includes(sym);

  const [eqId, setEqId] = useState(set.equations[0].id);
  const [unknown, setUnknown] = useState(() => auxOf(set, set.equations[0]));
  const [aux, setAux] = useState<Record<string, number>>({});

  const eq = set.equations.find((e) => e.id === eqId) ?? set.equations[0];

  // Solve the chosen unknown from the equation's other variables.
  const knowns: Record<string, number> = {};
  for (const v of eq.variables) {
    if (v.symbol === unknown) continue;
    knowns[v.symbol] = isBase(v.symbol) ? base[v.symbol] : aux[v.symbol] ?? v.default;
  }
  const guessVar = eq.variables.find((v) => v.symbol === unknown);
  const guess = isBase(unknown) ? base[unknown] : aux[unknown] ?? guessVar?.default;
  const solved = solveFor(eq, unknown, knowns, guess);

  // When the unknown is a launch/visual parameter, its solved value drives the picture.
  const resolved: Record<string, number> = { ...base };
  if (isBase(unknown) && solved.value != null) resolved[unknown] = solved.value;

  const baseKnowns = (e: Equation): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const v of e.variables) if (isBase(v.symbol)) out[v.symbol] = base[v.symbol];
    return out;
  };

  function selectEquation(id: string) {
    const e = set.equations.find((x) => x.id === id);
    if (!e) return;
    const a = auxOf(set, e);
    const derived = solveFor(e, a, baseKnowns(e), aux[a]).value;
    setAux((p) => ({ ...p, [a]: derived ?? e.variables.find((v) => v.symbol === a)!.default }));
    setUnknown(a); // default to solving the equation's natural output
    setEqId(id);
    onInteract?.();
  }

  function selectUnknown(sym: string) {
    const a = auxOf(set, eq);
    // When the aux variable becomes a known, seed it to its current solved value
    // so switching to solve a base param starts from where the picture already is.
    if (sym !== a) {
      const derived = solveFor(eq, a, baseKnowns(eq), aux[a]).value;
      if (derived != null) setAux((p) => ({ ...p, [a]: derived }));
    }
    setUnknown(sym);
    onInteract?.();
  }

  function setSolveTarget(id: string, sym: string) {
    if (set.equations.some((e) => e.id === id)) setEqId(id);
    setUnknown(sym);
  }

  return {
    eqId,
    unknown,
    solved,
    resolved,
    setSolveTarget,
    panelProps: {
      set,
      eqId,
      unknown,
      resolved,
      aux,
      solved,
      onSelectEquation: selectEquation,
      onSelectUnknown: selectUnknown,
      onBaseChange: setBase,
      onAuxChange: (sym, val) => setAux((p) => ({ ...p, [sym]: val })),
    },
  };
}
