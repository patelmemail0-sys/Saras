/**
 * Linked 3D view of the circuit builder. Read-only render of the SAME components
 * the 2D editor edits, inside the shared Scene3D: wires as azure lines, resistors
 * as cylinders that glow with their own power, the battery as a chrome body,
 * switches as a conductor (closed) or a broken gap (open), and charges flowing
 * along each branch at a speed set by THAT branch's current — so a parallel
 * branch carrying more current visibly flows faster.
 *
 * It also renders the measurement layer the 2D editor sets up: the ground
 * reference ring, node-voltage tags, per-branch current labels, and the live
 * probe (voltmeter ΔV / ammeter I / ohmmeter R_eq) highlighting the picked nodes
 * or branch. All physics reads the solver's SolveResult / equivalentResistance;
 * nothing is recomputed here.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { equivalentResistance, type NetComponent, type SolveResult } from '../../circuitNetwork.ts';
import Scene3D from '../three/Scene3D.tsx';
import { emissive, PALETTE } from '../three/materials.ts';
import { Label3D } from '../three/primitives.tsx';
import { fmt } from '../../format.ts';
import { nodeWorld } from './grid.ts';
import type { Tool } from './CircuitEditor2D.tsx';

type V3 = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);

interface Branch {
  a: V3;
  b: V3;
  speed: number;
  dir: number; // +1 a→b, −1 b→a
  count: number;
}

const MAX_CHARGES = 260;

const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

export default function CircuitScene3D({
  components,
  solve,
  animating,
  showNodeV = false,
  showBranchI = false,
  groundNode = null,
  tool = 'select',
  probeNodes = [],
  probeBranch = null,
}: {
  components: NetComponent[];
  solve: SolveResult;
  animating: boolean;
  showNodeV?: boolean;
  showBranchI?: boolean;
  groundNode?: string | null;
  tool?: Tool;
  probeNodes?: string[];
  probeBranch?: string | null;
}) {
  const nv = solve.ok ? solve.nodeV : null;
  const nodeVids =
    showNodeV && nv ? Array.from(new Set(components.flatMap((c) => [c.a, c.b]))).filter((id) => nv[id] != null) : [];

  // Per-branch current labels (conductors only — matches the 2D `branch I` toggle).
  const branchI =
    showBranchI && solve.ok
      ? components.filter((c) => {
          const i = solve.components[c.id]?.i;
          return c.type !== 'battery' && i != null && Math.abs(i) > 1e-4;
        })
      : [];

  // The live probe answer, placed in space where the meter is pointing. Memoized
  // so the ohmmeter's R_eq solve isn't rebuilt on incidental re-renders.
  const probe = useMemo(
    () => readout(tool, components, solve, probeNodes, probeBranch),
    [tool, components, solve, probeNodes, probeBranch],
  );
  const probeBranchComp = probeBranch ? components.find((c) => c.id === probeBranch) ?? null : null;

  return (
    <Scene3D
      label="Circuit (3D)"
      axisSnap
      env="lite"
      frameloop={animating ? 'always' : 'demand'}
      camera={{ position: [3.4, 4, 4.6], fov: 46 }}
      controls={{ target: [0, 0, 0], minDistance: 3, maxDistance: 16 }}
    >
      {components.map((c) => (
        <CircuitPart key={c.id} c={c} solve={solve} />
      ))}
      <Charges components={components} solve={solve} animating={animating} />

      {/* ground reference ring */}
      {groundNode && <FlatRing at={nodeWorld(groundNode)} color={PALETTE.chrome} radius={0.17} />}

      {/* node-voltage tags (ground reads azure; the chrome ring marks the reference) */}
      {nodeVids.map((id) => {
        const w = nodeWorld(id);
        const isGround = id === groundNode;
        return (
          <Label3D key={id} position={[w[0], w[1] + 0.34, w[2]]} size={0.19} color={isGround ? PALETTE.azure : PALETTE.pearl}>
            {`${fmt(nv?.[id] ?? 0)} V`}
          </Label3D>
        );
      })}

      {/* per-branch current labels */}
      {branchI.map((c) => {
        const m = mid(nodeWorld(c.a), nodeWorld(c.b));
        return (
          <Label3D key={`i-${c.id}`} position={[m[0], m[1] + 0.24, m[2]]} size={0.16} color={PALETTE.azure}>
            {`${fmt(Math.abs(solve.ok ? solve.components[c.id]?.i ?? 0 : 0))} A`}
          </Label3D>
        );
      })}

      {/* probe: ringed nodes (voltmeter / ohmmeter) + lead line. The rings + the
          floating readout identify the picks — no per-node letters, to stay clean. */}
      {probeNodes.map((id) => (
        <FlatRing key={`p-${id}`} at={nodeWorld(id)} color={PALETTE.azure} radius={0.15} glow />
      ))}
      {probeNodes.length === 2 && (
        <Line points={[nodeWorld(probeNodes[0]), nodeWorld(probeNodes[1])]} color={PALETTE.azure} lineWidth={1.5} dashed dashScale={6} />
      )}

      {/* probe: highlighted branch (ammeter) */}
      {probeBranchComp && (
        <Line points={[nodeWorld(probeBranchComp.a), nodeWorld(probeBranchComp.b)]} color={PALETTE.azureWarm} lineWidth={6} />
      )}

      {/* probe readout */}
      {probe && (
        <Label3D position={probe.pos} size={0.24} color={probe.color}>
          {probe.text}
        </Label3D>
      )}
    </Scene3D>
  );
}

/** The live measurement label for the active probe tool (mirrors the 2D panel). */
function readout(
  tool: Tool,
  components: NetComponent[],
  solve: SolveResult,
  probeNodes: string[],
  probeBranch: string | null,
): { text: string; pos: V3; color: string } | null {
  const lift = (p: V3): V3 => [p[0], p[1] + 0.66, p[2]];
  if (tool === 'volt' && probeNodes.length === 2 && solve.ok) {
    const [n0, n1] = probeNodes;
    const dv = (solve.nodeV[n0] ?? 0) - (solve.nodeV[n1] ?? 0);
    return { text: `Δ ${fmt(dv)} V`, pos: lift(mid(nodeWorld(n0), nodeWorld(n1))), color: PALETTE.azure };
  }
  if (tool === 'ohm' && probeNodes.length === 2) {
    const [n0, n1] = probeNodes;
    const req = equivalentResistance({ components }, n0, n1);
    return { text: req == null ? '∞ open' : `${fmt(req)} Ω`, pos: lift(mid(nodeWorld(n0), nodeWorld(n1))), color: PALETTE.azure };
  }
  if (tool === 'ammeter' && probeBranch && solve.ok) {
    const c = components.find((x) => x.id === probeBranch);
    const ri = solve.components[probeBranch]?.i;
    if (c && ri != null) {
      const iab = c.type === 'battery' ? -ri : ri;
      return { text: `${fmt(Math.abs(iab))} A`, pos: lift(mid(nodeWorld(c.a), nodeWorld(c.b))), color: PALETTE.azureWarm };
    }
  }
  return null;
}

/** A thin ring lying flat in the XZ plane — chrome for ground, glowing azure for a probe. */
function FlatRing({ at, color, radius = 0.15, glow = false }: { at: V3; color: string; radius?: number; glow?: boolean }) {
  return (
    <mesh position={at} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.02, 10, 30]} />
      {glow ? (
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} roughness={0.4} toneMapped={false} />
      ) : (
        <meshStandardMaterial color={color} metalness={0.85} roughness={0.25} />
      )}
    </mesh>
  );
}

function CircuitPart({ c, solve }: { c: NetComponent; solve: SolveResult }) {
  const a = nodeWorld(c.a);
  const b = nodeWorld(c.b);
  const res = solve.ok ? solve.components[c.id] : null;
  // Key on the node ids, not the fresh array literals nodeWorld returns each call
  // (those are new identities every render, which would defeat the memo).
  const { pos, quat, len } = useMemo(() => orient(nodeWorld(c.a), nodeWorld(c.b)), [c.a, c.b]);

  if (c.type === 'wire') {
    return <Line points={[a, b]} color={PALETTE.azure} lineWidth={3} />;
  }
  if (c.type === 'switch') {
    if (!c.open) {
      // Closed = a conductor, with a small raised chrome knob marking the switch.
      return (
        <group>
          <Line points={[a, b]} color={PALETTE.azure} lineWidth={3} />
          <mesh position={[(a[0] + b[0]) / 2, 0.14, (a[2] + b[2]) / 2]}>
            <sphereGeometry args={[0.045, 14, 14]} />
            <meshStandardMaterial color={PALETTE.chrome} metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
      );
    }
    // Open = a visible gap (dim stubs) with a lifted azure knob; no charges flow.
    const sa = lerp(a, b, 0.36);
    const sb = lerp(a, b, 0.64);
    return (
      <group>
        <Line points={[a, sa]} color={PALETTE.grid} lineWidth={3} />
        <Line points={[b, sb]} color={PALETTE.grid} lineWidth={3} />
        <mesh position={[sa[0], 0.2, sa[2]]}>
          <sphereGeometry args={[0.05, 14, 14]} />
          <meshStandardMaterial color={PALETTE.azure} emissive={PALETTE.azure} emissiveIntensity={0.5} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  if (c.type === 'battery') {
    return (
      <group>
        <mesh position={pos} quaternion={quat}>
          <cylinderGeometry args={[0.09, 0.09, Math.max(0.05, len * 0.6), 18]} />
          <meshStandardMaterial color={PALETTE.chrome} metalness={0.9} roughness={0.22} />
        </mesh>
        <mesh position={a}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color={PALETTE.azure} emissive={PALETTE.azure} emissiveIntensity={0.7} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  // resistor — a cylinder spanning the edge, glowing with its own power
  const glow = res && res.p != null ? res.p / (res.p + 8) : 0;
  return (
    <mesh position={pos} quaternion={quat}>
      <cylinderGeometry args={[0.055, 0.055, Math.max(0.05, len), 16]} />
      <meshStandardMaterial
        color={PALETTE.azureWarm}
        emissive={PALETTE.azureWarm}
        emissiveIntensity={0.2 + glow * 1.7}
        roughness={0.4}
        toneMapped={false}
      />
    </mesh>
  );
}

/** All charges in one instanced mesh (one draw call), advanced per-branch. */
function Charges({
  components,
  solve,
  animating,
}: {
  components: NetComponent[];
  solve: SolveResult;
  animating: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(() => new THREE.SphereGeometry(0.045, 10, 10), []);
  const mat = useMemo(() => emissive(PALETTE.azure, 0.95), []);

  const branches = useMemo<Branch[]>(() => {
    if (!solve.ok) return [];
    const out: Branch[] = [];
    for (const c of components) {
      const a = nodeWorld(c.a);
      const b = nodeWorld(c.b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      // Signed current through the branch in the a→b direction. The solver gives
      // wires, resistors and switches as a→b directly; a battery sources out of
      // its + terminal, so its internal a→b current is the negated delivered one.
      const ri = solve.components[c.id]?.i ?? 0;
      const iab = c.type === 'battery' ? -ri : ri;
      const mag = Math.abs(iab);
      if (mag < 1e-4) continue;
      out.push({
        a,
        b,
        dir: iab >= 0 ? 1 : -1,
        speed: Math.min(0.06 + mag * 0.45, 1.6),
        count: Math.max(2, Math.round(len * 3)),
      });
    }
    // Cap total instances.
    let total = 0;
    const capped: Branch[] = [];
    for (const br of out) {
      if (total + br.count > MAX_CHARGES) break;
      total += br.count;
      capped.push(br);
    }
    return capped;
  }, [components, solve]);

  const total = Math.max(1, branches.reduce((s, br) => s + br.count, 0));

  useFrame((state) => {
    const inst = ref.current;
    if (!inst) return;
    const t = state.clock.elapsedTime;
    let idx = 0;
    for (const br of branches) {
      for (let j = 0; j < br.count; j++) {
        const base = j / br.count;
        const f = (((base + (animating ? t * br.speed * br.dir : 0)) % 1) + 1) % 1;
        dummy.position.set(
          br.a[0] + (br.b[0] - br.a[0]) * f,
          br.a[1] + (br.b[1] - br.a[1]) * f,
          br.a[2] + (br.b[2] - br.a[2]) * f,
        );
        dummy.updateMatrix();
        inst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    for (; idx < total; idx++) {
      dummy.position.set(0, -999, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh key={total} ref={ref} args={[geo, mat, total]} frustumCulled={false} />;
}

function orient(a: V3, b: V3): { pos: V3; quat: THREE.Quaternion; len: number } {
  const va = new THREE.Vector3(a[0], a[1], a[2]);
  const vb = new THREE.Vector3(b[0], b[1], b[2]);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const m = va.clone().add(vb).multiplyScalar(0.5);
  const quat = new THREE.Quaternion();
  if (len > 1e-6) quat.setFromUnitVectors(UP, dir.normalize());
  return { pos: [m.x, m.y, m.z], quat, len };
}
