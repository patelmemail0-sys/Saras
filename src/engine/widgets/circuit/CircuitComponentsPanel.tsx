/**
 * Components + measurement panel for the circuit builder. Shows the source
 * control, total delivered current/power, a per-component table (V/I/P, plus a
 * battery's terminal voltage), the selected-component editor (resistance, or EMF
 * + internal resistance for a battery), the node-voltage list, and the live
 * probe readout (voltmeter ΔV, ammeter I, ohmmeter R_eq). Every value is read
 * from the solver's SolveResult / equivalentResistance — nothing is recomputed.
 */
import type { NetComponent, SolveResult } from '../../circuitNetwork.ts';
import { equivalentResistance } from '../../circuitNetwork.ts';
import { fmt } from '../../format.ts';
import { nodeLabel } from './grid.ts';
import type { Tool } from './CircuitEditor2D.tsx';

const TYPE_LABEL: Record<NetComponent['type'], string> = {
  resistor: 'Resistor',
  battery: 'Battery',
  wire: 'Wire',
  switch: 'Switch',
};

export default function CircuitComponentsPanel({
  components,
  solve,
  selectedId,
  tool,
  groundNode,
  probeNodes,
  probeBranch,
  onChange,
  onSelect,
}: {
  components: NetComponent[];
  solve: SolveResult;
  selectedId: string | null;
  tool: Tool;
  groundNode: string | null;
  probeNodes: string[];
  probeBranch: string | null;
  onChange: (c: NetComponent[]) => void;
  onSelect: (id: string | null) => void;
}) {
  const setField = (id: string, patch: Partial<NetComponent>) =>
    onChange(components.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => {
    onChange(components.filter((c) => c.id !== id));
    if (selectedId === id) onSelect(null);
  };

  const firstBattery = components.find((c) => c.type === 'battery');
  const res = (id: string) => (solve.ok ? solve.components[id] : null);
  const cell = (n: number | null | undefined) => (n == null ? '—' : fmt(n));

  const activeNodes = Array.from(new Set(components.flatMap((c) => [c.a, c.b]))).sort((x, y) =>
    nodeLabel(x).localeCompare(nodeLabel(y)),
  );

  return (
    <div className="eqp cbp">
      <div className="eqp__head">Circuit</div>

      {firstBattery && (
        <div className="cbp__source">
          <label className="cbp__source-label" htmlFor="cbp-source">
            source <b>{fmt(firstBattery.value)} V</b>
          </label>
          <input
            id="cbp-source"
            type="range"
            min={0}
            max={48}
            step={0.5}
            value={firstBattery.value}
            onChange={(e) => setField(firstBattery.id, { value: Number(e.target.value) })}
          />
        </div>
      )}

      {solve.ok ? (
        <p className="cbp__totals">
          delivering <b>{fmt(solve.sourceCurrent)}</b> A · <b>{fmt(solve.sourcePower)}</b> W
        </p>
      ) : (
        <p className="cbp__status">{solve.reason}</p>
      )}

      {/* measurement readout (the probe answer) */}
      {(tool === 'volt' || tool === 'ammeter' || tool === 'ohm' || tool === 'ground') && (
        <div className="cbp__probe">
          {measurement(tool, components, solve, probeNodes, probeBranch, groundNode)}
        </div>
      )}

      <div className="cbp__table">
        <div className="cbp__row cbp__row--head">
          <span>Component</span>
          <span>V</span>
          <span>I</span>
          <span>P</span>
        </div>
        {components.length === 0 && <p className="eqp__note">Empty — add a battery and a resistor.</p>}
        {components.map((c) => {
          const r = res(c.id);
          const on = c.id === selectedId;
          const rated = c.type === 'resistor' || c.type === 'battery';
          const vCell =
            c.type === 'wire' ? '—'
            : c.type === 'switch' ? (c.open ? cell(r?.v) : '—')
            : c.type === 'battery' ? cell(r?.terminalV ?? r?.v)
            : cell(r?.v);
          const iCell =
            c.type === 'wire' ? '—'
            : c.type === 'switch' ? (c.open ? '0' : cell(r?.i))
            : cell(r?.i);
          const pCell = c.type === 'wire' || c.type === 'switch' ? '—' : cell(r?.p);
          return (
            <button type="button" key={c.id} className={`cbp__row${on ? ' cbp__row--on' : ''}`} onClick={() => onSelect(on ? null : c.id)}>
              <span className="cbp__name">
                {TYPE_LABEL[c.type]}
                {rated && (
                  <b>
                    {' '}
                    {fmt(c.value)} {c.type === 'resistor' ? 'Ω' : 'V'}
                  </b>
                )}
                {c.type === 'switch' && <i className="cbp__state">{c.open ? ' · open' : ' · closed'}</i>}
              </span>
              <span>{vCell}</span>
              <span>{iCell}</span>
              <span>{pCell}</span>
            </button>
          );
        })}
      </div>

      {selectedId &&
        (() => {
          const c = components.find((x) => x.id === selectedId);
          if (!c) return null;
          return (
            <div className="cbp__editor">
              <div className="cbp__editor-head">{TYPE_LABEL[c.type]}</div>
              {(c.type === 'resistor' || c.type === 'battery') && (
                <div className="cbp__field">
                  <span>{c.type === 'resistor' ? 'Resistance' : 'EMF'}</span>
                  <div className="cbp__num">
                    <input
                      type="number"
                      value={c.value}
                      min={c.type === 'resistor' ? 0.1 : undefined}
                      step={c.type === 'resistor' ? 1 : 0.5}
                      onChange={(e) => setField(c.id, { value: Number(e.target.value) })}
                    />
                    <span className="eqp__unit">{c.type === 'resistor' ? 'Ω' : 'V'}</span>
                  </div>
                </div>
              )}
              {c.type === 'battery' && (
                <div className="cbp__field">
                  <span>Internal r</span>
                  <div className="cbp__num">
                    <input
                      type="number"
                      value={c.internalResistance ?? 0}
                      min={0}
                      step={0.1}
                      onChange={(e) => setField(c.id, { internalResistance: Math.max(0, Number(e.target.value)) })}
                    />
                    <span className="eqp__unit">Ω</span>
                  </div>
                </div>
              )}
              {c.type === 'switch' && (
                <button
                  type="button"
                  className={`cbp__toggle${c.open ? ' cbp__toggle--open' : ''}`}
                  onClick={() => setField(c.id, { open: !c.open })}
                >
                  {c.open ? 'Close switch (conduct)' : 'Open switch (break)'}
                </button>
              )}
              <button type="button" className="cbp__del" onClick={() => remove(c.id)}>
                Delete
              </button>
            </div>
          );
        })()}

      {solve.ok && activeNodes.some((id) => solve.nodeV[id] != null) && (
        <div className="cbp__nodes">
          <div className="cbp__nodes-head">Node voltages</div>
          <div className="cbp__nodes-grid">
            {activeNodes
              .filter((id) => solve.nodeV[id] != null)
              .map((id) => (
                <span key={id} className="cbp__node">
                  <b>{nodeLabel(id)}</b> {fmt(solve.nodeV[id])} V{id === groundNode ? ' · ref' : ''}
                </span>
              ))}
          </div>
        </div>
      )}

      <p className="eqp__note">
        Build with the tools; measure with Ground / Voltmeter / Ammeter / Ohmmeter. Each
        resistor shows its own V, I, P; toggle node V and branch I on the schematic.
      </p>
    </div>
  );
}

/** The live probe answer for the active measurement tool. */
function measurement(
  tool: Tool,
  components: NetComponent[],
  solve: SolveResult,
  probeNodes: string[],
  probeBranch: string | null,
  groundNode: string | null,
) {
  if (tool === 'ground') {
    return (
      <p className="cbp__probe-hint">
        {groundNode
          ? `Reference: ${nodeLabel(groundNode)} = 0 V. Click it again to clear.`
          : 'Click a node to set the 0 V reference.'}
      </p>
    );
  }
  if (tool === 'volt') {
    if (probeNodes.length < 2) return <p className="cbp__probe-hint">Voltmeter: click two nodes.</p>;
    const [n0, n1] = probeNodes;
    if (!solve.ok) return <p className="cbp__probe-hint">—</p>;
    const dv = (solve.nodeV[n0] ?? 0) - (solve.nodeV[n1] ?? 0);
    return (
      <p className="cbp__probe-val">
        V<sub>{nodeLabel(n0)}</sub> − V<sub>{nodeLabel(n1)}</sub> = <b>{fmt(dv)} V</b>
      </p>
    );
  }
  if (tool === 'ammeter') {
    if (!probeBranch) return <p className="cbp__probe-hint">Ammeter: click a branch.</p>;
    const c = components.find((x) => x.id === probeBranch);
    const r = solve.ok ? solve.components[probeBranch] : null;
    if (!c || !r || r.i == null) return <p className="cbp__probe-hint">—</p>;
    const iab = c.type === 'battery' ? -r.i : r.i; // a→b branch current
    const dir = iab >= 0 ? `${nodeLabel(c.a)} → ${nodeLabel(c.b)}` : `${nodeLabel(c.b)} → ${nodeLabel(c.a)}`;
    return (
      <p className="cbp__probe-val">
        I = <b>{fmt(Math.abs(iab))} A</b> <span className="cbp__dir">({dir})</span>
      </p>
    );
  }
  // ohm
  if (probeNodes.length < 2) return <p className="cbp__probe-hint">Ohmmeter: click two nodes.</p>;
  const [n0, n1] = probeNodes;
  const req = equivalentResistance({ components }, n0, n1);
  return (
    <p className="cbp__probe-val">
      R<sub>{nodeLabel(n0)},{nodeLabel(n1)}</sub> = <b>{req == null ? '∞ (open)' : `${fmt(req)} Ω`}</b>
    </p>
  );
}
