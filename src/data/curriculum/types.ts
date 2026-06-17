/**
 * Curriculum database types.
 *
 * One {@link Concept} = one teachable STEM concept (the natural unit for a single
 * interactive 3D diagram), sourced from Khan Academy's 9th-grade-through-college
 * STEM pathways. The diagram-oriented fields (`representations`, `diagram3dFit`)
 * connect this database to the product's "3 distinct mental models" engine
 * described in docs/DESIGN.md.
 */

export type Subject =
  | 'math'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'computing';

/**
 * Grade band a concept is typically first taught in. "college" covers
 * lower-division undergraduate (multivariable calc, linear algebra, organic
 * chem, etc.).
 */
export type GradeBand = '9-10' | '11-12' | 'college';

/** Course level, roughly tracking rigor / target audience. */
export type Level = 'hs' | 'ap' | 'college';

/**
 * Representation categories from docs/DESIGN.md. A concept's `representations`
 * lists which distinct mental models a correct visual could use. The engine
 * picks up to 3 spanning *distinct* categories.
 *
 * - graph       — symbolic/graphical (function plot, vector field, phase diagram)
 * - physical    — a physical analogy or simulation (free-body, projectile, orbit)
 * - procedural  — a step-through walkthrough (algorithm trace, proof, titration)
 * - structural  — spatial/structural diagram (molecule, cell, circuit, solid)
 * - symbolic    — equation / formula manipulation surface
 */
export type RepresentationCategory =
  | 'graph'
  | 'physical'
  | 'procedural'
  | 'structural'
  | 'symbolic';

/** How well-suited the concept is to an interactive 3D diagram specifically. */
export type Diagram3dFit = 'high' | 'medium' | 'low' | 'none';

export interface Concept {
  /**
   * Stable, unique slug. Format: `<subject>.<course-slug>.<concept-slug>`,
   * e.g. `physics.ap-physics-1.projectile-motion`. Lowercase, hyphenated.
   */
  id: string;
  /** Human-readable concept name, e.g. "Projectile motion". */
  title: string;
  subject: Subject;
  /** Course this concept belongs to, e.g. "AP Physics 1". */
  course: string;
  /** Unit within the course, e.g. "Two-dimensional motion". */
  unit: string;
  gradeBand: GradeBand;
  level: Level;
  /** One- or two-sentence plain description of what the concept is. */
  description: string;
  /** Search / classification aids (synonyms, related terms, key formula names). */
  keywords: string[];
  /** `id`s of prerequisite concepts (may reference concepts in other courses). */
  prerequisites: string[];
  /** Distinct mental-model categories a correct visual could use. */
  representations: RepresentationCategory[];
  /** Suitability for an interactive 3D diagram. */
  diagram3dFit: Diagram3dFit;
  /**
   * Id of the widget template (see specTypes.ts) that can render this concept,
   * once one is mapped. Absent = not yet renderable (a coverage gap). This is
   * how the database tracks which concepts the engine can actually draw.
   */
  specType?: string;
  /** Canonical Khan Academy URL for the lesson/topic, when known. */
  khanUrl?: string;
}

/** A course = an ordered list of units; the structural spine above concepts. */
export interface Course {
  /** Slug used in concept ids, e.g. "ap-physics-1". */
  slug: string;
  /** Display name, e.g. "AP Physics 1". */
  name: string;
  subject: Subject;
  gradeBand: GradeBand;
  level: Level;
  /** Ordered unit titles as Khan Academy presents them. */
  units: string[];
  /** Canonical Khan Academy course URL. */
  khanUrl?: string;
}

/** Per-subject database file shape. */
export interface SubjectCurriculum {
  subject: Subject;
  courses: Course[];
  concepts: Concept[];
}
