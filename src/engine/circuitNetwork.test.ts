/**
 * Solver harness for circuitNetwork.ts — the deterministic correctness gate for
 * the circuit builder. Run it with `bun run test` (or `bun src/engine/
 * circuitNetwork.test.ts`).
 *
 * It is a plain standalone script, NOT a `bun:test` suite, on purpose: the build
 * typechecks all of `src` with `tsc -b` under `types: ["vite/client"]` only (no
 * Node, no bun types — see tsconfig.app.json), so `bun:test` / `process` would
 * break `bun run build`. Assertions accumulate into a pass/fail tally; a non-zero
 * `failed` count throws, so the script exits non-zero for CI.
 */
import { solveCircuit, equivalentResistance } from './circuitNetwork.ts';

const approx = (a: number | null, b: number, tol = 1e-6) =>
  a !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
let pass = 0;
let failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; } else { failed++; console.log('FAIL', name); }
};

// 1. Consistency contract: battery 12V + resistor 60Ω == circuitState (I=0.2, P=2.4)
const seed = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12 },
  { id: 'r1', type: 'resistor', a: 'P', b: 'G', value: 60 },
] });
check('seed ok', seed.ok);
if (seed.ok) {
  check('seed I=0.2', approx(seed.components['r1'].i, 0.2));
  check('seed P=2.4', approx(seed.components['r1'].p, 2.4));
  check('seed Vr=12', approx(seed.components['r1'].v, 12));
  check('seed sourceCurrent=0.2', approx(seed.sourceCurrent, 0.2));
  check('seed sourcePower=2.4', approx(seed.sourcePower, 2.4));
}

// 2. Wires merge nodes: battery P-G, wire P-A, resistor A-B 60, wire B-G
const wired = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12 },
  { id: 'wa', type: 'wire', a: 'P', b: 'A', value: 0 },
  { id: 'r1', type: 'resistor', a: 'A', b: 'B', value: 60 },
  { id: 'wb', type: 'wire', a: 'B', b: 'G', value: 0 },
] });
check('wired ok', wired.ok);
if (wired.ok) {
  check('wired I=0.2', approx(wired.components['r1'].i, 0.2));
  check('wired wire wa current 0.2', approx(Math.abs(wired.components['wa'].i ?? 0), 0.2));
  check('wired wire wb current 0.2', approx(Math.abs(wired.components['wb'].i ?? 0), 0.2));
}

// 3. Series 40+20: I=0.2, V_R1=8, V_R2=4
const series = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12 },
  { id: 'r1', type: 'resistor', a: 'P', b: 'M', value: 40 },
  { id: 'r2', type: 'resistor', a: 'M', b: 'G', value: 20 },
] });
check('series ok', series.ok);
if (series.ok) {
  check('series I1=0.2', approx(series.components['r1'].i, 0.2));
  check('series I2=0.2', approx(series.components['r2'].i, 0.2));
  check('series V_R1=8', approx(series.components['r1'].v, 8));
  check('series V_R2=4', approx(series.components['r2'].v, 4));
}

// 4. Parallel 60||30: I1=0.2, I2=0.4, total=0.6
const par = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12 },
  { id: 'r1', type: 'resistor', a: 'P', b: 'G', value: 60 },
  { id: 'r2', type: 'resistor', a: 'P', b: 'G', value: 30 },
] });
check('parallel ok', par.ok);
if (par.ok) {
  check('parallel I1=0.2', approx(par.components['r1'].i, 0.2));
  check('parallel I2=0.4', approx(par.components['r2'].i, 0.4));
  check('parallel total=0.6', approx(par.sourceCurrent, 0.6));
}

// 5-8. Degenerate codes
const nosrc = solveCircuit({ components: [{ id: 'r1', type: 'resistor', a: 'A', b: 'B', value: 100 }] });
check('no-source', !nosrc.ok && nosrc.code === 'no-source');
const noloop = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12 },
  { id: 'r1', type: 'resistor', a: 'P', b: 'X', value: 100 },
] });
check('no-loop', !noloop.ok && noloop.code === 'no-loop');
const short = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12 },
  { id: 'w', type: 'wire', a: 'P', b: 'G', value: 0 },
] });
check('short', !short.ok && short.code === 'short-circuit');
const bad = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12 },
  { id: 'r1', type: 'resistor', a: 'P', b: 'G', value: 0 },
] });
check('bad-value', !bad.ok && bad.code === 'bad-value');

// 9. Internal resistance: battery(12, r=2) + resistor(4) → I=2, terminalV=8, P_ext=16
const intR = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12, internalResistance: 2 },
  { id: 'r1', type: 'resistor', a: 'P', b: 'G', value: 4 },
] });
check('intR ok', intR.ok);
if (intR.ok) {
  check('intR I=2', approx(intR.components['r1'].i, 2));
  check('intR terminalV=8', approx(intR.components['bat'].terminalV ?? null, 8));
  check('intR emf=12', approx(intR.components['bat'].emf ?? null, 12));
  check('intR P_ext=16', approx(intR.sourcePower, 16));
}

// 10. r=0 reduces to ideal: I=3, terminalV=12
const ideal0 = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12, internalResistance: 0 },
  { id: 'r1', type: 'resistor', a: 'P', b: 'G', value: 4 },
] });
check('ideal0 I=3', ideal0.ok && approx(ideal0.components['r1'].i, 3));
check('ideal0 terminalV=12', ideal0.ok && approx(ideal0.components['bat'].terminalV ?? null, 12));

// 11-13. Equivalent resistance
check('Req series 60', approx(equivalentResistance({ components: [
  { id: 'r1', type: 'resistor', a: 'A', b: 'B', value: 40 },
  { id: 'r2', type: 'resistor', a: 'B', b: 'C', value: 20 },
] }, 'A', 'C'), 60));
check('Req parallel 20', approx(equivalentResistance({ components: [
  { id: 'r1', type: 'resistor', a: 'A', b: 'B', value: 60 },
  { id: 'r2', type: 'resistor', a: 'A', b: 'B', value: 30 },
] }, 'A', 'B'), 20));
check('Req open null', equivalentResistance({ components: [
  { id: 'r1', type: 'resistor', a: 'A', b: 'B', value: 10 },
] }, 'A', 'C') === null);

// 14. Reground: chosen node reads 0 V; a resistor's v is unchanged
const divider = [
  { id: 'bat', type: 'battery' as const, a: 'P', b: 'G', value: 12 },
  { id: 'r1', type: 'resistor' as const, a: 'P', b: 'M', value: 40 },
  { id: 'r2', type: 'resistor' as const, a: 'M', b: 'G', value: 20 },
];
const baseG = solveCircuit({ components: divider });
const reG = solveCircuit({ components: divider }, { ground: 'M' });
check('reground M=0', reG.ok && approx(reG.nodeV['M'], 0));
check('reground r1 v unchanged', baseG.ok && reG.ok && approx(reG.components['r1'].v, baseG.components['r1'].v ?? 0));

// 15. Closed switch conducts like a wire: battery P-G, switch P-A (closed), R A-G 60 → I=0.2
const swClosed = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12 },
  { id: 'sw', type: 'switch', a: 'P', b: 'A', value: 0 },
  { id: 'r1', type: 'resistor', a: 'A', b: 'G', value: 60 },
] });
check('switch closed ok', swClosed.ok);
if (swClosed.ok) {
  check('switch closed I=0.2', approx(swClosed.components['r1'].i, 0.2));
  check('switch closed carries 0.2', approx(Math.abs(swClosed.components['sw'].i ?? 0), 0.2));
  check('switch closed v=0', approx(swClosed.components['sw'].v, 0));
}

// 16. Open switch in series breaks the loop → no-loop
const swOpen = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12 },
  { id: 'sw', type: 'switch', a: 'P', b: 'A', value: 0, open: true },
  { id: 'r1', type: 'resistor', a: 'A', b: 'G', value: 60 },
] });
check('switch open breaks loop', !swOpen.ok && swOpen.code === 'no-loop');

// 17. Open switch across a live divider shows the standing voltage, no current.
// Divider P-M(40)-G(20): V_M=4. Switch M-G open → v=4, i=0, the rest unchanged.
const swAcross = solveCircuit({ components: [
  { id: 'bat', type: 'battery', a: 'P', b: 'G', value: 12 },
  { id: 'r1', type: 'resistor', a: 'P', b: 'M', value: 40 },
  { id: 'r2', type: 'resistor', a: 'M', b: 'G', value: 20 },
  { id: 'sw', type: 'switch', a: 'M', b: 'G', value: 0, open: true },
] });
check('switch across ok', swAcross.ok);
if (swAcross.ok) {
  check('switch across v=4', approx(swAcross.components['sw'].v, 4));
  check('switch across i=0', approx(swAcross.components['sw'].i, 0));
  check('switch across r2 still 0.2', approx(swAcross.components['r2'].i, 0.2));
}

// 18. Closed switch shorts a node pair for the ohmmeter; open isolates it.
check('Req closed-switch shorts 10', approx(equivalentResistance({ components: [
  { id: 'r1', type: 'resistor', a: 'A', b: 'B', value: 10 },
  { id: 'sw', type: 'switch', a: 'B', b: 'C', value: 0 },
] }, 'A', 'C'), 10));
check('Req open-switch isolates null', equivalentResistance({ components: [
  { id: 'r1', type: 'resistor', a: 'A', b: 'B', value: 10 },
  { id: 'sw', type: 'switch', a: 'B', b: 'C', value: 0, open: true },
] }, 'A', 'C') === null);

// 19. Two cells in series close a valid loop through each other (adversarial F1):
// b1 A-B (6V) + b2 B-C (6V) + R C-A (12Ω) → I=1A, total power 12W. Must NOT be no-loop.
const series2 = solveCircuit({ components: [
  { id: 'b1', type: 'battery', a: 'A', b: 'B', value: 6 },
  { id: 'b2', type: 'battery', a: 'B', b: 'C', value: 6 },
  { id: 'r', type: 'resistor', a: 'C', b: 'A', value: 12 },
] });
check('2-cell series solves (not no-loop)', series2.ok);
if (series2.ok) {
  check('2-cell series I=1', approx(Math.abs(series2.components['r'].i ?? 0), 1));
  check('2-cell series power=12', approx(series2.sourcePower, 12));
  // Regression: both cells carry the SAME 1 A loop current, so the "delivering"
  // headline is 1 A, not 1+1=2 A. The per-component rows already show 1 A each.
  check('2-cell series headline=1 (not double-counted)', approx(series2.sourceCurrent, 1));
}
// 20. Genuinely open battery still rejected (guard didn't over-relax):
const stillOpen = solveCircuit({ components: [
  { id: 'b1', type: 'battery', a: 'P', b: 'G', value: 9 },
  { id: 'r1', type: 'resistor', a: 'P', b: 'X', value: 100 },
] });
check('dangling battery still no-loop', !stillOpen.ok && stillOpen.code === 'no-loop');

// 21. Two real cells (EMF + internal r) in PARALLEL across one load. Unlike
// series, parallel sources each push current into the SAME load, so the headline
// is the SUM of their deliveries (= the full load current), not one loop current.
// 2×(12V, r=2Ω) ∥ across 5Ω → Thevenin 12V/1Ω, I_load=2A, each cell 1A, P_ext=20W.
// (Two IDEAL sources in parallel are genuinely singular, so model real cells.)
const par2 = solveCircuit({ components: [
  { id: 'b1', type: 'battery', a: 'P', b: 'G', value: 12, internalResistance: 2 },
  { id: 'b2', type: 'battery', a: 'P', b: 'G', value: 12, internalResistance: 2 },
  { id: 'r', type: 'resistor', a: 'P', b: 'G', value: 5 },
] });
check('2-cell parallel ok', par2.ok);
if (par2.ok) {
  check('2-cell parallel I_load=2', approx(par2.components['r'].i, 2));
  check('2-cell parallel each delivers 1', approx(par2.components['b1'].i ?? null, 1) && approx(par2.components['b2'].i ?? null, 1));
  check('2-cell parallel headline=2 (summed, not 4)', approx(par2.sourceCurrent, 2));
  check('2-cell parallel power=20', approx(par2.sourcePower, 20));
}

console.log(`${pass} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} solver check(s) failed`);
