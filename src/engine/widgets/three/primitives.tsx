/**
 * Reusable scene primitives shared by every 3D physics widget: a directed
 * vector (shaft + arrowhead), a ground grid, and a camera-facing text label.
 * Keeping these here means each widget only describes its physics geometry, and
 * vectors/labels look identical across topics.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { Grid, Billboard, Text } from '@react-three/drei';
import { emissive, PALETTE } from './materials';

const UP = new THREE.Vector3(0, 1, 0);
const FONT = '/fonts/ClashDisplay-Semibold.ttf';

/**
 * A 3D arrow from `origin` pointing along `dir`, drawn `length` world-units long.
 * `dir` need not be normalised — only its direction is used; `length` sets size.
 * Renders nothing for a vanishing length (keeps zero-magnitude vectors invisible).
 */
export function Vector3D({
  origin = [0, 0, 0],
  dir,
  length,
  color = PALETTE.azure,
  thickness = 0.028,
}: {
  origin?: [number, number, number];
  dir: [number, number, number];
  length: number;
  color?: string;
  thickness?: number;
}) {
  const quaternion = useMemo(() => {
    const d = new THREE.Vector3(dir[0], dir[1], dir[2]);
    const q = new THREE.Quaternion();
    if (d.lengthSq() > 1e-10) q.setFromUnitVectors(UP, d.normalize());
    return q;
  }, [dir]);

  const mat = useMemo(() => emissive(color), [color]);

  if (length <= 0.02) return null;

  const headLen = Math.min(0.24, length * 0.34);
  const shaftLen = Math.max(0.001, length - headLen);

  return (
    <group position={origin} quaternion={quaternion}>
      <mesh position={[0, shaftLen / 2, 0]} material={mat}>
        <cylinderGeometry args={[thickness, thickness, shaftLen, 12]} />
      </mesh>
      <mesh position={[0, shaftLen + headLen / 2, 0]} material={mat}>
        <coneGeometry args={[thickness * 2.4, headLen, 16]} />
      </mesh>
    </group>
  );
}

/** Subtle azure ground grid in the XZ plane, fading with distance. */
export function GroundGrid() {
  return (
    <Grid
      position={[0, -0.001, 0]}
      args={[30, 30]}
      cellSize={0.5}
      cellThickness={0.6}
      cellColor={PALETTE.grid}
      sectionSize={2}
      sectionThickness={1}
      sectionColor={PALETTE.azure}
      fadeDistance={22}
      fadeStrength={1.5}
      infiniteGrid
    />
  );
}

/** A short text label that always faces the camera. */
export function Label3D({
  position,
  children,
  color = PALETTE.pearl,
  size = 0.26,
}: {
  position: [number, number, number];
  children: string;
  color?: string;
  size?: number;
}) {
  return (
    <Billboard position={position}>
      <Text
        font={FONT}
        fontSize={size}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor={PALETTE.obsidian}
        material-toneMapped={false}
      >
        {children}
      </Text>
    </Billboard>
  );
}
