/**
 * The visualize surface (#/try). Renders one of the built interactive models and
 * lets the student switch topics from a menu; each model carries its own example
 * spec, the deterministic correctness gate, and an honest fallback.
 *
 * A spec endpoint (api/spec.ts) classifies free-text input into one of these
 * spec types; it's a Vercel function needing ANTHROPIC_API_KEY and isn't
 * available under plain `bun dev`. The menu drives the surface offline so every
 * model is demonstrable locally without the backend.
 */
import { useState } from 'react';
import FunctionGrapher from './widgets/FunctionGrapher.tsx';
import ProjectileSim from './widgets/ProjectileSim.tsx';
import ShmSim from './widgets/ShmSim.tsx';
import CircuitSim from './widgets/CircuitSim.tsx';
import InclineSim from './widgets/InclineSim.tsx';
import CircularSim from './widgets/CircularSim.tsx';
import {
  validateFunctionGrapher,
  validateProjectile,
  validateShm,
  validateCircuit,
  validateIncline,
  validateCircular,
} from './validate.ts';
import type { VizSpec, SpecResponse } from './spec.ts';
import './visualize.css';

/** The interactive-model spec types (everything except the flat function graph). */
const MODEL_TYPES = new Set([
  'projectile',
  'wave-oscillator',
  'circuit-diagram',
  'free-body-diagram',
  'circular-motion',
]);

/** The built models, in menu order, each with a ready-to-render example spec. */
const MODELS: { label: string; spec: VizSpec }[] = [
  {
    label: 'Projectile',
    spec: {
      type: 'projectile',
      title: 'Projectile motion',
      speed: 22,
      angle: 50,
      gravity: 9.8,
      height: 0,
      notes:
        'Range peaks near 45°; push the angle past it and the arc climbs higher but lands shorter. Swap to the Moon and watch the whole flight stretch out.',
    },
  },
  {
    label: 'Spring (SHM)',
    spec: {
      type: 'wave-oscillator',
      title: 'Simple harmonic motion',
      mass: 1,
      springConstant: 20,
      amplitude: 2,
      notes:
        'A stiffer spring or a lighter mass shortens the period — but amplitude does not change it. Watch the speed peak at the middle and vanish at the turning points.',
    },
  },
  {
    label: "Ohm's law",
    spec: {
      type: 'circuit-diagram',
      title: "Ohm's law",
      voltage: 12,
      resistance: 60,
      notes:
        'Current is voltage over resistance: raise the voltage and charge flows faster; raise the resistance and it slows. Power — the resistor’s glow — climbs with V².',
    },
  },
  {
    label: 'Inclined plane',
    spec: {
      type: 'free-body-diagram',
      title: 'Block on an incline',
      angle: 30,
      mass: 2,
      friction: 0.2,
      gravity: 9.8,
      notes:
        'The block only slides once tan θ beats μ. Below that, static friction exactly cancels the pull down the slope and nothing moves.',
    },
  },
  {
    label: 'Circular motion',
    spec: {
      type: 'circular-motion',
      title: 'Uniform circular motion',
      radius: 5,
      speed: 10,
      notes:
        'Velocity stays tangent to the circle while acceleration points dead at the centre. Centripetal acceleration grows with v² and shrinks as the radius widens.',
    },
  },
];

/** Run the right deterministic gate for the spec's type. */
function validate(spec: VizSpec) {
  switch (spec.type) {
    case 'projectile':
      return validateProjectile(spec);
    case 'wave-oscillator':
      return validateShm(spec);
    case 'circuit-diagram':
      return validateCircuit(spec);
    case 'free-body-diagram':
      return validateIncline(spec);
    case 'circular-motion':
      return validateCircular(spec);
    default:
      return validateFunctionGrapher(spec);
  }
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'spec'; spec: VizSpec; concept: string }
  | { kind: 'unsupported'; concept: string; reason: string }
  | { kind: 'invalid'; concept: string; reason: string }
  | { kind: 'error'; message: string };

/** Pick the initial model from the hash (#/try/<spec-type>), else the first. */
function modelFromHash(): VizSpec {
  const m =
    typeof window !== 'undefined' ? window.location.hash.match(/^#\/try\/(.+)$/) : null;
  const key = m ? decodeURIComponent(m[1]) : '';
  return (MODELS.find((x) => x.spec.type === key) ?? MODELS[0]).spec;
}

export default function VisualizePanel() {
  // Show a model right away so the surface is never an empty stage. The topics
  // page deep-links a specific one via #/try/<spec-type>; otherwise the first.
  const [state, setState] = useState<State>(() => {
    const spec = modelFromHash();
    return { kind: 'spec', spec, concept: spec.title };
  });

  // Kept for the spec backend (and the offline "render the example" path): turn a
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
          <p className="viz__topic">{topic || 'Interactive model'}</p>
        </div>
        <a className="viz__topicsbtn" href="#/topics">all topics</a>
      </header>

      <div className="viz__stage">
        {state.kind === 'idle' && <div className="viz__empty">Your interactive visual appears here.</div>}

        {state.kind === 'loading' && <div className="viz__empty">Generating a spec…</div>}

        {state.kind === 'spec' &&
          (MODEL_TYPES.has(state.spec.type) ? (
            // The model fills the stage; it carries its own labels, so no
            // outer caption/notes (which would force the page to scroll).
            <div className="viz__result viz__result--model">{renderModel(state.spec)}</div>
          ) : (
            <figure className="viz__result">
              <figcaption className="viz__caption">{state.spec.title}</figcaption>
              {state.spec.type === 'function-grapher' && <FunctionGrapher spec={state.spec} />}
              <p className="viz__notes">{state.spec.notes}</p>
            </figure>
          ))}

        {state.kind === 'unsupported' && (
          <div className="viz__fallback">
            <b>No interactive visual for “{state.concept}” yet.</b>
            <p>{state.reason}</p>
            <p className="viz__muted">
              This is a logged coverage gap — the current build covers single-variable functions,
              projectile motion, simple harmonic motion, Ohm's law, inclined planes, and circular
              motion. More spec types (3D surfaces, vector fields, molecules) come next.
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
              <code> vercel dev</code> or deploy to use it live. Meanwhile, pick a topic above to
              explore a worked example rendered by the same widget + validator.
            </p>
            <button
              className="viz__chip"
              onClick={() => acceptResponse({ supported: true, concept: MODELS[0].spec.title, spec: MODELS[0].spec, unsupportedReason: '' })}
            >
              Render the example
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Render the interactive model widget for a model-type spec. */
function renderModel(spec: VizSpec) {
  switch (spec.type) {
    case 'projectile':
      return <ProjectileSim spec={spec} />;
    case 'wave-oscillator':
      return <ShmSim spec={spec} />;
    case 'circuit-diagram':
      return <CircuitSim spec={spec} />;
    case 'free-body-diagram':
      return <InclineSim spec={spec} />;
    case 'circular-motion':
      return <CircularSim spec={spec} />;
    default:
      return null;
  }
}
