# Saras

Saras turns a STEM concept, formula, or problem into 3 interactive visuals —
three distinct mental models of the same idea — to help high school and college
students build intuition, not just get answers.

**Read [`docs/DESIGN.md`](docs/DESIGN.md) first.** It holds the approved product
thesis, the competitive reality (ChatGPT shipped interactive STEM visuals for 70+
concepts in 2026), the chosen architecture, and the validation plan. Do not
re-litigate decisions recorded there without flagging it.

## Stage

Pre-product. No users, no demand evidence yet. The immediate goal per the design
doc is cheap validation (watch real students, stress-test competitors), not a
feature sprint. Keep that in mind before building large.

## Architecture (the core bet)

- AI emits a **validated JSON visualization spec**; a deterministic renderer draws it.
- A **deterministic numeric/unit check is the binding correctness gate** — an LLM
  "does this fit?" pass is advisory only. A wrong visual is worse than none.
- Seed the spec vocabulary with ~12 hand-built, tested widget templates (~6 in the
  first prototype). Unknown inputs degrade to a named fallback, never a guessed visual.

## Tech stack

Vite + React 19 + TypeScript, Bun for scripts. Commands: `bun dev`, `bun run build`,
`bun run preview`, `bun run lint`.

## gstack skill routing

When a request matches a skill, invoke it via the Skill tool.

- Product ideas / scope / brainstorm → `/office-hours`
- Strategy/scope review → `/plan-ceo-review`
- Architecture review → `/plan-eng-review`
- Bugs / errors / "why doesn't X work" → `/investigate` (don't debug directly)
- QA / "does this work" → `/qa` or `/qa-only`
- Code review / diff check → `/review`
- Visual polish → `/design-review`
- Ship / deploy / PR → `/ship` then `/land-and-deploy` (never push or open PRs manually)
- Web/UI verification → `/browse` (never `mcp__claude-in-chrome__*`)
