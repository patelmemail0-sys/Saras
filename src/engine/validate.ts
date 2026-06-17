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
import type { FunctionGrapherSpec } from './spec.ts';

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
