# Saaras

**One concept, seen three ways.** Saaras turns a STEM concept, formula, or problem
into interactive visuals that let you manipulate variables and understand an idea
from multiple angles, so it actually sticks.

The name comes from the Sanskrit root *saras* ("flowing") — the same root as
Saraswati, associated with the flow of knowledge. Saaras is about making
understanding flow.

> Status: **pre-product.** This repo is scaffolding. The product thesis,
> architecture, competitive analysis, and validation plan live in
> [`docs/DESIGN.md`](docs/DESIGN.md).

## What it does (the thesis)

Most tools explain *a* concept. Saaras takes the *specific* thing in front of you
and renders it as **3 distinct mental models** of the same idea — for example a
manipulable graph, a physical analogy, and a step-by-step interactive walkthrough.
Three representations of one concept, not three random pictures.

## Architecture (planned)

The engine emits a **validated JSON visualization spec** which a deterministic
renderer draws, with a deterministic numeric/unit check as the binding correctness
gate before anything renders. A curated library of tested widget templates seeds
the spec vocabulary. See [`docs/DESIGN.md`](docs/DESIGN.md) for the full rationale
and the alternatives that were considered.

## Tech stack

- [Vite](https://vite.dev) + [React 19](https://react.dev) + TypeScript
- Bun for package management and scripts

## Getting started

```bash
bun install
bun dev      # start the dev server
bun run build
bun run preview
```

## Project structure

```
Saaras/
├── docs/
│   └── DESIGN.md      # approved design doc (problem, architecture, validation plan)
├── src/
│   ├── App.tsx        # branded placeholder (the real app starts here)
│   └── ...
└── ...
```
