# Changelog

All notable changes to Saras are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com); versions
use `MAJOR.MINOR.PATCH.MICRO`.

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
