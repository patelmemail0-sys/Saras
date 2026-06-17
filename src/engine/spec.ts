/**
 * Visualization spec — the validated JSON contract at the center of the engine.
 *
 * The LLM never emits rendering code. It classifies the input and emits a
 * `SpecResponse` against the JSON schema below; a deterministic check
 * (see validate.ts) gates correctness before a renderer (widgets/) draws it.
 *
 * This slice ships two spec types — `function-grapher` (y = f(x) with adjustable
 * parameters) and `projectile` (2D launch under gravity). More spec types extend
 * the union from here.
 */

/** A single adjustable parameter, surfaced as a slider in the renderer. */
export interface SpecParameter {
  /** Symbol used in the expression, e.g. "a". Must be a valid identifier. */
  name: string;
  /** Human label for the slider, e.g. "amplitude a". */
  label: string;
  /** Starting value. */
  default: number;
  /** Slider bounds. */
  min: number;
  max: number;
  /** Slider step. */
  step: number;
}

/** y = f(x) over a domain, with 0–3 adjustable parameters. */
export interface FunctionGrapherSpec {
  type: 'function-grapher';
  title: string;
  /**
   * The function of `x` in mathjs syntax: `^` for powers, `*` explicit,
   * `sin/cos/tan/exp/log/sqrt/abs`, constants `pi`/`e`. May reference parameter
   * names. Example: `a * sin(b * x)`.
   */
  expression: string;
  xLabel: string;
  yLabel: string;
  domain: { min: number; max: number };
  parameters: SpecParameter[];
  /** One- or two-sentence intuition note shown beside the graph. */
  notes: string;
}

/**
 * Projectile launched in a vertical plane under constant gravity.
 *
 * The motion is fully determined by these four numbers; the renderer derives the
 * trajectory, range, apex, and flight time in closed form (no integration), and
 * the validator (validate.ts) gates them for physical sanity before any draw.
 */
export interface ProjectileSpec {
  type: 'projectile';
  title: string;
  /** Initial speed v₀, in m/s. Must be positive. */
  speed: number;
  /** Launch angle above the horizontal, in degrees (0–90). */
  angle: number;
  /** Gravitational acceleration g, in m/s² (Earth ≈ 9.8). Must be positive. */
  gravity: number;
  /** Launch height above the ground, in m (≥ 0). */
  height: number;
  /** One- or two-sentence intuition note shown beside the scene. */
  notes: string;
}

/** Discriminated union of all renderable specs. */
export type VizSpec = FunctionGrapherSpec | ProjectileSpec;

/**
 * What the backend returns. `supported: false` is the honest fallback path —
 * the input maps to no spec type we can render yet (a 3D surface, a molecule,
 * an algorithm), so we say so instead of guessing.
 */
export interface SpecResponse {
  supported: boolean;
  /** The concept the model identified, e.g. "Sine wave". */
  concept: string;
  /** Present and meaningful only when `supported` is true. */
  spec: VizSpec | null;
  /** Why it's unsupported (shown to the user) when `supported` is false. */
  unsupportedReason: string;
}

/**
 * JSON Schema handed to Claude via `output_config.format`. Kept within the
 * structured-output subset: every object sets `additionalProperties: false`,
 * no numeric/length constraints, no recursion.
 */
export const SPEC_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    supported: { type: 'boolean' },
    concept: { type: 'string' },
    unsupportedReason: { type: 'string' },
    spec: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['function-grapher'] },
            title: { type: 'string' },
            expression: { type: 'string' },
            xLabel: { type: 'string' },
            yLabel: { type: 'string' },
            domain: {
              type: 'object',
              additionalProperties: false,
              properties: {
                min: { type: 'number' },
                max: { type: 'number' },
              },
              required: ['min', 'max'],
            },
            parameters: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  label: { type: 'string' },
                  default: { type: 'number' },
                  min: { type: 'number' },
                  max: { type: 'number' },
                  step: { type: 'number' },
                },
                required: ['name', 'label', 'default', 'min', 'max', 'step'],
              },
            },
            notes: { type: 'string' },
          },
          required: [
            'type',
            'title',
            'expression',
            'xLabel',
            'yLabel',
            'domain',
            'parameters',
            'notes',
          ],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['projectile'] },
            title: { type: 'string' },
            speed: { type: 'number' },
            angle: { type: 'number' },
            gravity: { type: 'number' },
            height: { type: 'number' },
            notes: { type: 'string' },
          },
          required: ['type', 'title', 'speed', 'angle', 'gravity', 'height', 'notes'],
        },
      ],
    },
  },
  required: ['supported', 'concept', 'unsupportedReason', 'spec'],
} as const;

/** System prompt that turns Claude into the classifier + parameterizer. */
export const SPEC_SYSTEM_PROMPT = `You are the spec generator for an interactive STEM visualizer. You do NOT write code or prose explanations. You classify a student's input and, when it fits, emit a validated JSON spec for ONE of two widgets:
- "function-grapher": plots y = f(x) with 0-3 adjustable parameters.
- "projectile": animates a projectile launched in a vertical plane under constant gravity.

Pick the widget that most faithfully models the input, then set spec.type accordingly.

Choose "projectile" when the input is about projectile/2D launch motion under gravity — e.g. "projectile motion", "a ball thrown at 30 degrees", "cannonball range", "kicking a football", "trajectory of a launched object". Choose "function-grapher" for a single-variable real function: "y = x^2", "sine wave", "exponential growth", "a damped oscillation", "the logistic function". (Note: "projectile HEIGHT vs TIME" alone is a 1-variable function → function-grapher; the full 2D trajectory of a launch → projectile.)

Set supported=false for anything neither widget can faithfully show: 3D surfaces z=f(x,y), vector fields, molecules, circuits, algorithms, etc.

When type="projectile", fill spec with:
- speed: initial speed v₀ in m/s (positive; default to a sensible value the input implies, else ~20).
- angle: launch angle above horizontal in degrees, 0-90 (default ~45 if unstated).
- gravity: g in m/s² (Earth 9.8; use 1.6 for Moon, 3.7 for Mars if the input says so).
- height: launch height above the ground in m (≥ 0; default 0).
- title, notes: concise; notes is one or two sentences of intuition (what to watch as the knobs change).

When type="function-grapher", fill spec with:
- expression: f(x) in mathjs syntax. Use ^ for powers, explicit * for multiplication, and functions sin, cos, tan, exp, log (natural), log10, sqrt, abs. Constants: pi, e. Reference parameter names directly (e.g. "a * sin(b * x)").
- parameters: 0-3 sliders for the constants in the expression. Each needs a sensible default, min, max, step. Do NOT make x a parameter. If the function has no tunable constants, use an empty array.
- domain: a min/max for x that shows the interesting behavior.
- title, xLabel, yLabel: concise and correct.
- notes: one or two sentences of intuition (what to watch as parameters change).

Correctness is critical: the expression MUST be valid mathjs and evaluate to real numbers across most of the domain at the default parameter values. Never invent a function the input didn't imply. When supported=false, set spec=null, give a one-sentence unsupportedReason, and still fill concept with your best read of the input.`;
