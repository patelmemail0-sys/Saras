/**
 * Circuit network solver — the deterministic correctness gate for the interactive
 * circuit builder. Same role `circuitState`/`projectileKinematics` play in
 * validate.ts: a pure, closed-form physics module that is the single source of
 * truth shared by the 2D editor and the 3D view. Neither renderer recomputes
 * physics — both read this one `SolveResult`.
 *
 * It solves an arbitrary linear resistive network (resistors + ideal voltage
 * sources) by Modified Nodal Analysis (MNA):
 *   1. wires merge nodes (union-find) BEFORE any matrix, so a 0 Ω wire is a node
 *      merge, never an infinite conductance;
 *   2. degenerate circuits (no source, no loop, a short across the battery, a
 *      floating subgraph, a singular system) return a clean {ok:false} status —
 *      NEVER NaN/Infinity, so the renderer shows "—" rather than a wrong visual;
 *   3. otherwise the node voltages and source currents are solved exactly, and
 *      per-component V across / I through / P are derived.
 *
 * The single battery + single resistor netlist reproduces circuitState
 * (I = V/R, P = V²/R) — see the consistency note in the build/verify step.
 */

export type ComponentType = 'resistor' | 'wire' | 'battery' | 'switch';

/** A two-terminal component between two abstract node ids (a = +, b = −). */
export interface NetComponent {
  id: string;
  type: ComponentType;
  /** Node id at terminal A (the + terminal for a battery). */
  a: string;
  /** Node id at terminal B. */
  b: string;
  /** resistor: ohms (> 0); battery: volts (signed); wire/switch: ignored. */
  value: number;
  /** Battery only: internal/source resistance r ≥ 0 (Ω). Undefined/0 = ideal. */
  internalResistance?: number;
  /** Switch only: true = open (non-conducting gap). Undefined/false = closed (a wire). */
  open?: boolean;
}

export interface Netlist {
  components: NetComponent[];
}

/** Per-component electrical result. `null` = undefined (open/floating/degenerate). */
export interface ComponentResult {
  /** Voltage across, V_a − V_b (signed). */
  v: number | null;
  /** Current through, conventional + flowing A→B. */
  i: number | null;
  /** Power dissipated (resistor) or delivered (battery), ≥ 0 for resistors. */
  p: number | null;
  /** Battery only: the set EMF (V). */
  emf?: number;
  /** Battery only: terminal voltage V_a − V_b = EMF − I·r (V). */
  terminalV?: number;
}

export type SolveCode =
  | 'no-source'
  | 'no-loop'
  | 'short-circuit'
  | 'floating'
  | 'singular'
  | 'bad-value';

export interface SolveOk {
  ok: true;
  /** Node voltages keyed by raw node id (every id resolves to its merged voltage). */
  nodeV: Record<string, number>;
  /** Per-component results keyed by component id. */
  components: Record<string, ComponentResult>;
  /** Total current delivered by all sources (A). */
  sourceCurrent: number;
  /** Total power delivered by all sources (W). */
  sourcePower: number;
  /** The reference node (0 V) used for nodeV — the chosen ground or the auto-pick. */
  groundNode: string;
}

export interface SolveFail {
  ok: false;
  reason: string;
  code: SolveCode;
}

export type SolveResult = SolveOk | SolveFail;

const fail = (code: SolveCode, reason: string): SolveFail => ({ ok: false, code, reason });

/** Union-find over string node ids, with path compression. */
class DSU {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Solve `A x = z` by Gauss–Jordan elimination with partial pivoting. Returns the
 * solution, or `null` when the system is singular / ill-conditioned (a pivot
 * falls below a scale-relative tolerance) — the caller converts null into a
 * clean {ok:false} status instead of letting NaN reach the renderer.
 */
function solveLinear(A: number[][], z: number[]): number[] | null {
  const n = z.length;
  if (n === 0) return [];
  const M = A.map((row, i) => [...row, z[i]]);
  let scale = 0;
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
  const tol = 1e-9 * (scale > 0 ? scale : 1);

  for (let col = 0; col < n; col++) {
    let piv = col;
    let max = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col]);
      if (v > max) {
        max = v;
        piv = r;
      }
    }
    if (max < tol) return null;
    if (piv !== col) {
      const tmp = M[col];
      M[col] = M[piv];
      M[piv] = tmp;
    }
    const pivVal = M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / pivVal;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  const x = new Array<number>(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x;
}

/**
 * Solve a netlist. See the module header for the pipeline + guarantees.
 * `opts.ground` re-references node voltages so that node reads 0 V (for "potential
 * at a point" questions); component v/i/p are differences and are unaffected.
 */
export function solveCircuit(net: Netlist, opts?: { ground?: string }): SolveResult {
  const comps = net.components;

  // Phase A — value validation.
  for (const c of comps) {
    if (c.type === 'resistor' && !(c.value > 0 && Number.isFinite(c.value)))
      return fail('bad-value', 'Every resistor needs a positive resistance.');
    if (c.type === 'battery' && !Number.isFinite(c.value))
      return fail('bad-value', 'The battery voltage must be a number.');
  }

  const batteries = comps.filter((c) => c.type === 'battery');
  if (batteries.length === 0) return fail('no-source', 'Add a battery to drive the circuit.');

  // Phase B — wire compaction via union-find (merge nodes joined by wires).
  const dsu = new DSU();
  for (const c of comps) {
    dsu.find(c.a);
    dsu.find(c.b);
  }
  // Wires always merge nodes; a CLOSED switch is a wire, an OPEN switch is a gap.
  for (const c of comps)
    if (c.type === 'wire' || (c.type === 'switch' && !c.open)) dsu.union(c.a, c.b);
  const rep = (n: string) => dsu.find(n);

  // A wire directly across a battery is a dead short → would be infinite current.
  for (const bt of batteries) {
    if (rep(bt.a) === rep(bt.b))
      return fail('short-circuit', 'A wire shorts the battery — that would be infinite current.');
  }

  // Phase C — connectivity over merged nodes (resistors + batteries are edges).
  const adj = new Map<string, Set<string>>();
  const link = (m: Map<string, Set<string>>, a: string, b: string) => {
    if (a === b) return;
    if (!m.has(a)) m.set(a, new Set());
    if (!m.has(b)) m.set(b, new Set());
    m.get(a)!.add(b);
    m.get(b)!.add(a);
  };
  for (const c of comps) {
    if (c.type === 'wire' || c.type === 'switch') continue; // connectors, not edges
    link(adj, rep(c.a), rep(c.b));
  }

  // Driven set = every merged node reachable from a battery terminal.
  const batteryReps = new Set<string>();
  for (const bt of batteries) {
    batteryReps.add(rep(bt.a));
    batteryReps.add(rep(bt.b));
  }
  const driven = new Set<string>(batteryReps);
  const queue = Array.from(batteryReps);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!driven.has(nb)) {
        driven.add(nb);
        queue.push(nb);
      }
    }
  }

  // No complete loop: a battery's terminals must connect back through the REST of
  // the network — resistors OR other batteries (two cells in series is a valid
  // loop) — not just through its own edge. Check reachability between each
  // battery's terminals over the non-connector edges with that battery removed.
  const loopEdges = comps
    .filter((c) => c.type === 'resistor' || c.type === 'battery')
    .map((c) => ({ a: rep(c.a), b: rep(c.b), id: c.id }));
  const hasReturnPath = (s: string, t: string, excludeId: string): boolean => {
    if (s === t) return true;
    const nbrs = new Map<string, string[]>();
    const addDir = (a: string, b: string) => {
      const list = nbrs.get(a);
      if (list) list.push(b);
      else nbrs.set(a, [b]);
    };
    for (const e of loopEdges) {
      if (e.id === excludeId || e.a === e.b) continue;
      addDir(e.a, e.b);
      addDir(e.b, e.a);
    }
    const seen = new Set([s]);
    const q = [s];
    while (q.length) {
      const cur = q.shift()!;
      for (const nb of nbrs.get(cur) ?? []) {
        if (nb === t) return true;
        if (!seen.has(nb)) {
          seen.add(nb);
          q.push(nb);
        }
      }
    }
    return false;
  };
  if (!batteries.some((bt) => hasReturnPath(rep(bt.a), rep(bt.b), bt.id)))
    return fail('no-loop', 'No complete loop yet — connect the battery’s two ends through a component.');

  // Phase D — assemble the MNA system over the driven nodes.
  const drivenList = Array.from(driven);
  // Default reference: the first battery's − terminal, so its + terminal reads a
  // positive voltage (the textbook convention). Falls back to the most-connected
  // node. The user can re-ground anywhere via opts.ground.
  let ground = rep(batteries[0].b);
  if (!driven.has(ground)) {
    ground = drivenList[0];
    let bestDeg = -1;
    for (const r of drivenList) {
      const deg = adj.get(r)?.size ?? 0;
      if (deg > bestDeg || (deg === bestDeg && r < ground)) {
        bestDeg = deg;
        ground = r;
      }
    }
  }
  const drivenBatteries = batteries.filter((bt) => driven.has(rep(bt.a)) && driven.has(rep(bt.b)));
  const batR = (bt: NetComponent) => (bt.internalResistance && bt.internalResistance > 0 ? bt.internalResistance : 0);

  const nodeIdx = new Map<string, number>();
  let idx = 0;
  for (const r of drivenList) if (r !== ground) nodeIdx.set(r, idx++);
  // A non-ideal battery adds a hidden internal node: EMF between a and n_int, and
  // its internal resistance r between n_int and b. The `__bat_int__` prefix is a
  // reserved sentinel — no user/seed/editor component id ever begins with it.
  for (const bt of drivenBatteries) if (batR(bt) > 0) nodeIdx.set(`__bat_int__${bt.id}`, idx++);
  const n = idx;
  const m = drivenBatteries.length;
  const size = n + m;
  if (size === 0) return fail('singular', 'This circuit is degenerate.');

  const A: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const z = new Array<number>(size).fill(0);
  const ni = (r: string) => nodeIdx.get(r);
  const stampG = (p: string, q: string, g: number) => {
    const ip = ni(p);
    const iq = ni(q);
    if (ip !== undefined) A[ip][ip] += g;
    if (iq !== undefined) A[iq][iq] += g;
    if (ip !== undefined && iq !== undefined) {
      A[ip][iq] -= g;
      A[iq][ip] -= g;
    }
  };

  for (const c of comps) {
    if (c.type !== 'resistor') continue;
    const ra = rep(c.a);
    const rb = rep(c.b);
    if (!driven.has(ra) && !driven.has(rb)) continue;
    stampG(ra, rb, 1 / c.value);
  }
  drivenBatteries.forEach((bt, k) => {
    const row = n + k;
    const pos = rep(bt.a); // + terminal
    const r = batR(bt);
    // Ideal: source straight between a and b. Non-ideal: source between a and the
    // internal node, with r from the internal node to b.
    const neg = r > 0 ? `__bat_int__${bt.id}` : rep(bt.b);
    const ip = ni(pos);
    const ineg = ni(neg);
    if (ip !== undefined) {
      A[ip][row] += 1;
      A[row][ip] += 1;
    }
    if (ineg !== undefined) {
      A[ineg][row] -= 1;
      A[row][ineg] -= 1;
    }
    z[row] = bt.value; // V_pos − V_neg = EMF
    if (r > 0) stampG(neg, rep(bt.b), 1 / r);
  });

  // Phase E — solve (singular → clean status, never NaN).
  const x = solveLinear(A, z);
  if (!x) return fail('singular', 'This circuit is degenerate (a short or a contradiction).');

  const repV = new Map<string, number>([[ground, 0]]);
  for (const [r, i] of Array.from(nodeIdx.entries())) repV.set(r, x[i]);

  // Reference selection: re-zero on the user's chosen ground (a constant shift —
  // node voltages move, but every component v/i/p is a difference and is unchanged).
  let groundRep = ground;
  if (opts?.ground != null) {
    const wanted = rep(opts.ground);
    if (driven.has(wanted)) groundRep = wanted;
  }
  const shift = repV.get(groundRep) ?? 0;
  if (shift !== 0) for (const key of Array.from(repV.keys())) repV.set(key, (repV.get(key) ?? 0) - shift);

  // Source branch currents from MNA; the delivered current is the negated unknown.
  const delivered = (k: number) => -x[n + k];

  // Phase F — derive per-component results.
  const nodeV: Record<string, number> = {};
  for (const c of comps) for (const node of [c.a, c.b]) nodeV[node] = repV.get(rep(node)) ?? 0;

  const results: Record<string, ComponentResult> = {};
  for (const c of comps) {
    const ra = rep(c.a);
    const rb = rep(c.b);
    if (c.type === 'resistor') {
      if (!(driven.has(ra) && driven.has(rb))) {
        results[c.id] = { v: null, i: null, p: null };
        continue;
      }
      const v = (repV.get(ra) ?? 0) - (repV.get(rb) ?? 0);
      const i = v / c.value;
      results[c.id] = { v, i, p: Math.abs(v * i) };
    } else if (c.type === 'battery') {
      const k = drivenBatteries.indexOf(c);
      if (k < 0) {
        results[c.id] = { v: c.value, i: null, p: null, emf: c.value };
        continue;
      }
      const i = delivered(k);
      const terminalV = (repV.get(ra) ?? 0) - (repV.get(rb) ?? 0); // EMF − I·r
      results[c.id] = { v: terminalV, i, p: terminalV * i, emf: c.value, terminalV };
    } else if (c.type === 'switch') {
      if (c.open) {
        // Open switch: no current; show the voltage standing across the gap (it
        // drops the loop voltage) when both ends are part of the driven network.
        const known = driven.has(ra) && driven.has(rb);
        results[c.id] = { v: known ? (repV.get(ra) ?? 0) - (repV.get(rb) ?? 0) : null, i: 0, p: 0 };
      } else {
        // Closed switch = connector; the KCL pass below fills its current.
        results[c.id] = { v: 0, i: 0, p: 0 };
      }
    } else {
      // wire: a connector — current filled in by the KCL pass below.
      results[c.id] = { v: 0, i: 0, p: 0 };
    }
  }

  // Wire currents (signed, a→b) by KCL tree propagation — gives the 3D flow its
  // real direction so a whole loop animates coherently. The current flowing a→b
  // through a branch: +v/R for a resistor, −delivered for a battery (it sources
  // out of its + terminal, so internally current runs b→a).
  const branchIab = (c: NetComponent): number => {
    const r = results[c.id];
    if (!r || r.i == null) return 0;
    return c.type === 'battery' ? -r.i : r.i;
  };
  // inject(x) = net current flowing INTO node x from the non-wire components.
  const inject: Record<string, number> = {};
  for (const c of comps) {
    if (c.type === 'wire' || c.type === 'switch') continue; // connectors inject nothing
    const cur = branchIab(c);
    inject[c.a] = (inject[c.a] ?? 0) - cur;
    inject[c.b] = (inject[c.b] ?? 0) + cur;
  }
  const wadj = new Map<string, { node: string; wire: NetComponent }[]>();
  for (const w of comps) {
    if (!(w.type === 'wire' || (w.type === 'switch' && !w.open))) continue; // closed conductors
    if (!wadj.has(w.a)) wadj.set(w.a, []);
    if (!wadj.has(w.b)) wadj.set(w.b, []);
    wadj.get(w.a)!.push({ node: w.b, wire: w });
    wadj.get(w.b)!.push({ node: w.a, wire: w });
  }
  type TreeNode = { node: string; parent: string | null; parentWire: NetComponent | null };
  const seenW = new Set<string>();
  for (const startNode of Array.from(wadj.keys())) {
    if (seenW.has(startNode)) continue;
    const order: TreeNode[] = [];
    const stack: TreeNode[] = [{ node: startNode, parent: null, parentWire: null }];
    seenW.add(startNode);
    while (stack.length) {
      const cur = stack.pop()!;
      order.push(cur);
      for (const { node, wire } of wadj.get(cur.node) ?? []) {
        if (wire === cur.parentWire || seenW.has(node)) continue; // skip backedge / cycle
        seenW.add(node);
        stack.push({ node, parent: cur.node, parentWire: wire });
      }
    }
    // Reverse pre-order = post-order: a node is summed after all its descendants.
    const sub: Record<string, number> = {};
    for (let i = order.length - 1; i >= 0; i--) {
      const o = order[i];
      sub[o.node] = (sub[o.node] ?? 0) + (inject[o.node] ?? 0);
      if (o.parent != null) sub[o.parent] = (sub[o.parent] ?? 0) + sub[o.node];
    }
    for (const o of order) {
      if (!o.parentWire || o.parent == null) continue;
      const flow = sub[o.node]; // current from o.node toward its parent
      results[o.parentWire.id] = { v: 0, i: o.parentWire.a === o.node ? flow : -flow, p: 0 };
    }
  }

  // Total current delivered to the EXTERNAL (load) circuit. Summing |delivered|
  // per battery double-counts series sources: two cells in one loop share a
  // single loop current, so 1 A + 1 A wrongly reads 2 A. Instead model each
  // source as injecting its branch current at its + rep and withdrawing it at its
  // − rep, then sum the POSITIVE net injection per node — by KCL that is exactly
  // the current crossing from the source sub-network into the resistor branches at
  // that node. Series sources cancel at their shared node (the loop current is
  // counted once); parallel sources feeding a load add (counted as their sum).
  // sourcePower stays a genuine per-source sum (each cell's terminalV·I) — it was
  // already correct because power, unlike loop current, is not shared.
  const sourceInject = new Map<string, number>();
  let sourcePower = 0;
  drivenBatteries.forEach((bt, k) => {
    const d = delivered(k);
    const pRep = rep(bt.a);
    const nRep = rep(bt.b);
    sourceInject.set(pRep, (sourceInject.get(pRep) ?? 0) + d);
    sourceInject.set(nRep, (sourceInject.get(nRep) ?? 0) - d);
    const tV = (repV.get(pRep) ?? 0) - (repV.get(nRep) ?? 0);
    sourcePower += tV * d; // power delivered to the external circuit
  });
  let sourceCurrent = 0;
  for (const net of Array.from(sourceInject.values())) if (net > 0) sourceCurrent += net;

  return { ok: true, nodeV, components: results, sourceCurrent, sourcePower, groundNode: groundRep };
}

/**
 * Equivalent resistance between two nodes (the ohmmeter). Zeroes the independent
 * sources (an ideal battery → a short; a battery's internal resistance stays as a
 * resistor), injects a 1 A test current between a and b, and reads R_eq = ΔV / 1.
 * Returns null for an open path / singular / isolated terminal (∞).
 */
export function equivalentResistance(net: Netlist, a: string, b: string): number | null {
  const comps = net.components;
  for (const c of comps) {
    if (c.type === 'resistor' && !(c.value > 0 && Number.isFinite(c.value))) return null;
  }
  const dsu = new DSU();
  for (const c of comps) {
    dsu.find(c.a);
    dsu.find(c.b);
  }
  for (const c of comps) {
    if (c.type === 'wire' || (c.type === 'switch' && !c.open)) dsu.union(c.a, c.b);
    else if (c.type === 'battery' && !(c.internalResistance && c.internalResistance > 0)) dsu.union(c.a, c.b);
  }
  dsu.find(a);
  dsu.find(b);
  const rep = (x: string) => dsu.find(x);
  const ra = rep(a);
  const rb = rep(b);
  if (ra === rb) return 0;

  const edges: { a: string; b: string; g: number }[] = [];
  for (const c of comps) {
    if (c.type === 'resistor') edges.push({ a: rep(c.a), b: rep(c.b), g: 1 / c.value });
    else if (c.type === 'battery' && c.internalResistance && c.internalResistance > 0)
      edges.push({ a: rep(c.a), b: rep(c.b), g: 1 / c.internalResistance });
  }
  const nodes = new Set<string>([ra, rb]);
  for (const e of edges) {
    nodes.add(e.a);
    nodes.add(e.b);
  }
  const idxMap = new Map<string, number>();
  let idx = 0;
  for (const node of Array.from(nodes)) if (node !== rb) idxMap.set(node, idx++); // ground = rb
  const N = idx;
  if (N === 0) return null;
  const G: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  const gi = (node: string) => idxMap.get(node);
  for (const e of edges) {
    if (e.a === e.b) continue;
    const ia = gi(e.a);
    const ib = gi(e.b);
    if (ia !== undefined) G[ia][ia] += e.g;
    if (ib !== undefined) G[ib][ib] += e.g;
    if (ia !== undefined && ib !== undefined) {
      G[ia][ib] -= e.g;
      G[ib][ia] -= e.g;
    }
  }
  const iaIdx = gi(ra);
  if (iaIdx === undefined) return null;
  const zv = new Array<number>(N).fill(0);
  zv[iaIdx] = 1; // inject 1 A at a, draw it out at ground b
  const xv = solveLinear(G, zv);
  if (!xv) return null;
  const vA = xv[iaIdx];
  return Number.isFinite(vA) && vA > 1e-12 ? vA : null;
}
