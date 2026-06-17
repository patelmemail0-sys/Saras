# Curriculum database

A concept-level map of STEM topics taught from **9th grade through lower-division
college**, swept from Khan Academy's pathways and curriculum lists. One row = one
teachable **concept** — the natural unit for a single interactive 3D diagram.

This is the coverage spine for the product: it answers DESIGN.md's Open Question 4
("which concept families do we cover?") and turns "breadth as a discovery
instrument" into a concrete list. The `representations` and `diagram3dFit` fields
tie each concept to the **3 distinct mental models** engine.

## Current coverage

734 concepts across 23 courses (regenerate the table with `bun run build.ts`):

| Subject   | Concepts | Courses | High 3D-fit |
|-----------|---------:|--------:|------------:|
| Math      |      438 |      11 |         103 |
| Physics   |       95 |       4 |          64 |
| Chemistry |       76 |       3 |          30 |
| Biology   |       71 |       2 |          29 |
| Computing |       54 |       3 |           4 |
| **Total** |  **734** |  **23** |     **226** |

Courses: Algebra 1, Geometry, Algebra 2, Trigonometry, Precalculus, AP Calculus
AB/BC, AP Statistics, Multivariable calculus, Linear algebra, Differential
equations · High school / AP Physics 1 / AP Physics 2 / Physics library · High
school / AP Chemistry / Organic chemistry · High school / AP Biology · AP CS
Principles / Algorithms / Computer programming.

## Layout

```
curriculum/
├── types.ts        # Concept / Course / SubjectCurriculum interfaces (the contract)
├── index.ts        # typed loader + query API — import from here
├── build.ts        # merges + validates raw/ → per-subject JSON (run to rebuild)
├── README.md       # this file
├── raw/            # per-slice source JSON (edit these, then rebuild)
│   ├── math-foundations.json   math-calculus.json   math-advanced.json
│   ├── physics.json   chemistry.json   biology.json   computing.json
└── {math,physics,chemistry,biology,computing}.json   # GENERATED — do not edit
```

The generated per-subject files are written by `build.ts`. To change data, edit
the relevant `raw/*.json` and re-run the build; never hand-edit the generated
files.

## Usage

```ts
import {
  concepts,            // Concept[] — all 734
  courses,             // Course[]  — all 23
  search,              // free-text search over title/keywords/course/unit
  conceptsBySubject,   // ('physics') => Concept[]
  diagram3dCandidates, // ('high')   => Concept[]  — seed list for first diagrams
  getConcept,          // (id)       => Concept | undefined
  prerequisitesOf,     // (id)       => Concept[]
  stats,               // aggregate counts
} from '@/data/curriculum';

const seeds = diagram3dCandidates('high'); // 226 concepts best suited to a 3D widget
const limits = search('limits at infinity');
```

## Rebuild / validate

```bash
bun run src/data/curriculum/build.ts
```

`build.ts` is the correctness gate. It fails (non-zero exit, no files written) on:
duplicate ids, malformed ids, invalid enum values, a concept whose `unit` isn't in
its course, or a subject/id mismatch. Unresolved prerequisites are reported as
non-fatal warnings.

## Sourcing & caveats

- **Method:** knowledge-seeded from Khan Academy's curriculum, then course/unit
  lists spot-verified against the live site. Khan's course pages render
  client-side, so unit lists were confirmed via search rather than DOM scraping —
  a few unit titles may differ slightly from Khan's exact current strings.
- **Granularity:** concept-level, ~4-8 concepts per unit. Deliberately not
  exercise-level (would be ~5000+ noisy rows) and not unit-level (too coarse to
  drive individual diagrams).
- **Dedup:** where a concept recurs across courses (e.g. HS vs AP), it's emitted
  once in the most foundational course; higher courses carry only their
  additional depth and reference the foundation via `prerequisites`.
- `diagram3dFit` is an honest editorial judgment, not a guarantee — `high` is
  reserved for genuinely spatial concepts (solids of revolution, vector fields,
  molecular geometry, free-body diagrams, eigenvectors), not padded.
