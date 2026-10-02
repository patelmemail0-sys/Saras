# TODOS

Deferred work from the model-buildout plan review (`docs/plans/model-buildout.md`,
2026-10-01). Each item was considered and left out on purpose.

## Founder actions

### Run the usage-logging SQL and its smoke script

**What:** Run `supabase/model_events.sql` in the Supabase SQL editor, then `bun scripts/usage-smoke.ts` signed out and signed in.

**Why:** Usage logging records nothing until the table exists, and the table's rules are the only new write path into the database.

**Context:** Ships in Wave 0 (PR 0d). Until it is run, `#/coverage` shows "table missing". The smoke script confirms an insert is accepted and that reading, changing and deleting rows are refused.

**Effort:** S
**Priority:** P1
**Depends on:** PR 0d merged

## Security

### Rate-limit `api/spec.ts` before it is ever switched on

**What:** Add a per-address rate limit and a spend cap to the spec endpoint, and run its eval cases, before setting `SPEC_API_ENABLED`.

**Why:** The endpoint runs a large model on the project's Anthropic key for any caller. PR 0a turns it off; a limit is the condition for turning it back on.

**Context:** `api/spec.ts` has no sign-in and no limit. Nothing a student can reach calls it today (`VITE_SPEC_AI` is off). It becomes relevant with the free-text entry point below.

**Effort:** M
**Priority:** P1
**Depends on:** the free-text entry point

## Try page

### Free-text entry point with the classifier

**What:** A text box on the Try page that sends a concept to the classifier and opens the matching model, with a JSON-schema branch and a prompt paragraph for each new model.

**Why:** It is the original DESIGN.md flow ("type a concept, get a visual"). The model library is browse-only until it exists.

**Context:** New models do not get schema branches or prompt text until this is built, because nothing would consume them. The eight original models keep theirs in `src/engine/spec.ts`.

**Effort:** L
**Priority:** P2
**Depends on:** the rate limit above; at least Wave 1 of the model library

### Shareable model state in the address

**What:** Put a model's current control values in the address so a link reopens the exact picture.

**Why:** Lets a student or teacher share "look at this case".

**Context:** The frame owns the live spec after Wave 0, so the state is in one place. Typed expressions in an address become input from strangers: `safeExpression` then needs an evaluation budget.

**Effort:** M
**Priority:** P3
**Depends on:** Wave 0

### Multi-step guided challenges per preset

**What:** A short sequence of prompts per preset ("now make it land at 30 m") with a check for each.

**Why:** One-line "try this" notes start exploration; a challenge sustains it.

**Context:** Each preset already carries one prompt. Challenges are authored content with their own correctness burden across 73 models.

**Effort:** L
**Priority:** P3
**Depends on:** usage data showing which models are opened

### Convert the six legacy widgets to the full frame contract

**What:** Move `wave-oscillator`, `circuit-diagram`, `free-body-diagram`, `circular-motion`, `orbit-sim` and `ray-diagram` to frame-owned state, with their maths, equations and parsers in their own folders.

**Why:** They are the only models with their own state handling and layout code, and they keep four shared files alive.

**Context:** Wave 0 wraps them in the frame's slots (`legacy: true`). `projectile` and `function-grapher` are the converted examples to copy.

**Effort:** L
**Priority:** P3
**Depends on:** Wave 0; their Wave 1 extensions

### Error reporting from students' browsers

**What:** Send a small report when a model crashes or a chunk fails to load.

**Why:** After Wave 0 a crash shows a notice to the student and nothing to anyone else.

**Context:** Could reuse the `model_events` path with a fifth event name, which needs the table's rules changed.

**Effort:** S
**Priority:** P3
**Depends on:** usage logging

## Reach

### Path routes with a title and description per concept, and prerendering

**What:** Replace hash routes with real paths, give each concept page its own title and description, and prerender them.

**Why:** Search engines do not index hash routes, so no concept page can be found by search.

**Context:** Changes routing for the whole app, including the sign-in flow (which uses PKCE because of the hash router).

**Effort:** XL
**Priority:** P2
**Depends on:** evidence that the library is worth finding

## Models

### 3x3 matrices in `linear-transform`

**What:** A 3D version of the matrix-as-transformation model.

**Why:** Linear algebra courses go beyond 2x2.

**Context:** The Wave 1 model is 2x2 on the plot stage. A 3x3 version is a different stage and a different interaction, so a second model.

**Effort:** M
**Priority:** P4
**Depends on:** Wave 1

### 3D fields, 3D curl, line integrals and conservative fields in `vector-field`

**What:** Extend the vector-field model past 2D divergence and scalar curl.

**Why:** Multivariable calculus concepts that the 2D model does not show stay unmapped.

**Context:** The Wave 1 model is a 2D field. Each of these is its own primary interaction.

**Effort:** L
**Priority:** P4
**Depends on:** Wave 1

### More than one model per concept in the catalog

**What:** Let a concept list several models, with one primary.

**Why:** Some concepts are shown well by two models.

**Context:** The catalog stores `model: [type, preset]` and is generated, so the shape can change in one place. Previous and next need exactly one primary.

**Effort:** S
**Priority:** P4
**Depends on:** a second representation channel existing

## Design

### A written design-token document

**What:** One document for the colour, type and spacing tokens that now live in `src/index.css` and `materials.ts`.

**Why:** 65 model builders and every later page need one reference.

**Context:** A `/design-consultation` pass would produce it. The Wave 0 colour additions (series ramp, charge pair, element colours) should be in it.

**Effort:** M
**Priority:** P3
**Depends on:** Wave 0c

## Infrastructure

### Run the WebGL sweep in CI

**What:** Run the 3D pass of `bun run sweep` in CI, not only locally.

**Why:** CI runs the 2D pass only, so a 3D-only break is caught at the integrator's local sweep, not on the PR.

**Context:** Headless GPU rendering in CI was judged not dependable. Revisit with software rendering once the sweep exists.

**Effort:** M
**Priority:** P3
**Depends on:** PR 0d

### Sweep only the changed models in CI

**What:** Limit the CI sweep to models whose folders or kits changed.

**Why:** At 73 models and two widths the sweep is a few minutes per PR and grows with each wave.

**Context:** `bun run sweep <type>` already takes a model; the missing piece is mapping a diff to models and kits.

**Effort:** S
**Priority:** P4
**Depends on:** PR 0d

### Scheduled clean-up of old `model_events` rows

**What:** A scheduled job that deletes usage rows older than 180 days.

**Why:** The table only grows.

**Context:** `supabase/usage_report.sql` ends with the delete statement to run by hand.

**Effort:** S
**Priority:** P4
**Depends on:** usage logging in use

### A custom ESLint plugin for the model rules

**What:** Move the literal-colour check from `scripts/check-models.test.ts` into a lint rule.

**Why:** Editor feedback for colours, as the import rules already have.

**Context:** After the engineering review the import, global and raw-input rules are native ESLint errors. Only the colour check is a script. Do this only if builders keep tripping on it.

**Effort:** S
**Priority:** P4
**Depends on:** Wave 1 friction notes

## Completed
