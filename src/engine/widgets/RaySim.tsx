/**
 * Thin-lens ray-diagram renderer — a true-3D optical bench in the "clean 3D,
 * glass accents" style. A glass lens sits at the origin on the optical axis; an
 * upright object stands a distance d₀ in front of it, and the three principal
 * rays converge to locate the image. Drag the focal length (positive converging,
 * negative diverging), the object distance and its height: watch the image flip
 * between real-inverted and virtual-upright, and grow or shrink, live.
 *
 * It hosts the same equation column (EquationPanel) as the other models — pick a
 * relation (the thin-lens equation, magnification, image height), set the knowns,
 * and the remaining variable is solved for and fed back into the bench when it is
 * the focal length, object distance or object height.
 *
 * All optics come from lensOptics (validate.ts) — the same closed form the
 * correctness gate verified — so the image the rays point to is exactly the one
 * that was checked. A 2D SVG fallback (same maths) renders without WebGL.
 */
import { useMemo, useState } from 'react';
import { Line } from '@react-three/drei';
import { lensOptics } from '../validate.ts';
import { equationsForSpecType } from '../equations.ts';
import { parseRayProblem } from '../wordProblems.ts';
import { fmt } from '../format.ts';
import { useEquationPanel } from '../useEquationPanel.ts';
import EquationPanel from '../EquationPanel.tsx';
import WordProblemBar from '../WordProblemBar.tsx';
import type { RayDiagramSpec } from '../spec.ts';
import Scene3D from './three/Scene3D.tsx';
import { Vector3D } from './three/primitives.tsx';
import { glassAccent, chrome, PALETTE } from './three/materials.ts';
import { hasWebGL } from './three/hasWebGL.ts';

const WP_EXAMPLE = 'A 2 cm tall object sits 30 cm in front of a converging lens of focal length 10 cm. Where is the image and how tall?';

const W = 600;
const H = 320;
const AXY = H / 2; // optical axis (2D fallback)
const AX = 1.0; // optical-axis height above the grid (3D)

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

const SET = equationsForSpecType('ray-diagram')!;

/** Geometry shared by the 3D scene and the 2D fallback, in axis (x) / height (y) coords. */
function geometry(f: number, d0: number, h0: number, di: number, hi: number) {
  // Near the focal point d_i blows up — clamp the DRAWN positions (the readout
  // still shows the true value) so the bench stays legible.
  const diDraw = clamp(di, -4 * d0, 4 * d0);
  const hiDraw = clamp(hi, -4 * h0, 4 * h0);
  const xMax = Math.max(d0, Math.abs(diDraw), Math.abs(f)) * 1.15;
  const yMax = Math.max(h0, Math.abs(hiDraw)) * 1.2;
  return { diDraw, hiDraw, xMax, yMax };
}

export default function RaySim({ spec }: { spec: RayDiagramSpec }) {
  const [focal, setFocal] = useState(spec.focalLength);
  const [objD, setObjD] = useState(spec.objectDistance);
  const [objH, setObjH] = useState(spec.objectHeight);

  const [wpText, setWpText] = useState('');
  const [wpInfo, setWpInfo] = useState<{ found: string[]; askedLabel: string | null } | null>(null);

  const webgl = useMemo(() => hasWebGL(), []);

  const base: Record<string, number> = { f: focal, do: objD, ho: objH };
  function setBase(sym: string, val: number) {
    if (sym === 'f') setFocal(val);
    else if (sym === 'do') setObjD(val);
    else if (sym === 'ho') setObjH(val);
  }

  const eqp = useEquationPanel(SET, base, setBase);
  const { resolved, setSolveTarget } = eqp;

  const o = useMemo(
    () =>
      lensOptics({
        type: 'ray-diagram',
        title: spec.title,
        focalLength: resolved.f,
        objectDistance: resolved.do,
        objectHeight: resolved.ho,
        notes: spec.notes,
      }),
    [spec.title, spec.notes, resolved.f, resolved.do, resolved.ho],
  );

  const lensMat = useMemo(() => glassAccent(), []);
  const markerMat = useMemo(() => chrome(), []);

  const f = resolved.f;
  const d0 = resolved.do;
  const h0 = resolved.ho;
  const { diDraw, hiDraw, xMax, yMax } = geometry(f, d0, h0, o.imageDistance, o.imageHeight);

  // Different x/y scales (a schematic) — a linear map, so the rays still cross at
  // the image point. World point = [x·sx, AX + y·sy, 0].
  const sx = clamp(2.9 / (xMax || 1), 0.04, 40);
  const sy = clamp(1.05 / (yMax || 1), 0.1, 80);
  const wx = (x: number) => x * sx;
  const wy = (y: number) => AX + y * sy;
  const P = (x: number, y: number): [number, number, number] => [wx(x), wy(y), 0];

  const rightX = xMax * 1.2;
  const leftX = -d0 * 1.2;

  // The two principal rays' outgoing heights (both pass through the image tip —
  // see lensOptics). Parallel ray bends through the far focus; chief ray goes
  // straight through the lens centre.
  const parallelOut = (x: number) => h0 - (h0 / f) * x; // through (f, 0) from (0, h0)
  const chiefOut = (x: number) => (-h0 / d0) * x; // through (0,0) from (-d0, h0)

  // Solid physical paths (incoming to lens, then outgoing to the right edge).
  const rayParallel: [number, number, number][] = [P(-d0, h0), P(0, h0), P(rightX, parallelOut(rightX))];
  const rayChief: [number, number, number][] = [P(-d0, h0), P(0, 0), P(rightX, chiefOut(rightX))];

  // Virtual images sit on the object's side — the rays only APPEAR to come from
  // there, so dash a back-extension from the lens to the image tip.
  const virtualBack: [number, number, number][][] = o.real
    ? []
    : [
        [P(0, h0), P(diDraw, hiDraw)],
        [P(0, 0), P(diDraw, hiDraw)],
      ];

  function modelProblem() {
    const text = wpText.trim();
    if (!text) return;
    const parsed = parseRayProblem(text);
    for (const [sym, val] of Object.entries(parsed.base)) setBase(sym, val);
    if (parsed.solveFor) setSolveTarget(parsed.solveFor.eqId, parsed.solveFor.unknown);
    const askedLabel = parsed.solveFor
      ? SET.equations.find((e) => e.id === parsed.solveFor!.eqId)?.label ?? null
      : null;
    setWpInfo({ found: parsed.found, askedLabel });
  }

  const lensTag = f >= 0 ? 'converging' : 'diverging';
  const imageTag = `${o.real ? 'real' : 'virtual'}, ${o.upright ? 'upright' : 'inverted'}`;

  return (
    <div className="pmodel">
      <WordProblemBar
        value={wpText}
        onChange={setWpText}
        onSubmit={modelProblem}
        onExample={() => setWpText(WP_EXAMPLE)}
        busy={false}
        placeholder="Word problem → model: e.g. a 2 cm object 30 cm from a converging lens, f = 10 cm. Where is the image?"
        result={
          wpInfo &&
          (wpInfo.found.length ? (
            <p className="wp__result">
              Set {wpInfo.found.join(' · ')}
              {wpInfo.askedLabel && (
                <>
                  {' '}
                  · solving for <b>{wpInfo.askedLabel}</b>
                </>
              )}
            </p>
          ) : (
            <p className="wp__result wp__result--warn">Couldn't find the numbers. Try “object 30 cm from a lens, f = 10 cm”.</p>
          ))
        }
      />

      <div className="pmodel__body">
        <div className="pmodel__visual">
          <div className="ps">
            {webgl ? (
              <div className="ps__canvas">
                <Scene3D
                  label={spec.title}
                  axisSnap
                  camera={{ position: [3.4, 3.4, 6.4], fov: 44 }}
                  controls={{ target: [0, AX, 0], minDistance: 3, maxDistance: 16 }}
                >
                  {/* optical axis */}
                  <Line points={[P(leftX, 0), P(rightX, 0)]} color={PALETTE.pearl} lineWidth={1} transparent opacity={0.45} />

                  {/* the lens — the one glass-accent object — in the plane of the axis */}
                  <mesh position={[0, AX, 0]} scale={[0.06, Math.max(0.6, h0 * sy * 1.5), Math.max(0.6, h0 * sy * 1.5)]} material={lensMat}>
                    <sphereGeometry args={[1, 40, 40]} />
                  </mesh>

                  {/* focal points F and F' on the axis */}
                  <mesh position={P(-f, 0)} material={markerMat}>
                    <sphereGeometry args={[0.05, 18, 18]} />
                  </mesh>
                  <mesh position={P(f, 0)} material={markerMat}>
                    <sphereGeometry args={[0.05, 18, 18]} />
                  </mesh>

                  {/* object (upright) and image (up or down per its sign) */}
                  <Vector3D origin={P(-d0, 0)} dir={[0, 1, 0]} length={h0 * sy} color={PALETTE.pearl} thickness={0.022} />
                  <Vector3D
                    origin={P(diDraw, 0)}
                    dir={[0, Math.sign(hiDraw) || 1, 0]}
                    length={Math.abs(hiDraw) * sy}
                    color={o.real ? PALETTE.azure : PALETTE.azureWarm}
                    thickness={0.022}
                  />

                  {/* principal rays */}
                  <Line points={rayParallel} color={PALETTE.azure} lineWidth={1.6} transparent opacity={0.9} />
                  <Line points={rayChief} color={PALETTE.azure} lineWidth={1.6} transparent opacity={0.9} />
                  {virtualBack.map((seg, i) => (
                    <Line key={i} points={seg} color={PALETTE.azureWarm} lineWidth={1.2} dashed dashSize={0.12} gapSize={0.08} transparent opacity={0.7} />
                  ))}
                </Scene3D>

                <div className="ps__legend" aria-hidden="true">
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.glass }} /> {lensTag} lens</span>
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: PALETTE.pearl }} /> object <b>h₀ = {fmt(h0)} m</b></span>
                  <span className="ps__legend-row"><i className="ps__legend-dot" style={{ background: o.real ? PALETTE.azure : PALETTE.azureWarm }} /> image ({imageTag})</span>
                </div>
              </div>
            ) : (
              <RayFallback2D
                f={f}
                d0={d0}
                h0={h0}
                o={o}
                title={spec.title}
              />
            )}

            <div className="ps__readout">
              <span>image distance <b>{fmt(o.imageDistance)}</b> m</span>
              <span>magnification <b>{fmt(o.magnification)}×</b></span>
              <span>image height <b>{fmt(o.imageHeight)}</b> m</span>
              <span>{imageTag}</span>
            </div>
          </div>
        </div>

        <EquationPanel {...eqp.panelProps} />
      </div>
    </div>
  );
}

/** Non-WebGL fallback — the same optics as a flat 2D ray diagram. */
function RayFallback2D({
  f,
  d0,
  h0,
  o,
  title,
}: {
  f: number;
  d0: number;
  h0: number;
  o: ReturnType<typeof lensOptics>;
  title: string;
}) {
  const { diDraw, hiDraw, xMax, yMax } = geometry(f, d0, h0, o.imageDistance, o.imageHeight);
  const sx = clamp(220 / (xMax || 1), 1, 4000);
  const sy = clamp(110 / (yMax || 1), 1, 8000);
  const px = (x: number) => W / 2 + x * sx;
  const py = (y: number) => AXY - y * sy;

  const parallelOut = (x: number) => h0 - (h0 / f) * x;
  const chiefOut = (x: number) => (-h0 / d0) * x;
  const rightX = xMax * 1.2;
  const poly = (segs: Array<[number, number]>) =>
    segs.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' ');

  return (
    <svg className="ps__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <line x1={px(-d0 * 1.2)} y1={AXY} x2={px(rightX)} y2={AXY} className="ps__guide" />
      <line x1={px(0)} y1={py(yMax)} x2={px(0)} y2={py(-yMax)} className="ps__plate" />

      {/* focal points */}
      <circle cx={px(-f)} cy={AXY} r={3} className="ps__apex" />
      <circle cx={px(f)} cy={AXY} r={3} className="ps__apex" />

      {/* principal rays */}
      <polyline className="ps__vel" fill="none" points={poly([[-d0, h0], [0, h0], [rightX, parallelOut(rightX)]])} />
      <polyline className="ps__vel" fill="none" points={poly([[-d0, h0], [0, 0], [rightX, chiefOut(rightX)]])} />
      {!o.real && (
        <>
          <polyline className="ps__force ps__fa" fill="none" points={poly([[0, h0], [diDraw, hiDraw]])} />
          <polyline className="ps__force ps__fa" fill="none" points={poly([[0, 0], [diDraw, hiDraw]])} />
        </>
      )}

      {/* object + image arrows */}
      <line x1={px(-d0)} y1={AXY} x2={px(-d0)} y2={py(h0)} className="ps__force ps__fn" />
      <line x1={px(diDraw)} y1={AXY} x2={px(diDraw)} y2={py(hiDraw)} className="ps__force ps__fw" />
      <text x={px(-d0)} y={py(h0) - 6} className="ps__lbl ps__lbl--mid">object</text>
    </svg>
  );
}
