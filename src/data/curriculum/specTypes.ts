/**
 * Spec-type registry — the controlled vocabulary of interactive widget templates
 * the renderer knows how to draw (docs/DESIGN.md, Approach A: "the curated
 * template library that seeds the spec vocabulary").
 *
 * A {@link Concept} becomes *renderable* once it is mapped to one of these spec
 * types via its `specType` field. The set of concepts NOT yet mapped is the
 * coverage gap — the prioritized list of widgets still to build.
 *
 * This is the planned vocabulary; none of these are built yet. Adding a real
 * widget = implement the renderer for its id, then map concepts to it.
 */
import type { RepresentationCategory } from './types.ts';

export interface SpecType {
  /** Stable id referenced by `Concept.specType`. */
  id: string;
  /** Human label. */
  label: string;
  /** Which mental-model category this widget embodies. */
  category: RepresentationCategory;
  /** What the widget shows and what the student can manipulate. */
  description: string;
  /** Built and wired into the renderer yet? Seeds are all `false` for now. */
  built: boolean;
}

export const SPEC_TYPES: SpecType[] = [
  {
    id: 'function-grapher',
    label: 'Function grapher',
    category: 'graph',
    description: 'Plot y = f(x) with draggable parameters; shows roots, extrema, asymptotes.',
    built: false,
  },
  {
    id: 'surface-3d',
    label: '3D surface',
    category: 'graph',
    description: 'Render z = f(x, y) as a manipulable 3D surface with contour projection.',
    built: false,
  },
  {
    id: 'vector-field',
    label: 'Vector field',
    category: 'graph',
    description: '2D/3D field of arrows for a vector function; trace flow lines.',
    built: false,
  },
  {
    id: 'unit-circle',
    label: 'Unit circle',
    category: 'graph',
    description: 'Draggable angle on the unit circle linked to sine/cosine traces.',
    built: false,
  },
  {
    id: 'linear-transform',
    label: 'Linear transformation',
    category: 'structural',
    description: 'Watch a grid (and eigenvectors) deform under a matrix; tune the entries.',
    built: false,
  },
  {
    id: 'free-body-diagram',
    label: 'Free-body diagram',
    category: 'physical',
    description: 'Forces on a body as adjustable vectors; net force and resulting motion. Built as a block on a frictional incline.',
    built: true,
  },
  {
    id: 'circular-motion',
    label: 'Uniform circular motion',
    category: 'physical',
    description: 'Object on a circular path; tune radius/speed to see velocity (tangent) and centripetal acceleration (inward), period, and ω.',
    built: true,
  },
  {
    id: 'projectile',
    label: 'Projectile / 2D motion',
    category: 'physical',
    description: 'Launch under gravity; tune angle/speed, see trajectory and components.',
    built: true,
  },
  {
    id: 'orbit-sim',
    label: 'Orbit simulation',
    category: 'physical',
    description: 'Gravitational two-body motion; vary mass/velocity to see orbit shape.',
    built: false,
  },
  {
    id: 'wave-oscillator',
    label: 'Wave / oscillator',
    category: 'physical',
    description: 'Adjustable amplitude/frequency/phase for waves and SHM; superposition. Built as a mass on a spring.',
    built: true,
  },
  {
    id: 'ray-diagram',
    label: 'Optics ray diagram',
    category: 'physical',
    description: 'Lenses/mirrors with draggable object; principal rays and image formation.',
    built: false,
  },
  {
    id: 'circuit-diagram',
    label: 'Circuit',
    category: 'structural',
    description: 'Components in series/parallel; adjust values, see current and voltage. Built as a single-loop Ohm\'s-law circuit.',
    built: true,
  },
  {
    id: 'molecule-3d',
    label: '3D molecule',
    category: 'structural',
    description: 'Rotatable molecular geometry (VSEPR), bonds, lone pairs, hybridization.',
    built: false,
  },
  {
    id: 'reaction-energy',
    label: 'Reaction energy diagram',
    category: 'graph',
    description: 'Energy vs reaction coordinate; tune activation energy and catalysis.',
    built: false,
  },
  {
    id: 'step-walkthrough',
    label: 'Step-through walkthrough',
    category: 'procedural',
    description: 'Generic stepper for procedures: algorithm traces, proofs, titrations.',
    built: false,
  },
];

const byId = new Map(SPEC_TYPES.map((s) => [s.id, s]));

/** All valid spec-type ids (used by the build validator). */
export const SPEC_TYPE_IDS: ReadonlySet<string> = new Set(byId.keys());

/** Look up a spec type by id. */
export function getSpecType(id: string): SpecType | undefined {
  return byId.get(id);
}
