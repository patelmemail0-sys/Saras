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
import { validateFunctionGrapher } from './validate.ts';
import type { FunctionGrapherSpec, SpecResponse } from './spec.ts';
import './visualize.css';

const EXAMPLES = ['y = x^2', 'a sine wave', 'exponential growth', 'a damped oscillation'];

const EXAMPLE_SPEC: FunctionGrapherSpec = {
  type: 'function-grapher',
  title: 'Damped oscillation',
  expression: 'A * exp(-k * x) * cos(w * x)',
  xLabel: 'time',
  yLabel: 'displacement',
  domain: { min: 0, max: 12 },
  parameters: [
    { name: 'A', label: 'amplitude A', default: 1, min: 0.1, max: 2, step: 0.1 },
    { name: 'k', label: 'damping k', default: 0.3, min: 0, max: 1, step: 0.05 },
    { name: 'w', label: 'angular freq ω', default: 3, min: 0.5, max: 8, step: 0.1 },
  ],
  notes: 'Raise damping k to watch the envelope decay faster; ω sets how many wiggles fit in the window.',
};

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'spec'; spec: FunctionGrapherSpec; concept: string }
  | { kind: 'unsupported'; concept: string; reason: string }
  | { kind: 'invalid'; concept: string; reason: string }
  | { kind: 'error'; message: string };

export default function VisualizePanel() {
  const [input, setInput] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function submit(text: string) {
    const q = text.trim();
    if (!q) return;
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/spec', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: q }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Backend returned ${res.status}. ${detail.slice(0, 140)}`);
      }
      const data = (await res.json()) as SpecResponse;
      acceptResponse(data);
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Request failed.' });
    }
  }

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
    const check = validateFunctionGrapher(data.spec);
    if (!check.valid) {
      setState({ kind: 'invalid', concept: data.concept, reason: check.reason ?? 'Failed validation.' });
      return;
    }
    setState({ kind: 'spec', spec: data.spec, concept: data.concept });
  }

  return (
    <div className="viz">
      <header className="viz__head">
        <div className="viz__title"><b>Saras</b> · visualize</div>
        <a className="viz__back" href="#/">← home</a>
      </header>

      <p className="viz__lede">
        Paste a concept or formula. If it's a single-variable function, you get an
        interactive graph you can push around.
      </p>

      <form
        className="viz__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <textarea
          className="viz__input"
          placeholder="e.g. y = a·sin(b·x), exponential decay, the logistic function…"
          value={input}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(input);
          }}
        />
        <button className="viz__go" type="submit" disabled={state.kind === 'loading'}>
          {state.kind === 'loading' ? 'Thinking…' : 'Visualize'}
        </button>
      </form>

      <div className="viz__examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="viz__chip" onClick={() => { setInput(ex); submit(ex); }}>
            {ex}
          </button>
        ))}
      </div>

      <div className="viz__stage">
        {state.kind === 'idle' && (
          <div className="viz__empty">Your interactive visual appears here.</div>
        )}

        {state.kind === 'loading' && <div className="viz__empty">Generating a spec…</div>}

        {state.kind === 'spec' && (
          <figure className="viz__result">
            <figcaption className="viz__caption">{state.spec.title}</figcaption>
            <FunctionGrapher spec={state.spec} />
            <p className="viz__notes">{state.spec.notes}</p>
          </figure>
        )}

        {state.kind === 'unsupported' && (
          <div className="viz__fallback">
            <b>No interactive visual for “{state.concept}” yet.</b>
            <p>{state.reason}</p>
            <p className="viz__muted">
              This is a logged coverage gap — the first build covers single-variable
              functions. More spec types (3D surfaces, vector fields, molecules) come next.
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
