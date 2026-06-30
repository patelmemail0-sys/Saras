# Changelog

All notable changes to Saras are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com); versions
use `MAJOR.MINOR.PATCH.MICRO`.

## [0.3.3.0] - 2026-06-29

### Added
- **Gravitational orbit model.** A new interactive two-body orbit you can orbit with the
  mouse, in the same obsidian/glass/azure 3D look as the other models. Drag the central
  mass, launch distance, and launch speed and watch the path morph between a circle, an
  ellipse, and an unbound escape — the orbiting body races through periapsis and crawls at
  apoapsis (Kepler's 2nd law). It reads eccentricity, semi-major axis, and period live, and
  carries the same "work the equation" panel (circular speed, escape speed, eccentricity,
  semi-major axis, period) and word-problem input as the other physics models. Units are
  natural (G = 1) so the orbit's *shape* is the lesson, not astronomical constants. All
  physics comes from one closed-form source (vis-viva + Kepler's equation) shared by the
  correctness gate and the renderer, so what's drawn is exactly what's checked.
- **Thin-lens optics model.** A new 3D optical bench: an upright object in front of a glass
  lens, with the principal rays converging to locate the image. Drag the focal length
  (positive converging, negative diverging), object distance, and object height and watch
  the image flip between real-inverted and virtual-upright and grow or shrink. Slide the
  object inside the focal length and the converging lens becomes a magnifying glass. Reads
  image distance, magnification, and image height live, with the lens equation /
  magnification / image-height panel and word-problem input ("a 2 cm object 30 cm from a
  converging lens, f = 10 cm — where is the image?").
- These complete the engine's physical-model set; the visualize menu and topic deep-links
  now include **Orbit** and **Lens (optics)**, and the gravitational-orbits, Kepler's-laws,
  and lenses-and-mirrors curriculum concepts map to them.

## [0.3.2.0] - 2026-06-29

### Added
- **Interactive circuit builder.** The Ohm's-law circuit model is now a full DC-circuit
  sandbox. Place, drag, rewire, and delete resistors, wires, batteries, and a new
  **switch** component on a snap-to-grid 2D schematic; flip the switch open/closed and
  watch the loop break or conduct. A new solver (`circuitNetwork.ts`) runs Modified Nodal
  Analysis over the netlist and is the single correctness gate — the 2D editor, the side
  panel, and the 3D view all read its one result; nothing recomputes physics. Degenerate
  circuits (no source, no loop, short, floating) return a clean status, never a NaN visual.
- **College-level analysis.** Per-component voltage / current / power, battery terminal
  voltage with **internal resistance** (E − I·r), a selectable **ground/reference**, node
  voltages, and signed branch currents. Lab-style probes: **voltmeter** (ΔV between two
  nodes), **ammeter** (current + direction through any branch), and **ohmmeter**
  (equivalent resistance between two points). Node-voltage and branch-current labels
  toggle on the schematic.
- **3D measurement layer.** The linked react-three-fiber view (matching the engine's
  obsidian/glass/azure look) animates charge flow at a speed set by each branch's real
  current, and now renders the same measurements as the 2D editor: a ground reference
  ring, node-voltage tags, per-branch current labels, probe-node rings, and a floating
  ΔV / I / R_eq readout. Snap-to-plane (X/Y/Z) camera and a colour legend included.

### Changed
- **Decluttered the 2D schematic.** Components show only their rating by default
  (e.g. `12 V`, `60 Ω`); solved voltages and currents move behind the `node V` and
  `branch I` toggles, so the diagram stays readable instead of stacking a value label on
  every component. Charge flow honours `prefers-reduced-motion` (starts still).

### Fixed
- **Two cells in series now solve.** The loop-completeness check only looked for a return
  path through resistors, so a valid circuit whose loop closes through another battery
  (two cells in series) was wrongly rejected as "no complete loop." It now checks the
  return path through every non-connector component.
- **Total delivered current no longer double-counts series sources.** The panel's
  "delivering X A" summed each battery's current, so two cells in series read 2 A instead
  of the 1 A loop current. It now sums the net positive current injected into the external
  circuit, so series sources are counted once and parallel sources add.
- **3D model viewports fill their frame on narrow screens.** In the stacked (≤760px)
  layout the react-three-fiber canvas resolved its height against an indefinite parent and
  collapsed to roughly half; it now absolute-fills its container, so every 3D model renders
  full-height on phones.

## [0.3.1.0] - 2026-06-22

### Changed
- **All five physics models are now true 3D.** The flat SVG widgets (projectile,
  spring/SHM, Ohm's-law circuit, inclined plane, circular motion) are now
  react-three-fiber scenes matching the landing page's obsidian/glass/azure look:
  matte pearl/chrome surfaces with a glass accent on the focal object, an orbitable
  camera, and a perspective grid floor. **All physics is unchanged** — every scene
  derives from the same closed-form `validate.ts` kinematics the correctness gate
  verifies, and the equation panel, word-problem bar, readouts, and play/scrub are
  untouched. Each model keeps a 2D SVG fallback for non-WebGL.
- **Visualize header.** Removed the topic-chip bubble row above the model; topic
  selection moves to a single glass "all topics" button (→ `#/topics`). The
  "← home" link was removed. `#/try/<spec-type>` now deep-links a specific model.

### Added
- **Shared 3D scaffold** (`src/engine/widgets/three/`): a reusable `Scene3D` Canvas
  wrapper (lighting + Environment + OrbitControls + dpr cap + reduced-motion +
  on-demand/continuous render policy), a "clean 3D, glass accents" material kit,
  reusable vector/grid/label primitives, and a WebGL capability gate.
- **Plane-snap controls** on every 3D scene: X / Y / Z buttons glide the camera to
  look down each axis (side / top / front), plus a reset to the default 3D view.
  Distance and target are preserved; eased, and instant under reduced-motion.
- **Per-scene legend** — a fixed glass chip keys the vector colors and key values,
  replacing the floating in-scene labels that cluttered the animation.

## [0.3.0.0] - 2026-06-17

### Added
- **Login + onboarding.** New `#/get-started` flow (name → education level →
  topics of interest → create account) and an `#/login` screen for returning
  users. Account creation supports email + password and Google OAuth.
- **Supabase auth wired.** New browser client (`src/lib/supabase.ts`, PKCE flow),
  an `AuthProvider` + `useAuth` hook tracking session and profile, and a
  `profiles` table (RLS own-row, on-signup trigger) storing `full_name`,
  `grade_level`, `subjects`, and `onboarding_completed`.
- Onboarding answers are held across the email-confirm / OAuth round-trip and
  applied automatically when the user returns authenticated.
- Landing nav now links to "Log in" and "Get started".

### Notes
- Two dashboard ops steps remain before the flow is fully live: turn off email
  confirmation (or configure custom SMTP) and configure the Google OAuth provider.

## [0.2.0.1] - 2026-06-17

### Changed
- **Visualize surface (`#/try`) is now full-bleed and fits the viewport.** Replaced
  the centered 980px column with a full-width, full-height (`100dvh`) flex layout;
  the projectile model fills the stage with no page scroll (visual + equation panel
  in a flexing row, the SVG sized to fit, equation variables in two columns).
- Removed the free-text concept box and example chips (a STEM-field menu will
  replace them) and render the projectile model by default so the stage is never
  empty.
- Header polish: larger "Saras" in brushed-chrome Space Grotesk, a quiet
  uppercase-tracked "visualize", and the current topic shown in a glassy chrome pill.

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
