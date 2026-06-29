/**
 * Circuit builder — an interactive DC-circuit sandbox that answers college-level
 * questions. Place resistors, wires, and batteries (with internal resistance) on
 * a 2D schematic; set a ground/reference; read node voltages, branch currents,
 * terminal voltages, and power; and probe with a voltmeter (ΔV between two
 * points), ammeter (current through a branch), or ohmmeter (R_eq between two
 * points). Flip to the 3D view to watch charges flow through the real network.
 *
 * All electrical values come from solveCircuit (circuitNetwork.ts) — Modified
 * Nodal Analysis, the deterministic correctness gate. The 2D editor, the panel,
 * and the 3D view all read that one SolveResult; nothing recomputes physics.
 */
import { useMemo, useState } from 'react';
import { solveCircuit, type NetComponent } from '../circuitNetwork.ts';
import { parseCircuitProblem } from '../wordProblems.ts';
import WordProblemBar from '../WordProblemBar.tsx';
import type { CircuitSpec } from '../spec.ts';
import { hasWebGL } from './three/hasWebGL.ts';
import { useReducedMotion } from './three/useReducedMotion.ts';
import { PALETTE } from './three/materials.ts';
import CircuitEditor2D, { type Tool } from './circuit/CircuitEditor2D.tsx';
import CircuitScene3D from './circuit/CircuitScene3D.tsx';
import CircuitComponentsPanel from './circuit/CircuitComponentsPanel.tsx';

const WP_EXAMPLE = 'A 12 V battery drives a 60 Ω resistor. How much current flows, and what power is dissipated?';

/** Seed the same simple loop the old widget showed: battery + resistor + 2 wires. */
function seedCircuit(spec: CircuitSpec): NetComponent[] {
  return [
    { id: 'bat', type: 'battery', a: 'n2_1', b: 'n2_4', value: spec.voltage },
    { id: 'r1', type: 'resistor', a: 'n6_1', b: 'n6_4', value: spec.resistance },
    { id: 'w1', type: 'wire', a: 'n2_1', b: 'n6_1', value: 0 },
    { id: 'w2', type: 'wire', a: 'n2_4', b: 'n6_4', value: 0 },
  ];
}

export default function CircuitSim({ spec }: { spec: CircuitSpec }) {
  const [components, setComponents] = useState<NetComponent[]>(() => seedCircuit(spec));
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'build' | 'view'>('build');
  // Charge flow auto-plays, except for reduced-motion users — the scene starts
  // still for them (matching the other models), and they can opt in via the button.
  const reduce = useReducedMotion();
  const [animating, setAnimating] = useState(!reduce);

  // Measurement state.
  const [groundNode, setGroundNode] = useState<string | null>(null);
  const [showNodeV, setShowNodeV] = useState(false);
  const [showBranchI, setShowBranchI] = useState(false);
  const [probeNodes, setProbeNodes] = useState<string[]>([]);
  const [probeBranch, setProbeBranch] = useState<string | null>(null);

  const [wpText, setWpText] = useState('');
  const [wpInfo, setWpInfo] = useState<{ found: string[] } | null>(null);

  const webgl = useMemo(() => hasWebGL(), []);
  const solve = useMemo(
    () => solveCircuit({ components }, groundNode ? { ground: groundNode } : undefined),
    [components, groundNode],
  );

  function pickTool(t: Tool) {
    setTool(t);
    setProbeNodes([]);
    setProbeBranch(null);
  }
  const setGround = (node: string) => setGroundNode((g) => (g === node ? null : node));
  const probeNode = (node: string) =>
    setProbeNodes((cur) => (cur.length >= 2 ? [node] : cur.includes(node) ? cur : [...cur, node]));

  function modelProblem() {
    const text = wpText.trim();
    if (!text) return;
    const parsed = parseCircuitProblem(text);
    setComponents((cs) => {
      const next = cs.map((c) => ({ ...c }));
      const bat = next.find((c) => c.type === 'battery');
      const r = next.find((c) => c.type === 'resistor');
      if (bat && parsed.base.V != null) bat.value = parsed.base.V;
      if (r && parsed.base.R != null) r.value = parsed.base.R;
      return next;
    });
    setWpInfo({ found: parsed.found });
  }

  return (
    <div className="pmodel">
      <WordProblemBar
        value={wpText}
        onChange={setWpText}
        onSubmit={modelProblem}
        onExample={() => setWpText(WP_EXAMPLE)}
        busy={false}
        placeholder="Word problem → seed: e.g. a 12 V battery drives a 60 Ω resistor."
        result={
          wpInfo &&
          (wpInfo.found.length ? (
            <p className="wp__result">Set {wpInfo.found.join(' · ')}</p>
          ) : (
            <p className="wp__result wp__result--warn">Couldn't find the numbers. Try “12 V battery, 60 Ω resistor”.</p>
          ))
        }
      />

      <div className="pmodel__body">
        <div className="pmodel__visual">
          <div className="ps">
            <div className="cb__modebar">
              <div className="cb__modes">
                <button type="button" className={`cb__mode${mode === 'build' ? ' cb__mode--on' : ''}`} onClick={() => setMode('build')}>
                  Build · 2D
                </button>
                <button type="button" className={`cb__mode${mode === 'view' ? ' cb__mode--on' : ''}`} onClick={() => setMode('view')} disabled={!webgl}>
                  View · 3D
                </button>
              </div>
              {mode === 'view' && webgl && (
                <button type="button" className="ps__play" onClick={() => setAnimating((a) => !a)}>
                  {animating ? '❚❚ pause flow' : '▶ play flow'}
                </button>
              )}
            </div>

            {mode === 'build' || !webgl ? (
              <CircuitEditor2D
                components={components}
                solve={solve}
                tool={tool}
                selectedId={selectedId}
                groundNode={groundNode}
                showNodeV={showNodeV}
                showBranchI={showBranchI}
                probeNodes={probeNodes}
                probeBranch={probeBranch}
                onTool={pickTool}
                onChange={setComponents}
                onSelect={setSelectedId}
                onToggleNodeV={() => setShowNodeV((v) => !v)}
                onToggleBranchI={() => setShowBranchI((v) => !v)}
                onSetGround={setGround}
                onProbeNode={probeNode}
                onProbeBranch={setProbeBranch}
              />
            ) : (
              <div className="ps__canvas">
                <CircuitScene3D
                  components={components}
                  solve={solve}
                  animating={animating}
                  showNodeV={showNodeV}
                  showBranchI={showBranchI}
                  groundNode={groundNode}
                  tool={tool}
                  probeNodes={probeNodes}
                  probeBranch={probeBranch}
                />
                <div className="ps__legend" aria-hidden="true">
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.azure }} /> wires & current flow</span>
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.azureWarm }} /> resistor <span className="cb__leg-note">(brighter = more power)</span></span>
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.chrome }} /> battery</span>
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.grid }} /> open switch <span className="cb__leg-note">(gap, no flow)</span></span>
                </div>
              </div>
            )}
          </div>
        </div>

        <CircuitComponentsPanel
          components={components}
          solve={solve}
          selectedId={selectedId}
          tool={tool}
          groundNode={groundNode}
          probeNodes={probeNodes}
          probeBranch={probeBranch}
          onChange={setComponents}
          onSelect={setSelectedId}
        />
      </div>
    </div>
  );
}
