/**
 * Scene3D — the reusable react-three-fiber stage every physics model renders
 * into. It owns the look (obsidian background, fog, the same light + Environment
 * rig as the landing lotus), the camera, gentle OrbitControls, a dpr cap, and
 * the render policy. Widgets pass only their physics geometry as children.
 *
 * Performance: `frameloop` defaults to 'demand' (render only when something
 * changes) — a widget flips it to 'always' while it is animating. Under
 * prefers-reduced-motion the stage is forced to 'demand' with no auto-rotation.
 *
 * Optional axis-snap (`axisSnap`): small X/Y/Z buttons that glide the camera to
 * look straight down an axis (so you view the plane perpendicular to it), plus a
 * reset to the default 3D view. Distance and target are preserved.
 */
import { Suspense, useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { PALETTE } from './materials';
import { GroundGrid } from './primitives';
import { useReducedMotion } from './useReducedMotion';

type Axis = 'x' | 'y' | 'z' | 'home';
interface SnapApi {
  snap: (axis: Axis) => void;
}

export interface Scene3DProps {
  children: ReactNode;
  /** Accessible description, mirrors the old `<svg aria-label>`. */
  label: string;
  camera?: { position: [number, number, number]; fov?: number };
  controls?: {
    enabled?: boolean;
    enablePan?: boolean;
    minDistance?: number;
    maxDistance?: number;
    minPolarAngle?: number;
    maxPolarAngle?: number;
    target?: [number, number, number];
    autoRotate?: boolean;
  };
  /** 'always' = continuous rAF (use while animating); 'demand' = on change only. */
  frameloop?: 'always' | 'demand';
  dpr?: [number, number];
  /** 'full' = 3-light Lightformer rig; 'lite' = single Lightformer (cheaper). */
  env?: 'full' | 'lite';
  ground?: boolean;
  /** Show the X/Y/Z plane-snap buttons. */
  axisSnap?: boolean;
}

// Minimal slice of three's OrbitControls we drive for axis snapping.
type OrbitLike = {
  getAzimuthalAngle(): number;
  getPolarAngle(): number;
  setAzimuthalAngle(v: number): void;
  setPolarAngle(v: number): void;
  update(): void;
};

/**
 * Lives inside the Canvas; exposes an imperative `snap` on `apiRef` that glides
 * the (default) OrbitControls to an axis-aligned view by tweening its spherical
 * angles. Keeps the current distance and target.
 */
function CameraRig({
  apiRef,
  reduce,
}: {
  apiRef: MutableRefObject<SnapApi | null>;
  reduce: boolean;
}) {
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  const invalidate = useThree((s) => s.invalidate);
  const home = useRef<{ az: number; polar: number } | null>(null);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!controls) return;
    if (!home.current) {
      home.current = { az: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() };
    }

    const tween = (az: number, polar: number) => {
      if (raf.current) cancelAnimationFrame(raf.current);
      const sAz = controls.getAzimuthalAngle();
      const sPolar = controls.getPolarAngle();
      let dAz = az - sAz;
      dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz)); // shortest way round
      const dPolar = polar - sPolar;
      const dur = reduce ? 0 : 420;
      let t0: number | undefined;
      const step = (now: number) => {
        if (t0 === undefined) t0 = now;
        const u = dur === 0 ? 1 : Math.min(1, (now - t0) / dur);
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // easeInOutCubic
        controls.setAzimuthalAngle(sAz + dAz * e);
        controls.setPolarAngle(sPolar + dPolar * e);
        controls.update();
        invalidate();
        if (u < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    };

    apiRef.current = {
      snap: (axis) => {
        if (axis === 'x') tween(Math.PI / 2, Math.PI / 2); // look down X → Y-Z plane (side)
        else if (axis === 'z') tween(0, Math.PI / 2); //        look down Z → X-Y plane (front)
        else if (axis === 'y') tween(controls.getAzimuthalAngle(), 0.04 * Math.PI); // down Y → X-Z (top)
        else if (home.current) tween(home.current.az, home.current.polar); // reset to 3D
      },
    };

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      apiRef.current = null;
    };
  }, [controls, invalidate, apiRef, reduce]);

  return null;
}

export default function Scene3D({
  children,
  label,
  camera = { position: [4.6, 3.2, 5.2], fov: 44 },
  controls,
  frameloop = 'demand',
  dpr,
  env = 'full',
  ground = true,
  axisSnap = false,
}: Scene3DProps) {
  const reduce = useReducedMotion();
  const effectiveFrameloop = reduce ? 'demand' : frameloop;
  const effectiveDpr = dpr ?? (reduce ? [1, 1.25] : [1, 1.6]);
  const snapApi = useRef<SnapApi | null>(null);

  const c = {
    enabled: controls?.enabled ?? true,
    enablePan: controls?.enablePan ?? false,
    minDistance: controls?.minDistance ?? 2.4,
    maxDistance: controls?.maxDistance ?? 12,
    // Axis snapping needs a near-overhead view, so loosen the polar clamp for it.
    minPolarAngle: axisSnap ? 0.04 * Math.PI : controls?.minPolarAngle ?? Math.PI * 0.12,
    maxPolarAngle: axisSnap ? 0.96 * Math.PI : controls?.maxPolarAngle ?? Math.PI * 0.86,
    target: controls?.target ?? ([0, 0.3, 0] as [number, number, number]),
    autoRotate: (controls?.autoRotate ?? false) && !reduce,
  };

  // Some embedded browsers don't fire the initial ResizeObserver; nudge a resize
  // so the canvas measures its container on mount. No-op in normal browsers.
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <Canvas
        frameloop={effectiveFrameloop}
        camera={{ position: camera.position, fov: camera.fov ?? 44 }}
        dpr={effectiveDpr}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        // Absolute-fill the `.ps__canvas` parent (which is position:relative).
        // Do NOT simplify to plain height:100%: in the stacked/mobile layout
        // (≤760px) `.viz` drops to height:auto, so the whole flex chain becomes
        // indefinite and `.ps__canvas` only has height via `min-height:300px`.
        // A percentage height can't resolve against that indefinite parent and
        // collapses to ~half (150px); R3F then sizes the canvas to the wrong
        // box. Absolute inset resolves against the parent's *used* height, which
        // is reliably 300px, so the canvas fills correctly on phones too.
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block' }}
        role="img"
        aria-label={label}
      >
        <color attach="background" args={[PALETTE.obsidian]} />
        <fog attach="fog" args={[PALETTE.fog, 11, 32]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 6, 5]} intensity={1.4} />
        <directionalLight position={[-5, 3, -4]} intensity={0.55} color="#bcd0e0" />
        <pointLight position={[0, 2, 4]} intensity={1.2} color="#eaf2f8" />

        {ground && <GroundGrid />}

        <Suspense fallback={null}>{children}</Suspense>

        {c.enabled && (
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan={c.enablePan}
            minDistance={c.minDistance}
            maxDistance={c.maxDistance}
            minPolarAngle={c.minPolarAngle}
            maxPolarAngle={c.maxPolarAngle}
            target={c.target}
            autoRotate={c.autoRotate}
            autoRotateSpeed={0.6}
          />
        )}
        {axisSnap && c.enabled && <CameraRig apiRef={snapApi} reduce={reduce} />}

        <Environment resolution={env === 'lite' ? 128 : 256}>
          {env === 'full' ? (
            <>
              <Lightformer form="rect" intensity={3.2} position={[3, 4, 4]} scale={[6, 6, 1]} color="#ffffff" />
              <Lightformer form="rect" intensity={2} position={[-4, 2, 3]} scale={[4, 5, 1]} color="#cfe0ea" />
              <Lightformer form="ring" intensity={2.4} position={[0, 1, 5]} scale={4} color="#dfeaf4" />
            </>
          ) : (
            <Lightformer form="rect" intensity={2.6} position={[2, 4, 4]} scale={[6, 6, 1]} color="#ffffff" />
          )}
        </Environment>
      </Canvas>

      {axisSnap && (
        <div className="scene3d__axes" role="group" aria-label="Snap view to a plane">
          <button type="button" title="Side view — look down the X axis (Y-Z plane)" onClick={() => snapApi.current?.snap('x')}>X</button>
          <button type="button" title="Top view — look down the Y axis (X-Z plane)" onClick={() => snapApi.current?.snap('y')}>Y</button>
          <button type="button" title="Front view — look down the Z axis (X-Y plane)" onClick={() => snapApi.current?.snap('z')}>Z</button>
          <button type="button" className="scene3d__axes-reset" title="Reset to 3D view" onClick={() => snapApi.current?.snap('home')}>3D</button>
        </div>
      )}
    </>
  );
}
