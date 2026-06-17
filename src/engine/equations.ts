/**
 * Equation engine — the data model + numeric solver behind the "work the equation"
 * side panel. Generic on purpose: any equation-based topic defines an
 * {@link EquationSet}, and the same solver lets a student set the known variables
 * and have whatever is left over solved for and fed back into the visual.
 *
 * The relation is expressed as a residual r(vars) = 0 (not a one-way formula), so
 * we can solve for ANY variable by 1-D root finding — no per-variable algebraic
 * rearranging, and it stays honest about cases with no solution in range.
 */

/** One variable in an equation: its label/unit and the solver+slider domain. */
export interface EqVariable {
  /** Symbol used as the scope key, e.g. "v0", "theta", "R". */
  symbol: string;
  label: string;
  unit: string;
  /** Solver search domain (also used for slider/input bounds). */
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface Equation {
  id: string;
  label: string;
  /** LaTeX source for the relation, rendered with KaTeX, e.g. "R = v_0\\cos\\theta\\,t_f". */
  display: string;
  /** All variables appearing in the relation. The first is the natural output. */
  variables: EqVariable[];
  /**
   * Residual of the relation at a given assignment; zero exactly on the relation.
   * Angles are passed in the variable's own unit (degrees here) and converted
   * inside. Must return a finite number for valid inputs.
   */
  residual: (scope: Record<string, number>) => number;
}

export interface EquationSet {
  /**
   * Symbols that map onto the visual's own state and should drive it when solved
   * (e.g. the projectile's v₀/θ/g/h/t). Everything else is a derived/aux variable.
   */
  baseParams: string[];
  equations: Equation[];
}

export interface SolveResult {
  /** Solved value, or null if no real solution exists in the variable's domain. */
  value: number | null;
  /** User-safe explanation when value is null. */
  reason?: string;
}

const TOL = 1e-9;

/**
 * Solve `eq` for `unknown`, holding every other variable at the value in `knowns`.
 * Scans the unknown's domain for sign changes in the residual and bisects the
 * bracket nearest `guess` (so dragging stays continuous across multi-root cases
 * like the two launch angles that hit a given range).
 */
export function solveFor(
  eq: Equation,
  unknown: string,
  knowns: Record<string, number>,
  guess?: number,
): SolveResult {
  const v = eq.variables.find((x) => x.symbol === unknown);
  if (!v) return { value: null, reason: `${unknown} is not in this equation.` };

  const f = (x: number): number => {
    const r = eq.residual({ ...knowns, [unknown]: x });
    return Number.isFinite(r) ? r : NaN;
  };

  const { min, max } = v;
  const N = 400;
  const brackets: Array<[number, number]> = [];
  let prevX = min;
  let prevF = f(min);
  if (prevF === 0) brackets.push([min, min]);
  for (let i = 1; i <= N; i++) {
    const x = min + ((max - min) * i) / N;
    const fx = f(x);
    if (Number.isFinite(prevF) && Number.isFinite(fx)) {
      if (fx === 0) brackets.push([x, x]);
      else if (prevF * fx < 0) brackets.push([prevX, x]);
    }
    prevX = x;
    prevF = fx;
  }

  if (brackets.length === 0) {
    return { value: null, reason: 'No real solution in the valid range for these values.' };
  }

  // Prefer the root closest to the current value, for continuity while dragging.
  const mid = (b: [number, number]) => (b[0] + b[1]) / 2;
  const pick =
    guess == null
      ? brackets[0]
      : brackets.reduce((best, b) =>
          Math.abs(mid(b) - guess) < Math.abs(mid(best) - guess) ? b : best,
        );

  let [lo, hi] = pick;
  if (lo === hi) return { value: lo };
  let flo = f(lo);
  for (let i = 0; i < 100; i++) {
    const m = (lo + hi) / 2;
    const fm = f(m);
    if (!Number.isFinite(fm)) break;
    if (Math.abs(fm) < TOL || hi - lo < TOL) return { value: m };
    if (flo * fm < 0) hi = m;
    else {
      lo = m;
      flo = fm;
    }
  }
  return { value: (lo + hi) / 2 };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

// Shared variable metadata so each equation just lists the symbols it uses.
const VAR: Record<string, Omit<EqVariable, 'symbol'>> = {
  v0: { label: 'launch speed v₀', unit: 'm/s', min: 0.1, max: 120, step: 0.5, default: 20 },
  theta: { label: 'angle θ', unit: '°', min: 0, max: 90, step: 1, default: 45 },
  g: { label: 'gravity g', unit: 'm/s²', min: 0.1, max: 100, step: 0.1, default: 9.8 },
  h: { label: 'launch height h', unit: 'm', min: 0, max: 200, step: 0.5, default: 0 },
  t: { label: 'time t', unit: 's', min: 0, max: 60, step: 0.05, default: 0.5 },
  R: { label: 'range R', unit: 'm', min: 0, max: 5000, step: 0.1, default: 40 },
  H: { label: 'max height H', unit: 'm', min: 0, max: 5000, step: 0.1, default: 10 },
  T: { label: 'flight time t_f', unit: 's', min: 0, max: 120, step: 0.01, default: 2 },
  x: { label: 'horizontal x', unit: 'm', min: 0, max: 5000, step: 0.1, default: 20 },
  y: { label: 'height y', unit: 'm', min: -500, max: 5000, step: 0.1, default: 5 },
};

const mk = (syms: string[]): EqVariable[] => syms.map((s) => ({ symbol: s, ...VAR[s] }));

/** Time to return to ground (y = 0) from the other variables — used by range/time. */
const flightTime = (s: Record<string, number>): number => {
  const vy = s.v0 * Math.sin(rad(s.theta));
  return (vy + Math.sqrt(vy * vy + 2 * s.g * s.h)) / s.g;
};

/**
 * Projectile equation set. Variable-for-variable consistent with
 * projectileKinematics (validate.ts), so solving here and drawing there agree.
 */
export const PROJECTILE_EQUATION_SET: EquationSet = {
  baseParams: ['v0', 'theta', 'g', 'h', 't'],
  equations: [
    {
      id: 'range',
      label: 'Range',
      display: 'R = v_0\\cos\\theta \\,\\cdot\\, t_f',
      variables: mk(['R', 'v0', 'theta', 'g', 'h']),
      residual: (s) => s.R - s.v0 * Math.cos(rad(s.theta)) * flightTime(s),
    },
    {
      id: 'max-height',
      label: 'Max height',
      display: 'H = h + \\dfrac{v_0^{2}\\sin^{2}\\theta}{2g}',
      variables: mk(['H', 'v0', 'theta', 'g', 'h']),
      residual: (s) => s.H - (s.h + (s.v0 * Math.sin(rad(s.theta))) ** 2 / (2 * s.g)),
    },
    {
      id: 'flight-time',
      label: 'Flight time',
      display: 't_f = \\dfrac{v_0\\sin\\theta + \\sqrt{\\,v_0^{2}\\sin^{2}\\theta + 2gh\\,}}{g}',
      variables: mk(['T', 'v0', 'theta', 'g', 'h']),
      residual: (s) => s.T - flightTime(s),
    },
    {
      id: 'pos-x',
      label: 'Horizontal position',
      display: 'x = v_0\\cos\\theta \\,\\cdot\\, t',
      variables: mk(['x', 'v0', 'theta', 't']),
      residual: (s) => s.x - s.v0 * Math.cos(rad(s.theta)) * s.t,
    },
    {
      id: 'pos-y',
      label: 'Height at time t',
      display: 'y = h + v_0\\sin\\theta \\,\\cdot\\, t - \\tfrac{1}{2}\\,g\\,t^{2}',
      variables: mk(['y', 'v0', 'theta', 'g', 'h', 't']),
      residual: (s) =>
        s.y - (s.h + s.v0 * Math.sin(rad(s.theta)) * s.t - 0.5 * s.g * s.t * s.t),
    },
  ],
};

/** The equation set for a spec type, or null if the widget isn't equation-based. */
export function equationsForSpecType(type: string): EquationSet | null {
  return type === 'projectile' ? PROJECTILE_EQUATION_SET : null;
}
