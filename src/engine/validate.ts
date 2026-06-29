/**
 * Deterministic correctness gate (docs/DESIGN.md: "a deterministic numeric/unit
 * check is the binding correctness gate"). It runs BEFORE any render. If a spec
 * doesn't pass, the product shows the honest fallback rather than a guessed or
 * possibly-wrong visual.
 *
 * For function-grapher this means: the expression parses, references only `x`
 * plus declared parameters (and known constants), and evaluates to finite real
 * numbers across most of the domain at the default parameter values.
 */
import { parse, type MathNode } from 'mathjs';
import type {
  FunctionGrapherSpec,
  ProjectileSpec,
  ShmSpec,
  CircuitSpec,
  InclineSpec,
  CircularSpec,
  OrbitSpec,
  RayDiagramSpec,
} from './spec.ts';

/** Constants mathjs exposes as symbols that we allow without declaration. */
const ALLOWED_CONSTANTS = new Set(['pi', 'e', 'tau', 'phi', 'Infinity']);

export interface ValidationResult {
  valid: boolean;
  /** Present when invalid — a short, user-safe reason. */
  reason?: string;
  /** A compiled evaluator, present when valid, reused by the renderer. */
  evaluate?: (x: number, params: Record<string, number>) => number;
}

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Validate a function-grapher spec. Pure, deterministic, no LLM. */
export function validateFunctionGrapher(spec: FunctionGrapherSpec): ValidationResult {
  if (!spec.expression?.trim()) return { valid: false, reason: 'Empty expression.' };

  // Domain sanity.
  const { min, max } = spec.domain ?? {};
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return { valid: false, reason: 'Invalid domain.' };
  }

  // Parameter names must be valid identifiers and unique.
  const paramNames = new Set<string>();
  for (const p of spec.parameters ?? []) {
    if (!IDENT_RE.test(p.name)) return { valid: false, reason: `Bad parameter name "${p.name}".` };
    if (p.name === 'x') return { valid: false, reason: 'A parameter cannot be named x.' };
    if (paramNames.has(p.name)) return { valid: false, reason: `Duplicate parameter "${p.name}".` };
    if (!Number.isFinite(p.default) || !Number.isFinite(p.min) || !Number.isFinite(p.max))
      return { valid: false, reason: `Parameter "${p.name}" has non-finite bounds.` };
    paramNames.add(p.name);
  }

  // Parse and check that every free symbol is x, a parameter, or a constant.
  let node: MathNode;
  try {
    node = parse(spec.expression);
  } catch {
    return { valid: false, reason: 'Expression does not parse.' };
  }
  const allowed = new Set<string>(['x', ...paramNames, ...ALLOWED_CONSTANTS]);
  let badSymbol: string | null = null;
  node.filter((n) => n.type === 'SymbolNode').forEach((n) => {
    // mathjs marks function-call callees as SymbolNodes too; those are fine —
    // only flag a symbol that mathjs can't resolve as a function and we didn't allow.
    const name = (n as unknown as { name: string }).name;
    if (allowed.has(name)) return;
    // Treat anything mathjs knows (sin, cos, log, …) as fine; unknown bare
    // symbols used as values are the failure case.
    try {
      // If it evaluates standalone, it's a known constant/function reference.
      parse(name).evaluate();
    } catch {
      if (!badSymbol) badSymbol = name;
    }
  });
  if (badSymbol) {
    return { valid: false, reason: `Unknown symbol "${badSymbol}" in expression.` };
  }

  // Compile and numerically probe across the domain at default params.
  let compiled: { evaluate: (scope: Record<string, number>) => unknown };
  try {
    compiled = node.compile();
  } catch {
    return { valid: false, reason: 'Expression failed to compile.' };
  }

  const defaults: Record<string, number> = {};
  for (const p of spec.parameters ?? []) defaults[p.name] = p.default;

  const SAMPLES = 80;
  let finite = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const x = min + ((max - min) * i) / (SAMPLES - 1);
    let y: unknown;
    try {
      y = compiled.evaluate({ ...defaults, x });
    } catch {
      continue;
    }
    if (typeof y === 'number' && Number.isFinite(y)) finite++;
  }
  // Allow asymptotes/holes, but most of the domain must be real and finite.
  if (finite / SAMPLES < 0.6) {
    return { valid: false, reason: 'Expression is not a real, finite function over its domain.' };
  }

  const evaluate = (x: number, params: Record<string, number>): number => {
    try {
      const y = compiled.evaluate({ ...defaults, ...params, x });
      return typeof y === 'number' ? y : NaN;
    } catch {
      return NaN;
    }
  };

  return { valid: true, evaluate };
}

/**
 * Closed-form projectile kinematics — the single source of truth shared by the
 * correctness gate (validateProjectile) and the renderer (ProjectileSim), so the
 * verified physics and the drawn physics can never drift apart.
 *
 * Vertical plane, constant gravity, no drag:
 *   x(t) = vx·t,   y(t) = y₀ + vy₀·t − ½·g·t²
 */
export interface ProjectileKinematics {
  /** Horizontal velocity component vx = v₀·cos θ (m/s). */
  vx: number;
  /** Initial vertical velocity vy₀ = v₀·sin θ (m/s). */
  vy0: number;
  /** Time from launch until it returns to ground level y = 0 (s). */
  flightTime: number;
  /** Horizontal distance at landing (m). */
  range: number;
  /** Peak height above the ground (m). */
  maxHeight: number;
  /** Time of the peak (s). */
  apexTime: number;
  /** Position (m) at time t (s). */
  at: (t: number) => { x: number; y: number };
}

export function projectileKinematics(spec: ProjectileSpec): ProjectileKinematics {
  const rad = (spec.angle * Math.PI) / 180;
  const vx = spec.speed * Math.cos(rad);
  const vy0 = spec.speed * Math.sin(rad);
  const g = spec.gravity;
  const y0 = spec.height;
  // Larger root of y(t) = 0 — the landing time, accounting for launch height.
  const flightTime = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * y0)) / g;
  return {
    vx,
    vy0,
    flightTime,
    range: vx * flightTime,
    maxHeight: y0 + (vy0 * vy0) / (2 * g),
    apexTime: Math.max(0, vy0 / g),
    at: (t: number) => ({ x: vx * t, y: y0 + vy0 * t - 0.5 * g * t * t }),
  };
}

/**
 * Deterministic correctness gate for a projectile spec. Checks the inputs are
 * physically meaningful and the derived trajectory is finite before any render.
 */
export function validateProjectile(spec: ProjectileSpec): ValidationResult {
  if (!Number.isFinite(spec.speed) || spec.speed <= 0)
    return { valid: false, reason: 'Initial speed must be a positive number.' };
  if (!Number.isFinite(spec.angle) || spec.angle < 0 || spec.angle > 90)
    return { valid: false, reason: 'Launch angle must be between 0° and 90°.' };
  if (!Number.isFinite(spec.gravity) || spec.gravity <= 0)
    return { valid: false, reason: 'Gravity must be a positive number.' };
  if (!Number.isFinite(spec.height) || spec.height < 0)
    return { valid: false, reason: 'Launch height cannot be negative.' };

  const k = projectileKinematics(spec);
  if (
    !Number.isFinite(k.flightTime) ||
    k.flightTime <= 0 ||
    !Number.isFinite(k.range) ||
    !Number.isFinite(k.maxHeight)
  ) {
    return { valid: false, reason: 'Trajectory is not physically realizable.' };
  }
  return { valid: true };
}

/**
 * Closed-form simple-harmonic-motion kinematics for a mass on a spring — the
 * single source of truth shared by validateShm and the ShmSim renderer.
 *
 *   x(t) = A·cos(ωt),  ω = √(k/m),  v = −Aω·sin(ωt),  a = −Aω²·cos(ωt)
 */
export interface ShmKinematics {
  /** Angular frequency ω = √(k/m) (rad/s). */
  omega: number;
  /** Period T = 2π/ω (s). */
  period: number;
  /** Frequency f = 1/T (Hz). */
  frequency: number;
  /** Peak speed Aω (m/s). */
  maxSpeed: number;
  /** Peak acceleration Aω² (m/s²). */
  maxAccel: number;
  /** Total mechanical energy ½kA² (J). */
  energy: number;
  /** Displacement, velocity and acceleration at time t. */
  at: (t: number) => { x: number; v: number; a: number };
}

export function shmKinematics(spec: ShmSpec): ShmKinematics {
  const omega = Math.sqrt(spec.springConstant / spec.mass);
  const A = spec.amplitude;
  return {
    omega,
    period: (2 * Math.PI) / omega,
    frequency: omega / (2 * Math.PI),
    maxSpeed: A * omega,
    maxAccel: A * omega * omega,
    energy: 0.5 * spec.springConstant * A * A,
    at: (t: number) => ({
      x: A * Math.cos(omega * t),
      v: -A * omega * Math.sin(omega * t),
      a: -A * omega * omega * Math.cos(omega * t),
    }),
  };
}

/** Correctness gate for an SHM spec — positive mass, stiffness and amplitude. */
export function validateShm(spec: ShmSpec): ValidationResult {
  if (!Number.isFinite(spec.mass) || spec.mass <= 0)
    return { valid: false, reason: 'Mass must be a positive number.' };
  if (!Number.isFinite(spec.springConstant) || spec.springConstant <= 0)
    return { valid: false, reason: 'Spring constant must be a positive number.' };
  if (!Number.isFinite(spec.amplitude) || spec.amplitude <= 0)
    return { valid: false, reason: 'Amplitude must be a positive number.' };
  const k = shmKinematics(spec);
  if (!Number.isFinite(k.omega) || k.omega <= 0 || !Number.isFinite(k.period))
    return { valid: false, reason: 'Oscillation is not physically realizable.' };
  return { valid: true };
}

/** Steady-state values of a single-loop resistive circuit (Ohm's law). */
export interface CircuitState {
  /** Current I = V/R (A). */
  current: number;
  /** Power P = V·I = V²/R (W). */
  power: number;
}

export function circuitState(spec: CircuitSpec): CircuitState {
  const current = spec.voltage / spec.resistance;
  return { current, power: spec.voltage * current };
}

/** Correctness gate for a circuit spec — positive voltage and resistance. */
export function validateCircuit(spec: CircuitSpec): ValidationResult {
  if (!Number.isFinite(spec.voltage) || spec.voltage <= 0)
    return { valid: false, reason: 'Voltage must be a positive number.' };
  if (!Number.isFinite(spec.resistance) || spec.resistance <= 0)
    return { valid: false, reason: 'Resistance must be a positive number.' };
  const s = circuitState(spec);
  if (!Number.isFinite(s.current) || !Number.isFinite(s.power))
    return { valid: false, reason: 'Circuit is not physically realizable.' };
  return { valid: true };
}

/**
 * Statics + dynamics of a block on a frictional incline — the source of truth
 * shared by validateIncline and the InclineSim renderer.
 *
 *   N = mg·cos θ,   f_max = μN,   F∥ = mg·sin θ
 *   The block slides only when F∥ > f_max; then a = g(sin θ − μ cos θ).
 */
export interface InclineState {
  /** Normal force N = mg·cos θ (N). */
  normal: number;
  /** Gravity component along the slope F∥ = mg·sin θ (N). */
  gravityParallel: number;
  /** Friction force opposing motion (N) — capped at μN, or holding it static. */
  friction: number;
  /** Down-slope acceleration (m/s²); 0 when static friction holds the block. */
  accel: number;
  /** True when the block slides (F∥ exceeds maximum static friction). */
  sliding: boolean;
}

export function inclineState(spec: InclineSpec): InclineState {
  const th = (spec.angle * Math.PI) / 180;
  const normal = spec.mass * spec.gravity * Math.cos(th);
  const gravityParallel = spec.mass * spec.gravity * Math.sin(th);
  const maxStatic = spec.friction * normal;
  const sliding = gravityParallel > maxStatic;
  return {
    normal,
    gravityParallel,
    // Kinetic friction when sliding; otherwise friction matches the pull (≤ μN).
    friction: sliding ? maxStatic : gravityParallel,
    accel: sliding ? spec.gravity * (Math.sin(th) - spec.friction * Math.cos(th)) : 0,
    sliding,
  };
}

/** Correctness gate for an inclined-plane spec. */
export function validateIncline(spec: InclineSpec): ValidationResult {
  if (!Number.isFinite(spec.angle) || spec.angle < 0 || spec.angle > 90)
    return { valid: false, reason: 'Incline angle must be between 0° and 90°.' };
  if (!Number.isFinite(spec.mass) || spec.mass <= 0)
    return { valid: false, reason: 'Mass must be a positive number.' };
  if (!Number.isFinite(spec.friction) || spec.friction < 0)
    return { valid: false, reason: 'Friction coefficient cannot be negative.' };
  if (!Number.isFinite(spec.gravity) || spec.gravity <= 0)
    return { valid: false, reason: 'Gravity must be a positive number.' };
  const s = inclineState(spec);
  if (!Number.isFinite(s.normal) || !Number.isFinite(s.accel))
    return { valid: false, reason: 'Force balance is not physically realizable.' };
  return { valid: true };
}

/**
 * Uniform circular motion — the source of truth shared by validateCircular and
 * the CircularSim renderer. ω = v/r, centripetal a = v²/r, period T = 2πr/v.
 */
export interface CircularKinematics {
  /** Angular velocity ω = v/r (rad/s). */
  omega: number;
  /** Centripetal acceleration a = v²/r (m/s²). */
  centripetal: number;
  /** Period T = 2πr/v (s). */
  period: number;
  /** Angle swept (rad) at time t. */
  angleAt: (t: number) => number;
}

export function circularKinematics(spec: CircularSpec): CircularKinematics {
  const omega = spec.speed / spec.radius;
  return {
    omega,
    centripetal: (spec.speed * spec.speed) / spec.radius,
    period: (2 * Math.PI * spec.radius) / spec.speed,
    angleAt: (t: number) => omega * t,
  };
}

/** Correctness gate for a uniform-circular-motion spec. */
export function validateCircular(spec: CircularSpec): ValidationResult {
  if (!Number.isFinite(spec.radius) || spec.radius <= 0)
    return { valid: false, reason: 'Radius must be a positive number.' };
  if (!Number.isFinite(spec.speed) || spec.speed <= 0)
    return { valid: false, reason: 'Speed must be a positive number.' };
  const k = circularKinematics(spec);
  if (!Number.isFinite(k.omega) || k.omega <= 0 || !Number.isFinite(k.period))
    return { valid: false, reason: 'Circular motion is not physically realizable.' };
  return { valid: true };
}

/**
 * Two-body orbital mechanics in natural units (G = 1) — the source of truth
 * shared by validateOrbit and the OrbitSim renderer. A body launched tangentially
 * at distance r with speed v around central mass M:
 *
 *   energy ε = v²/2 − M/r,   a = −M/(2ε),   e = |r·v²/M − 1|   (tangential launch)
 *   circular speed √(M/r),   escape speed √(2M/r),   period T = 2π√(a³/M)
 *
 * The launch point is an apsis: periapsis when v exceeds the circular speed (the
 * body swings outward), apoapsis when it is slower. `bound` is false at or above
 * the escape speed, where the conic opens and no closed orbit exists.
 */
export interface OrbitMechanics {
  /** Circular-orbit speed at the launch distance, √(M/r). */
  circularSpeed: number;
  /** Escape speed at the launch distance, √(2M/r). */
  escapeSpeed: number;
  /** True while the orbit is bound (v below the escape speed) — a closed ellipse. */
  bound: boolean;
  /** Orbital eccentricity (0 circular, →1 at escape, ≥1 unbound). */
  eccentricity: number;
  /** Semi-major axis a (natural units); +∞/negative when unbound. */
  semiMajor: number;
  /** Semi-latus rectum p = (r·v)²/M (natural units) — defines the conic either way. */
  semiLatus: number;
  /** Periapsis distance a(1 − e) (natural units). */
  periapsis: number;
  /** Apoapsis distance a(1 + e), only meaningful when bound. */
  apoapsis: number;
  /** Orbital period T = 2π√(a³/M) (natural units); +∞ when unbound. */
  period: number;
  /** Whether the tangential launch point is the periapsis (vs the apoapsis). */
  launchAtPeriapsis: boolean;
  /**
   * Position of the orbiting body relative to the central mass at the focus, at
   * time t, for a BOUND orbit (solves Kepler's equation). Periapsis lies on +x;
   * the body sweeps counter-clockwise (fast near periapsis, slow near apoapsis).
   */
  at: (t: number) => { x: number; y: number; r: number; speed: number };
}

export function orbitMechanics(spec: OrbitSpec): OrbitMechanics {
  const { centralMass: M, distance: r, speed: v } = spec;
  const circularSpeed = Math.sqrt(M / r);
  const escapeSpeed = Math.sqrt((2 * M) / r);
  const energy = (v * v) / 2 - M / r;
  const bound = v < escapeSpeed;
  const eccentricity = Math.abs((r * v * v) / M - 1);
  const semiMajor = bound ? -M / (2 * energy) : Infinity;
  const semiLatus = (r * v * v * r) / M; // (r·v)²/M
  const periapsis = bound ? semiMajor * (1 - eccentricity) : semiLatus / (1 + eccentricity);
  const apoapsis = bound ? semiMajor * (1 + eccentricity) : Infinity;
  const period = bound ? 2 * Math.PI * Math.sqrt(Math.pow(semiMajor, 3) / M) : Infinity;
  const launchAtPeriapsis = v >= circularSpeed;
  const e = eccentricity;
  const a = semiMajor;
  const b = bound ? a * Math.sqrt(Math.max(0, 1 - e * e)) : 0;
  const n = bound ? (2 * Math.PI) / period : 0; // mean motion

  const at = (t: number) => {
    if (!bound) {
      // No closed orbit — hold the body at the launch apsis on +x.
      return { x: periapsis, y: 0, r: periapsis, speed: v };
    }
    // Mean anomaly, measured from periapsis. When the body launches at apoapsis
    // (slow), start it half a period along so it begins where the user launched it.
    const M0 = launchAtPeriapsis ? 0 : Math.PI;
    const Mt = (M0 + n * t) % (2 * Math.PI);
    // Solve Kepler's equation Mt = E − e·sin E for the eccentric anomaly E.
    let E = Mt;
    for (let i = 0; i < 24; i++) {
      const f = E - e * Math.sin(E) - Mt;
      const fp = 1 - e * Math.cos(E);
      const dE = f / fp;
      E -= dE;
      if (Math.abs(dE) < 1e-10) break;
    }
    const x = a * (Math.cos(E) - e); // focus at origin, periapsis on +x
    const y = b * Math.sin(E);
    const rt = a * (1 - e * Math.cos(E));
    const speed = Math.sqrt(Math.max(0, M * (2 / rt - 1 / a))); // vis-viva
    return { x, y, r: rt, speed };
  };

  return {
    circularSpeed,
    escapeSpeed,
    bound,
    eccentricity,
    semiMajor,
    semiLatus,
    periapsis,
    apoapsis,
    period,
    launchAtPeriapsis,
    at,
  };
}

/** Correctness gate for an orbit spec — positive mass/distance/speed, real conic. */
export function validateOrbit(spec: OrbitSpec): ValidationResult {
  if (!Number.isFinite(spec.centralMass) || spec.centralMass <= 0)
    return { valid: false, reason: 'Central mass must be a positive number.' };
  if (!Number.isFinite(spec.distance) || spec.distance <= 0)
    return { valid: false, reason: 'Launch distance must be a positive number.' };
  if (!Number.isFinite(spec.speed) || spec.speed <= 0)
    return { valid: false, reason: 'Launch speed must be a positive number.' };
  const k = orbitMechanics(spec);
  if (!Number.isFinite(k.eccentricity) || !Number.isFinite(k.semiLatus) || k.semiLatus <= 0)
    return { valid: false, reason: 'Orbit is not physically realizable.' };
  return { valid: true };
}

/**
 * Thin-lens image formation — the source of truth shared by validateRay and the
 * RaySim renderer. With the object a distance d₀ in front of a lens of focal
 * length f:
 *
 *   1/f = 1/d₀ + 1/d_i  ⇒  d_i = f·d₀/(d₀ − f),   m = −d_i/d₀,   h_i = m·h₀
 *
 * d_i > 0 is a real image (opposite side, where rays actually converge); d_i < 0
 * is virtual (same side as the object). m < 0 means inverted.
 */
export interface LensOptics {
  /** Image distance d_i (m); >0 real (far side), <0 virtual (object's side). */
  imageDistance: number;
  /** Linear magnification m = −d_i/d₀ (negative ⇒ inverted). */
  magnification: number;
  /** Image height h_i = m·h₀ (m); sign gives orientation. */
  imageHeight: number;
  /** Real (rays converge) vs virtual (rays only appear to diverge from it). */
  real: boolean;
  /** Upright (same orientation as the object) vs inverted. */
  upright: boolean;
}

export function lensOptics(spec: RayDiagramSpec): LensOptics {
  const { focalLength: f, objectDistance: d0, objectHeight: h0 } = spec;
  const imageDistance = (f * d0) / (d0 - f);
  const magnification = -imageDistance / d0;
  return {
    imageDistance,
    magnification,
    imageHeight: magnification * h0,
    real: imageDistance > 0,
    upright: magnification > 0,
  };
}

/** Correctness gate for a ray-diagram spec. */
export function validateRay(spec: RayDiagramSpec): ValidationResult {
  if (!Number.isFinite(spec.focalLength) || spec.focalLength === 0)
    return { valid: false, reason: 'Focal length must be a nonzero number.' };
  if (!Number.isFinite(spec.objectDistance) || spec.objectDistance <= 0)
    return { valid: false, reason: 'Object distance must be a positive number.' };
  if (!Number.isFinite(spec.objectHeight) || spec.objectHeight <= 0)
    return { valid: false, reason: 'Object height must be a positive number.' };
  if (Math.abs(spec.objectDistance - spec.focalLength) < 1e-9)
    return { valid: false, reason: 'Object sits at the focal point — the image forms at infinity.' };
  const o = lensOptics(spec);
  if (!Number.isFinite(o.imageDistance) || !Number.isFinite(o.magnification))
    return { valid: false, reason: 'Image formation is not physically realizable.' };
  return { valid: true };
}
