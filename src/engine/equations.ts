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

/** Build a per-topic `mk` so each topic owns its own symbol metadata (no global
 * symbol clashes — `m`, `t`, `T` mean different things across topics). */
const makeMk =
  (table: Record<string, Omit<EqVariable, 'symbol'>>) =>
  (syms: string[]): EqVariable[] =>
    syms.map((s) => ({ symbol: s, ...table[s] }));

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

// --- Simple harmonic motion (mass on a spring) -------------------------------
const SHM_VAR: Record<string, Omit<EqVariable, 'symbol'>> = {
  A: { label: 'amplitude A', unit: 'm', min: 0.05, max: 5, step: 0.05, default: 1 },
  k: { label: 'spring constant k', unit: 'N/m', min: 0.5, max: 400, step: 0.5, default: 20 },
  m: { label: 'mass m', unit: 'kg', min: 0.05, max: 20, step: 0.05, default: 1 },
  t: { label: 'time t', unit: 's', min: 0, max: 60, step: 0.02, default: 0 },
  x: { label: 'displacement x', unit: 'm', min: -5, max: 5, step: 0.01, default: 0.5 },
  T: { label: 'period T', unit: 's', min: 0.01, max: 60, step: 0.01, default: 1.4 },
  f: { label: 'frequency f', unit: 'Hz', min: 0.001, max: 50, step: 0.001, default: 0.71 },
  vmax: { label: 'max speed v_max', unit: 'm/s', min: 0, max: 200, step: 0.01, default: 4.47 },
  E: { label: 'energy E', unit: 'J', min: 0, max: 5000, step: 0.01, default: 10 },
};
const shmMk = makeMk(SHM_VAR);

export const SHM_EQUATION_SET: EquationSet = {
  baseParams: ['A', 'k', 'm', 't'],
  equations: [
    {
      id: 'displacement',
      label: 'Displacement',
      display: 'x = A\\cos\\!\\left(\\sqrt{\\tfrac{k}{m}}\\;t\\right)',
      variables: shmMk(['x', 'A', 'k', 'm', 't']),
      residual: (s) => s.x - s.A * Math.cos(Math.sqrt(s.k / s.m) * s.t),
    },
    {
      id: 'period',
      label: 'Period',
      display: 'T = 2\\pi\\sqrt{\\dfrac{m}{k}}',
      variables: shmMk(['T', 'm', 'k']),
      residual: (s) => s.T - 2 * Math.PI * Math.sqrt(s.m / s.k),
    },
    {
      id: 'frequency',
      label: 'Frequency',
      display: 'f = \\dfrac{1}{2\\pi}\\sqrt{\\dfrac{k}{m}}',
      variables: shmMk(['f', 'k', 'm']),
      residual: (s) => s.f - (1 / (2 * Math.PI)) * Math.sqrt(s.k / s.m),
    },
    {
      id: 'max-speed',
      label: 'Max speed',
      display: 'v_{max} = A\\sqrt{\\dfrac{k}{m}}',
      variables: shmMk(['vmax', 'A', 'k', 'm']),
      residual: (s) => s.vmax - s.A * Math.sqrt(s.k / s.m),
    },
    {
      id: 'energy',
      label: 'Total energy',
      display: 'E = \\tfrac{1}{2}\\,k\\,A^{2}',
      variables: shmMk(['E', 'k', 'A']),
      residual: (s) => s.E - 0.5 * s.k * s.A * s.A,
    },
  ],
};

// --- Ohm's law (single-loop resistive circuit) -------------------------------
const CIRCUIT_VAR: Record<string, Omit<EqVariable, 'symbol'>> = {
  V: { label: 'voltage V', unit: 'V', min: 0, max: 240, step: 0.5, default: 12 },
  R: { label: 'resistance R', unit: 'Ω', min: 0.1, max: 2000, step: 0.1, default: 60 },
  I: { label: 'current I', unit: 'A', min: 0, max: 100, step: 0.001, default: 0.2 },
  P: { label: 'power P', unit: 'W', min: 0, max: 10000, step: 0.01, default: 2.4 },
};
const circuitMk = makeMk(CIRCUIT_VAR);

export const CIRCUIT_EQUATION_SET: EquationSet = {
  baseParams: ['V', 'R'],
  equations: [
    {
      id: 'ohm',
      label: "Ohm's law",
      display: 'V = I\\,R',
      variables: circuitMk(['I', 'V', 'R']),
      residual: (s) => s.V - s.I * s.R,
    },
    {
      id: 'power',
      label: 'Power',
      display: 'P = \\dfrac{V^{2}}{R}',
      variables: circuitMk(['P', 'V', 'R']),
      residual: (s) => s.P - (s.V * s.V) / s.R,
    },
  ],
};

// --- Block on a frictional inclined plane ------------------------------------
const INCLINE_VAR: Record<string, Omit<EqVariable, 'symbol'>> = {
  theta: { label: 'angle θ', unit: '°', min: 0, max: 90, step: 1, default: 30 },
  mu: { label: 'friction μ', unit: '', min: 0, max: 2, step: 0.01, default: 0.3 },
  m: { label: 'mass m', unit: 'kg', min: 0.1, max: 50, step: 0.1, default: 2 },
  g: { label: 'gravity g', unit: 'm/s²', min: 0.1, max: 100, step: 0.1, default: 9.8 },
  t: { label: 'time t', unit: 's', min: 0, max: 30, step: 0.02, default: 0 },
  a: { label: 'acceleration a', unit: 'm/s²', min: -100, max: 100, step: 0.01, default: 2 },
  N: { label: 'normal force N', unit: 'N', min: 0, max: 5000, step: 0.1, default: 17 },
  fr: { label: 'friction force f', unit: 'N', min: 0, max: 5000, step: 0.1, default: 5 },
  Fp: { label: 'gravity along slope F∥', unit: 'N', min: 0, max: 5000, step: 0.1, default: 10 },
};
const inclineMk = makeMk(INCLINE_VAR);

export const INCLINE_EQUATION_SET: EquationSet = {
  baseParams: ['theta', 'mu', 'm', 'g', 't'],
  equations: [
    {
      id: 'accel',
      label: 'Acceleration',
      display: 'a = g\\,(\\sin\\theta - \\mu\\cos\\theta)',
      variables: inclineMk(['a', 'g', 'theta', 'mu']),
      residual: (s) => s.a - s.g * (Math.sin(rad(s.theta)) - s.mu * Math.cos(rad(s.theta))),
    },
    {
      id: 'normal',
      label: 'Normal force',
      display: 'N = m\\,g\\,\\cos\\theta',
      variables: inclineMk(['N', 'm', 'g', 'theta']),
      residual: (s) => s.N - s.m * s.g * Math.cos(rad(s.theta)),
    },
    {
      id: 'friction',
      label: 'Friction force',
      display: 'f = \\mu\\,m\\,g\\,\\cos\\theta',
      variables: inclineMk(['fr', 'mu', 'm', 'g', 'theta']),
      residual: (s) => s.fr - s.mu * s.m * s.g * Math.cos(rad(s.theta)),
    },
    {
      id: 'gravity-parallel',
      label: 'Gravity along slope',
      display: 'F_\\parallel = m\\,g\\,\\sin\\theta',
      variables: inclineMk(['Fp', 'm', 'g', 'theta']),
      residual: (s) => s.Fp - s.m * s.g * Math.sin(rad(s.theta)),
    },
  ],
};

// --- Uniform circular motion -------------------------------------------------
const CIRCULAR_VAR: Record<string, Omit<EqVariable, 'symbol'>> = {
  r: { label: 'radius r', unit: 'm', min: 0.1, max: 100, step: 0.1, default: 5 },
  v: { label: 'speed v', unit: 'm/s', min: 0.1, max: 300, step: 0.1, default: 10 },
  t: { label: 'time t', unit: 's', min: 0, max: 120, step: 0.02, default: 0 },
  omega: { label: 'angular velocity ω', unit: 'rad/s', min: 0.001, max: 200, step: 0.001, default: 2 },
  ac: { label: 'centripetal accel a_c', unit: 'm/s²', min: 0, max: 5000, step: 0.01, default: 20 },
  T: { label: 'period T', unit: 's', min: 0.01, max: 600, step: 0.01, default: 3.14 },
};
const circularMk = makeMk(CIRCULAR_VAR);

export const CIRCULAR_EQUATION_SET: EquationSet = {
  baseParams: ['r', 'v', 't'],
  equations: [
    {
      id: 'angular-velocity',
      label: 'Angular velocity',
      display: '\\omega = \\dfrac{v}{r}',
      variables: circularMk(['omega', 'v', 'r']),
      residual: (s) => s.omega - s.v / s.r,
    },
    {
      id: 'centripetal',
      label: 'Centripetal acceleration',
      display: 'a_c = \\dfrac{v^{2}}{r}',
      variables: circularMk(['ac', 'v', 'r']),
      residual: (s) => s.ac - (s.v * s.v) / s.r,
    },
    {
      id: 'period',
      label: 'Period',
      display: 'T = \\dfrac{2\\pi r}{v}',
      variables: circularMk(['T', 'r', 'v']),
      residual: (s) => s.T - (2 * Math.PI * s.r) / s.v,
    },
  ],
};

// --- Two-body orbit (natural units, G = 1) -----------------------------------
const ORBIT_VAR: Record<string, Omit<EqVariable, 'symbol'>> = {
  M: { label: 'central mass M', unit: '', min: 0.1, max: 8, step: 0.1, default: 1 },
  r: { label: 'launch distance r', unit: '', min: 0.2, max: 8, step: 0.1, default: 1 },
  v: { label: 'launch speed v', unit: '', min: 0.05, max: 4, step: 0.01, default: 1.1 },
  t: { label: 'time t', unit: '', min: 0, max: 400, step: 0.1, default: 0 },
  vc: { label: 'circular speed v_c', unit: '', min: 0, max: 20, step: 0.001, default: 1 },
  vesc: { label: 'escape speed v_esc', unit: '', min: 0, max: 40, step: 0.001, default: 1.41 },
  a: { label: 'semi-major axis a', unit: '', min: 0.05, max: 80, step: 0.01, default: 1.4 },
  e: { label: 'eccentricity e', unit: '', min: 0, max: 4, step: 0.001, default: 0.21 },
  T: { label: 'period T', unit: '', min: 0.01, max: 4000, step: 0.01, default: 10.4 },
};
const orbitMk = makeMk(ORBIT_VAR);

/** Orbit relations, in the same natural units (G = 1) as orbitMechanics. */
export const ORBIT_EQUATION_SET: EquationSet = {
  baseParams: ['M', 'r', 'v', 't'],
  equations: [
    {
      id: 'eccentricity',
      label: 'Eccentricity',
      display: 'e = \\left|\\dfrac{r\\,v^{2}}{M} - 1\\right|',
      variables: orbitMk(['e', 'r', 'v', 'M']),
      residual: (s) => s.e - Math.abs((s.r * s.v * s.v) / s.M - 1),
    },
    {
      id: 'circular-speed',
      label: 'Circular speed',
      display: 'v_c = \\sqrt{\\dfrac{M}{r}}',
      variables: orbitMk(['vc', 'M', 'r']),
      residual: (s) => s.vc - Math.sqrt(s.M / s.r),
    },
    {
      id: 'escape-speed',
      label: 'Escape speed',
      display: 'v_{esc} = \\sqrt{\\dfrac{2M}{r}}',
      variables: orbitMk(['vesc', 'M', 'r']),
      residual: (s) => s.vesc - Math.sqrt((2 * s.M) / s.r),
    },
    {
      id: 'semi-major',
      label: 'Semi-major axis',
      display: 'a = \\left(\\dfrac{2}{r} - \\dfrac{v^{2}}{M}\\right)^{-1}',
      variables: orbitMk(['a', 'r', 'v', 'M']),
      residual: (s) => s.a - 1 / (2 / s.r - (s.v * s.v) / s.M),
    },
    {
      id: 'period',
      label: 'Orbital period',
      display: 'T = 2\\pi\\sqrt{\\dfrac{a^{3}}{M}},\\quad a = \\left(\\dfrac{2}{r} - \\dfrac{v^{2}}{M}\\right)^{-1}',
      variables: orbitMk(['T', 'M', 'r', 'v']),
      residual: (s) => {
        const a = 1 / (2 / s.r - (s.v * s.v) / s.M);
        return s.T - 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / s.M);
      },
    },
  ],
};

// --- Thin-lens optics --------------------------------------------------------
const RAY_VAR: Record<string, Omit<EqVariable, 'symbol'>> = {
  f: { label: 'focal length f', unit: 'm', min: -2, max: 2, step: 0.01, default: 0.1 },
  do: { label: 'object distance d_o', unit: 'm', min: 0.02, max: 4, step: 0.01, default: 0.3 },
  ho: { label: 'object height h_o', unit: 'm', min: 0.005, max: 1, step: 0.005, default: 0.05 },
  di: { label: 'image distance d_i', unit: 'm', min: -10, max: 10, step: 0.01, default: 0.15 },
  mag: { label: 'magnification m', unit: '', min: -20, max: 20, step: 0.01, default: -0.5 },
  hi: { label: 'image height h_i', unit: 'm', min: -10, max: 10, step: 0.005, default: -0.025 },
};
const rayMk = makeMk(RAY_VAR);

/** Thin-lens relations, consistent with lensOptics (validate.ts). */
export const RAY_EQUATION_SET: EquationSet = {
  baseParams: ['f', 'do', 'ho'],
  equations: [
    {
      id: 'lens-equation',
      label: 'Thin-lens equation',
      display: '\\dfrac{1}{f} = \\dfrac{1}{d_o} + \\dfrac{1}{d_i}',
      variables: rayMk(['di', 'f', 'do']),
      residual: (s) => 1 / s.f - (1 / s.do + 1 / s.di),
    },
    {
      id: 'magnification',
      label: 'Magnification',
      display: 'm = -\\dfrac{d_i}{d_o} = -\\dfrac{f}{d_o - f}',
      variables: rayMk(['mag', 'f', 'do']),
      residual: (s) => s.mag + s.f / (s.do - s.f),
    },
    {
      id: 'image-height',
      label: 'Image height',
      display: 'h_i = m\\,h_o = -\\dfrac{f\\,h_o}{d_o - f}',
      variables: rayMk(['hi', 'f', 'do', 'ho']),
      residual: (s) => s.hi + (s.f * s.ho) / (s.do - s.f),
    },
  ],
};

/** The equation set for a spec type, or null if the widget isn't equation-based. */
export function equationsForSpecType(type: string): EquationSet | null {
  switch (type) {
    case 'projectile':
      return PROJECTILE_EQUATION_SET;
    case 'wave-oscillator':
      return SHM_EQUATION_SET;
    case 'circuit-diagram':
      return CIRCUIT_EQUATION_SET;
    case 'free-body-diagram':
      return INCLINE_EQUATION_SET;
    case 'circular-motion':
      return CIRCULAR_EQUATION_SET;
    case 'orbit-sim':
      return ORBIT_EQUATION_SET;
    case 'ray-diagram':
      return RAY_EQUATION_SET;
    default:
      return null;
  }
}
