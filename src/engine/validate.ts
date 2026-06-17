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
import type { FunctionGrapherSpec, ProjectileSpec } from './spec.ts';

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
