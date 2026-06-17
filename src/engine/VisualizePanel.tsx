/**
 * The visualize surface (#/try). Pastes a concept, calls the backend for a spec,
 * runs the deterministic gate, and renders the widget or an honest fallback.
 *
 * The spec endpoint is a Vercel function (api/spec.ts) and needs ANTHROPIC_API_KEY.
 * It isn't available under plain `bun dev` — when the call fails, we say so and
 * offer a built-in example so the renderer is still demonstrable locally.
 */
import { useState } from 'react';
import FunctionGrapher from './widgets/FunctionGrapher.tsx';
import ProjectileSim from './widgets/ProjectileSim.tsx';
import { validateFunctionGrapher, validateProjectile } from './validate.ts';
import type { VizSpec, SpecResponse } from './spec.ts';
import './visualize.css';

const EXAMPLE_SPEC: VizSpec = {
  type: 'projectile',
  title: 'Projectile motion',
  speed: 22,
  angle: 50,
  gravity: 9.8,
  height: 0,
  notes: 'Range peaks near 45°; push the angle past it and the arc climbs higher but lands shorter. Swap to the Moon and watch the whole flight stretch out.',
};

/** Run the right deterministic gate for the spec's type. */
function validate(spec: VizSpec) {
  return spec.type === 'projectile'
    ? validateProjectile(spec)
    : validateFunctionGrapher(spec);
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'spec'; spec: VizSpec; concept: string }
  | { kind: 'unsupported'; concept: string; reason: string }
  | { kind: 'invalid'; concept: string; reason: string }
  | { kind: 'error'; message: string };

export default function VisualizePanel() {
  // Show the projectile model right away so the surface is never an empty stage.
  // A STEM-field menu (math / physics / … → topic by grade) will drive this next.
  const [state, setState] = useState<State>({
    kind: 'spec',
    spec: EXAMPLE_SPEC,
    concept: EXAMPLE_SPEC.title,
  });

  // Kept for the upcoming menu (and the offline "render the example" path): turn a
  // SpecResponse into the right rendered/fallback state through the correctness gate.
  function acceptResponse(data: SpecResponse) {
    if (!data.supported || !data.spec) {
      setState({
        kind: 'unsupported',
        concept: data.concept || 'this input',
        reason: data.unsupportedReason || 'No interactive visual for this yet.',
      });
      return;
    }
    // The binding correctness gate, on the client, before render.
    const check = validate(data.spec);
    if (!check.valid) {
      setState({ kind: 'invalid', concept: data.concept, reason: check.reason ?? 'Failed validation.' });
      return;
    }
    setState({ kind: 'spec', spec: data.spec, concept: data.concept });
  }

  const topic =
    state.kind === 'spec'
      ? state.spec.title
      : state.kind === 'unsupported' || state.kind === 'invalid'
        ? state.concept
        : '';

  return (
    <div className="viz">
      <header className="viz__head">
        <div className="viz__heading">
          <h1 className="viz__title"><b>Saras</b> <span>visualize</span></h1>
          <p className="viz__topic">{topic || 'Pick a topic to visualize'}</p>
        </div>
        <a className="viz__back" href="#/">← home</a>
      </header>

      <div className="viz__stage">
        {state.kind === 'idle' && (
          <div className="viz__empty">Your interactive visual appears here.</div>
        )}

        {state.kind === 'loading' && <div className="viz__empty">Generating a spec…</div>}

        {state.kind === 'spec' &&
          (state.spec.type === 'projectile' ? (
            // The model fills the stage; it carries its own labels, so no
            // outer caption/notes (which would force the page to scroll).
            <div className="viz__result viz__result--model">
              <ProjectileSim spec={state.spec} />
            </div>
          ) : (
            <figure className="viz__result">
              <figcaption className="viz__caption">{state.spec.title}</figcaption>
              <FunctionGrapher spec={state.spec} />
              <p className="viz__notes">{state.spec.notes}</p>
            </figure>
          ))}

        {state.kind === 'unsupported' && (
          <div className="viz__fallback">
            <b>No interactive visual for “{state.concept}” yet.</b>
            <p>{state.reason}</p>
            <p className="viz__muted">
              This is a logged coverage gap — the current build covers single-variable
              functions and projectile motion. More spec types (3D surfaces, vector
              fields, molecules) come next.
            </p>
          </div>
        )}

        {state.kind === 'invalid' && (
          <div className="viz__fallback">
            <b>Couldn't verify a correct visual for “{state.concept}”.</b>
            <p>{state.reason}</p>
            <p className="viz__muted">
              A wrong visual is worse than none, so the engine refused to render this one.
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="viz__fallback">
            <b>The spec backend isn't reachable here.</b>
            <p className="viz__muted">{state.message}</p>
            <p className="viz__muted">
              The endpoint runs on Vercel and needs <code>ANTHROPIC_API_KEY</code>. Run
              <code> vercel dev</code> or deploy to use it live. Meanwhile, here's a worked
              example rendered by the same widget + validator:
            </p>
            <button className="viz__chip" onClick={() => acceptResponse({ supported: true, concept: EXAMPLE_SPEC.title, spec: EXAMPLE_SPEC, unsupportedReason: '' })}>
              Render the example
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
