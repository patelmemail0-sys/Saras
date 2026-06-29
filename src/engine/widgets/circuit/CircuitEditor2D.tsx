/**
 * 2D schematic editor for the circuit builder. An SVG grid where the student
 * places resistors, wires, and a battery, drags endpoints to rewire, selects
 * components to edit/delete, AND measures the circuit: set a ground/reference,
 * read node voltages and branch currents (toggles), and place a voltmeter (ΔV
 * between two nodes), ammeter (current through a branch), or ohmmeter (R_eq
 * between two nodes). The component array IS the netlist; every value read here
 * comes from the one SolveResult — nothing is recomputed.
 *
 * Controlled component: CircuitSim owns components / tool / selection / probes;
 * this editor holds only transient pixel drag state and commits ONE components
 * change on pointerup (solve-on-drop).
 */
import { useRef, useState } from 'react';
import type { NetComponent, ComponentType, SolveResult } from '../../circuitNetwork.ts';
import { fmt } from '../../format.ts';
import { GRID, NODE_R, VIEW_W, VIEW_H, nodeId, nodeXY, nearestNode } from './grid.ts';

export type Tool =
  | 'select'
  | 'wire'
  | 'resistor'
  | 'battery'
  | 'switch'
  | 'delete'
  | 'ground'
  | 'volt'
  | 'ammeter'
  | 'ohm';

const BUILD_TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'wire', label: 'Wire' },
  { id: 'resistor', label: 'Resistor' },
  { id: 'battery', label: 'Battery' },
  { id: 'switch', label: 'Switch' },
  { id: 'delete', label: 'Delete' },
];
const MEASURE_TOOLS: { id: Tool; label: string }[] = [
  { id: 'ground', label: 'Ground' },
  { id: 'volt', label: 'Voltmeter' },
  { id: 'ammeter', label: 'Ammeter' },
  { id: 'ohm', label: 'Ohmmeter' },
];

const HINTS: Record<Tool, string> = {
  select: 'Click a component to edit; click a switch to flip it; drag its ends to rewire.',
  wire: 'Drag between two dots to place a wire.',
  resistor: 'Drag between two dots to place a resistor.',
  battery: 'Drag between two dots to place a battery.',
  switch: 'Drag between two dots to place a switch; click it to open/close.',
  delete: 'Click a component to remove it.',
  ground: 'Click a node to make it 0 V (the reference).',
  volt: 'Click two nodes to read the voltage between them.',
  ammeter: 'Click a branch to read the current through it.',
  ohm: 'Click two nodes to read the resistance between them.',
};

const DEFAULT_VALUE: Record<ComponentType, number> = { resistor: 100, battery: 9, wire: 0, switch: 0 };
const HIT = 12; // px hit-test radius for a component
const HANDLE = 11; // px radius for endpoint handles
const isPlace = (t: Tool): t is ComponentType =>
  t === 'wire' || t === 'resistor' || t === 'battery' || t === 'switch';

let _uid = 0;
const uid = () => `c${++_uid}`;

type Pt = { x: number; y: number };
type Drag =
  | { kind: 'place'; type: ComponentType; anchor: string; cursor: Pt }
  | { kind: 'endpoint'; id: string; end: 'a' | 'b'; cursor: Pt }
  | null;

function toLocal(svg: SVGSVGElement, clientX: number, clientY: number): Pt | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export default function CircuitEditor2D({
  components,
  solve,
  tool,
  selectedId,
  groundNode,
  showNodeV,
  showBranchI,
  probeNodes,
  probeBranch,
  onTool,
  onChange,
  onSelect,
  onToggleNodeV,
  onToggleBranchI,
  onSetGround,
  onProbeNode,
  onProbeBranch,
}: {
  components: NetComponent[];
  solve: SolveResult;
  tool: Tool;
  selectedId: string | null;
  groundNode: string | null;
  showNodeV: boolean;
  showBranchI: boolean;
  probeNodes: string[];
  probeBranch: string | null;
  onTool: (t: Tool) => void;
  onChange: (c: NetComponent[]) => void;
  onSelect: (id: string | null) => void;
  onToggleNodeV: () => void;
  onToggleBranchI: () => void;
  onSetGround: (node: string) => void;
  onProbeNode: (node: string) => void;
  onProbeBranch: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>(null);

  // Nodes referenced by at least one component (the only meaningful probe points).
  const active = new Set<string>();
  for (const c of components) {
    active.add(c.a);
    active.add(c.b);
  }
  const pickActiveNode = (p: Pt): string | null => {
    const node = nearestNode(p.x, p.y);
    return node && active.has(node) ? node : null;
  };

  const componentAt = (p: Pt): string | null => {
    let best: string | null = null;
    let bestD = HIT;
    for (const c of components) {
      const d = segDist(p, nodeXY(c.a), nodeXY(c.b));
      if (d < bestD) {
        bestD = d;
        best = c.id;
      }
    }
    return best;
  };

  const capture = (svg: SVGSVGElement, id: number) => {
    try {
      svg.setPointerCapture(id);
    } catch {
      /* some pointers can't be captured; the drag still works on the svg */
    }
  };

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const p = toLocal(svg, e.clientX, e.clientY);
    if (!p) return;

    // Endpoint handles take priority when a component is selected.
    if (tool === 'select' && selectedId) {
      const sel = components.find((c) => c.id === selectedId);
      if (sel) {
        if (Math.hypot(p.x - nodeXY(sel.a).x, p.y - nodeXY(sel.a).y) < HANDLE) {
          capture(svg, e.pointerId);
          setDrag({ kind: 'endpoint', id: sel.id, end: 'a', cursor: p });
          return;
        }
        if (Math.hypot(p.x - nodeXY(sel.b).x, p.y - nodeXY(sel.b).y) < HANDLE) {
          capture(svg, e.pointerId);
          setDrag({ kind: 'endpoint', id: sel.id, end: 'b', cursor: p });
          return;
        }
      }
    }

    if (tool === 'select') {
      const hit = componentAt(p);
      // A switch's primary action is to flip — clicking it toggles open/closed.
      if (hit) {
        const c = components.find((x) => x.id === hit);
        if (c?.type === 'switch') onChange(components.map((x) => (x.id === hit ? { ...x, open: !x.open } : x)));
      }
      return onSelect(hit);
    }
    if (tool === 'delete') {
      const hit = componentAt(p);
      if (hit) {
        onChange(components.filter((c) => c.id !== hit));
        if (selectedId === hit) onSelect(null);
      }
      return;
    }
    if (tool === 'ground' || tool === 'volt' || tool === 'ohm') {
      const node = pickActiveNode(p);
      if (node) (tool === 'ground' ? onSetGround : onProbeNode)(node);
      return;
    }
    if (tool === 'ammeter') {
      const hit = componentAt(p);
      if (hit) onProbeBranch(hit);
      return;
    }
    // place tools (wire / resistor / battery / switch)
    if (isPlace(tool)) {
      const node = nearestNode(p.x, p.y);
      if (node) {
        capture(svg, e.pointerId);
        setDrag({ kind: 'place', type: tool, anchor: node, cursor: p });
      }
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const svg = svgRef.current;
    if (!svg) return;
    const p = toLocal(svg, e.clientX, e.clientY);
    if (p) setDrag({ ...drag, cursor: p });
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (svg && svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    if (!drag) return;
    const p = svg ? toLocal(svg, e.clientX, e.clientY) ?? drag.cursor : drag.cursor;
    const target = nearestNode(p.x, p.y);
    if (drag.kind === 'place' && target && target !== drag.anchor) {
      const c: NetComponent = { id: uid(), type: drag.type, a: drag.anchor, b: target, value: DEFAULT_VALUE[drag.type] };
      onChange([...components, c]);
      onSelect(c.id);
    } else if (drag.kind === 'endpoint' && target) {
      const c = components.find((x) => x.id === drag.id);
      if (c) {
        const other = drag.end === 'a' ? c.b : c.a;
        if (target !== other) onChange(components.map((x) => (x.id === drag.id ? { ...x, [drag.end]: target } : x)));
      }
    }
    setDrag(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
      onChange(components.filter((c) => c.id !== selectedId));
      onSelect(null);
    }
  }

  const dragTarget = drag ? nearestNode(drag.cursor.x, drag.cursor.y) : null;
  const nodeV = solve.ok ? solve.nodeV : null;
  const probeSet = new Set(probeNodes);

  return (
    <div className="cb">
      <div className="cb__toolbar" role="toolbar" aria-label="Circuit tools">
        {BUILD_TOOLS.map((t) => (
          <button key={t.id} type="button" className={`cb__tool${tool === t.id ? ' cb__tool--on' : ''}`} onClick={() => onTool(t.id)}>
            {t.label}
          </button>
        ))}
        <span className="cb__div" />
        {MEASURE_TOOLS.map((t) => (
          <button key={t.id} type="button" className={`cb__tool cb__tool--m${tool === t.id ? ' cb__tool--on' : ''}`} onClick={() => onTool(t.id)}>
            {t.label}
          </button>
        ))}
        <span className="cb__div" />
        <button type="button" className={`cb__tool${showNodeV ? ' cb__tool--on' : ''}`} onClick={onToggleNodeV}>
          node V
        </button>
        <button type="button" className={`cb__tool${showBranchI ? ' cb__tool--on' : ''}`} onClick={onToggleBranchI}>
          branch I
        </button>
      </div>
      <div className="cb__hint">{HINTS[tool]}</div>

      <svg
        ref={svgRef}
        className="ps__svg cb__svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Circuit editor"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <defs>
          <filter id="cb-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* grid nodes (+ optional node-voltage labels) */}
        {Array.from({ length: GRID.cols }).map((_, c) =>
          Array.from({ length: GRID.rows }).map((__, r) => {
            const id = nodeId(c, r);
            const { x, y } = nodeXY(id);
            const on = active.has(id);
            return (
              <g key={id}>
                <circle
                  cx={x}
                  cy={y}
                  r={id === dragTarget ? NODE_R + 2 : NODE_R}
                  className={`cb__node${on ? ' cb__node--on' : ''}${id === dragTarget ? ' cb__node--target' : ''}`}
                />
                {probeSet.has(id) && <circle cx={x} cy={y} r={9} className="cb__probe-ring" />}
                {showNodeV && on && nodeV && nodeV[id] != null && (
                  <text x={x + 8} y={y - 7} className="cb__nlabel">{fmt(nodeV[id])} V</text>
                )}
              </g>
            );
          }),
        )}

        {/* ground reference glyph */}
        {groundNode && active.has(groundNode) && <GroundGlyph at={nodeXY(groundNode)} />}

        {/* components */}
        {components.map((c) => (
          <CircuitComponentSvg
            key={c.id}
            c={c}
            solve={solve}
            selected={c.id === selectedId}
            probed={c.id === probeBranch}
            showBranchI={showBranchI}
          />
        ))}

        {/* rubber-band preview */}
        {drag && (
          <line
            x1={drag.kind === 'place' ? nodeXY(drag.anchor).x : nodeXY(theFixed(components, drag)).x}
            y1={drag.kind === 'place' ? nodeXY(drag.anchor).y : nodeXY(theFixed(components, drag)).y}
            x2={drag.cursor.x}
            y2={drag.cursor.y}
            className="cb__rubber"
          />
        )}
      </svg>
    </div>
  );
}

/** The fixed (non-dragged) endpoint of an endpoint-drag. */
function theFixed(components: NetComponent[], drag: Exclude<Drag, null>): string {
  if (drag.kind === 'place') return drag.anchor;
  const c = components.find((x) => x.id === drag.id);
  if (!c) return drag.id;
  return drag.end === 'a' ? c.b : c.a;
}

function GroundGlyph({ at }: { at: Pt }) {
  const y = at.y + 11;
  return (
    <g className="cb__gnd">
      <line x1={at.x} y1={at.y} x2={at.x} y2={y} />
      <line x1={at.x - 8} y1={y} x2={at.x + 8} y2={y} />
      <line x1={at.x - 5} y1={y + 3} x2={at.x + 5} y2={y + 3} />
      <line x1={at.x - 2} y1={y + 6} x2={at.x + 2} y2={y + 6} />
    </g>
  );
}

function CircuitComponentSvg({
  c,
  solve,
  selected,
  probed,
  showBranchI,
}: {
  c: NetComponent;
  solve: SolveResult;
  selected: boolean;
  probed: boolean;
  showBranchI: boolean;
}) {
  const A = nodeXY(c.a);
  const B = nodeXY(c.b);
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const ang = Math.atan2(B.y - A.y, B.x - A.x);
  const angDeg = (ang * 180) / Math.PI;
  const len = Math.hypot(B.x - A.x, B.y - A.y);
  const perp = { x: -Math.sin(ang), y: Math.cos(ang) };
  const res = solve.ok ? solve.components[c.id] : null;
  const sel = selected ? ' cb__sel' : '';

  // Branch-current arrow (resistors + wires) pointing in the current's direction.
  const arrow =
    showBranchI && c.type !== 'battery' && res && res.i != null && Math.abs(res.i) > 1e-4 ? (
      <BranchArrow mid={mid} ang={ang} dir={res.i >= 0 ? 1 : -1} />
    ) : null;

  if (c.type === 'wire') {
    return (
      <g>
        <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} className={`cb__wire${sel}${probed ? ' cb__probed' : ''}`} />
        {arrow}
        {showBranchI && res && res.i != null && Math.abs(res.i) > 1e-4 && (
          <text x={mid.x + perp.x * 13} y={mid.y + perp.y * 13} className="cb__lbl cb__lbl--mid cb__lbl--val">
            {fmt(Math.abs(res.i))} A
          </text>
        )}
        {selected && <Handles A={A} B={B} />}
      </g>
    );
  }

  if (c.type === 'battery') {
    const bodyHalf = 5;
    return (
      <g>
        <g transform={`translate(${mid.x} ${mid.y}) rotate(${angDeg})`}>
          <line x1={-len / 2} y1={0} x2={-bodyHalf} y2={0} className="cb__lead" />
          <line x1={bodyHalf} y1={0} x2={len / 2} y2={0} className="cb__lead" />
          <line x1={-bodyHalf} y1={-13} x2={-bodyHalf} y2={13} className={`cb__plate cb__plate--lg${sel}`} />
          <line x1={bodyHalf} y1={-7} x2={bodyHalf} y2={7} className={`cb__plate${sel}`} />
        </g>
        <text x={mid.x + perp.x * 18} y={mid.y + perp.y * 18} className="cb__lbl cb__lbl--mid">{fmt(c.value)} V</text>
        {selected && <Handles A={A} B={B} />}
      </g>
    );
  }

  if (c.type === 'switch') {
    const open = !!c.open;
    const g = Math.min(13, Math.max(8, len * 0.2)); // half-gap between the contacts
    // Blade pivots at the left contact; lifts off the right contact when open.
    const bx = open ? g * 0.2 : g;
    const by = open ? -g * 1.15 : 0;
    return (
      <g>
        <g transform={`translate(${mid.x} ${mid.y}) rotate(${angDeg})`}>
          <line x1={-len / 2} y1={0} x2={-g} y2={0} className="cb__lead" />
          <line x1={g} y1={0} x2={len / 2} y2={0} className="cb__lead" />
          <circle cx={-g} cy={0} r={2.6} className="cb__sw-dot" />
          <circle cx={g} cy={0} r={2.6} className="cb__sw-dot" />
          <line x1={-g} y1={0} x2={bx} y2={by} className={`cb__sw${open ? ' cb__sw--open' : ''}${sel}`} />
        </g>
        {open && <text x={mid.x - perp.x * 16} y={mid.y - perp.y * 16} className="cb__lbl cb__lbl--mid cb__lbl--open">open</text>}
        {!open && arrow}
        {!open && showBranchI && res && res.i != null && Math.abs(res.i) > 1e-4 && (
          <text x={mid.x + perp.x * 16} y={mid.y + perp.y * 16} className="cb__lbl cb__lbl--mid cb__lbl--val">
            {fmt(Math.abs(res.i))} A
          </text>
        )}
        {selected && <Handles A={A} B={B} />}
      </g>
    );
  }

  // resistor
  const bodyW = Math.max(20, Math.min(40, len - 18));
  const glow = res && res.p != null ? res.p / (res.p + 8) : 0;
  return (
    <g>
      <g transform={`translate(${mid.x} ${mid.y}) rotate(${angDeg})`}>
        <line x1={-len / 2} y1={0} x2={-bodyW / 2} y2={0} className="cb__lead" />
        <line x1={bodyW / 2} y1={0} x2={len / 2} y2={0} className="cb__lead" />
        <rect x={-bodyW / 2 - 3} y={-12} width={bodyW + 6} height={24} rx={6} className="cb__rglow" filter="url(#cb-glow)" style={{ opacity: 0.1 + 0.7 * glow }} />
        <rect x={-bodyW / 2} y={-9} width={bodyW} height={18} rx={4} className={`cb__chip${sel}${probed ? ' cb__probed' : ''}`} />
        <path d={zigzag(-bodyW / 2 + 3, bodyW / 2 - 3)} className="cb__zig" />
      </g>
      {arrow}
      <text x={mid.x - perp.x * 16} y={mid.y - perp.y * 16} className="cb__lbl cb__lbl--mid">{fmt(c.value)} Ω</text>
      {showBranchI && res && res.i != null && Math.abs(res.i) > 1e-4 && (
        <text x={mid.x + perp.x * 16} y={mid.y + perp.y * 16} className="cb__lbl cb__lbl--mid cb__lbl--val">
          {fmt(Math.abs(res.i))} A
        </text>
      )}
      {selected && <Handles A={A} B={B} />}
    </g>
  );
}

/** A small filled arrowhead at `mid`, pointing along the segment in `dir` (±1). */
function BranchArrow({ mid, ang, dir }: { mid: Pt; ang: number; dir: number }) {
  const fx = Math.cos(ang) * dir;
  const fy = Math.sin(ang) * dir;
  const px = -Math.sin(ang);
  const py = Math.cos(ang);
  const tip = { x: mid.x + fx * 8, y: mid.y + fy * 8 };
  const b1 = { x: mid.x - fx * 2 + px * 5, y: mid.y - fy * 2 + py * 5 };
  const b2 = { x: mid.x - fx * 2 - px * 5, y: mid.y - fy * 2 - py * 5 };
  return <path d={`M${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L${b1.x.toFixed(1)} ${b1.y.toFixed(1)} L${b2.x.toFixed(1)} ${b2.y.toFixed(1)} Z`} className="cb__iarrow" />;
}

function Handles({ A, B }: { A: Pt; B: Pt }) {
  return (
    <>
      <circle cx={A.x} cy={A.y} r={6} className="cb__handle" />
      <circle cx={B.x} cy={B.y} r={6} className="cb__handle" />
    </>
  );
}

/** A resistor zigzag along the x-axis in the local (rotated) frame. */
function zigzag(x1: number, x2: number, zig = 6, amp = 6): string {
  const len = x2 - x1;
  const seg = len / zig;
  let d = `M${x1} 0 `;
  for (let i = 1; i < zig; i++) d += `L${(x1 + seg * i).toFixed(1)} ${i % 2 ? -amp : amp} `;
  d += `L${x2} 0`;
  return d;
}
