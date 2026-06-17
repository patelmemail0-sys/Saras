# Changelog

All notable changes to Saras are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com); versions
use `MAJOR.MINOR.PATCH.MICRO`.

## [0.2.0.0] - 2026-06-17

### Added
- **Spec engine** at `#/try` (`src/engine/`): paste a concept or formula and an
  AI-emitted, schema-validated JSON spec is drawn by a deterministic renderer. A
  numeric correctness gate (`validate.ts`) runs before any render — a wrong visual
  is worse than none. Backend is a Vercel function (`api/spec.ts`, Claude
  structured output); under plain `bun dev` it degrades to a built-in example.
- **Projectile motion model** (`widgets/ProjectileSim.tsx`, spec type `projectile`):
  a hands-on 2D launch — drag speed/angle/height, switch gravity (Moon/Mars/Earth/
  Jupiter), animate the flight or scrub time, with live range/apex/flight-time.
  Closed-form kinematics in `validate.ts` are shared by the gate and the renderer,
  so the verified physics and the drawn physics can't drift. First renderable
  concept: `physics.high-school-physics.projectile-motion` (1/734).
- **Equation engine** (`equations.ts` + `EquationPanel.tsx`): per-topic equation
  sets (each a display form + variables + a residual `r(vars)=0`) with a numeric
  solver that lets a student set the knowns and have any remaining unknown solved
  for — forward and backward — and fed straight into the visual. Equations render
  as real math via KaTeX.
- **Word problem → model** (`projectileWordProblem.ts`): a deterministic parser
  extracts launch parameters from a plain-English projectile problem and detects
  what it asks (how far / how high / how long) to auto-select the equation and
  unknown. Offline by default; an opt-in `VITE_SPEC_AI` flag adds AI extraction
  for messier phrasing, falling back to the parser.

## [0.1.0.0] - 2026-06-16

### Added
- **STEM curriculum database** (`src/data/curriculum/`): 734 concept-level rows
  across 23 Khan Academy courses (math, physics, chemistry, biology, computing),
  swept from 9th-grade-through-college pathways. Typed loader + query API and a
  validating build step (`build.ts`) that fails closed on bad ids/enums/units.
- **Spec-type registry** (`specTypes.ts`) and an optional `Concept.specType`
  field that maps a concept to a renderable widget template. The build reports
  renderable count and the high-3D-fit coverage gap (currently 0/734 mapped,
  230 high-fit gaps).
- **Curriculum coverage dashboard** at `#/coverage` (internal planning tool):
  filter/search concepts, star a prototype queue, and tentatively map spec types.
  Star + spec assignments persist to localStorage as a planning layer that never
  mutates the committed data. Lazy-loaded via `Root.tsx` so the ~600 KB dataset
  stays out of the landing bundle.
