/**
 * Material kit + palette for the 3D physics scenes — the "clean 3D, glass
 * accents" treatment. Matte pearl/chrome surfaces carry most of the scene
 * (cheap, on-aesthetic); transmissive glass is reserved for the ONE focal
 * object per scene (the orbiting ball, the spring bob, the block). Colours are
 * the cool obsidian/pearl/azure tones lifted from the landing lotus so the
 * engine and the landing read as one system.
 *
 * Factories return fresh THREE materials; call them inside a `useMemo` so each
 * mesh keeps a stable instance across renders.
 */
import * as THREE from 'three';

export const PALETTE = {
  /** Deep obsidian scene background. */
  obsidian: '#0b1120',
  /** Fog tone (slightly lifted from obsidian). */
  fog: '#0e1626',
  /** Glass body tint. */
  glass: '#e3eef7',
  /** Glass attenuation (cool blue) — what the glass tints transmitted light. */
  attenuation: '#bcd2e6',
  /** Matte pearl — default solid surfaces. */
  pearl: '#cfdcea',
  /** Brushed chrome — axes, plates, markers. */
  chrome: '#dfe8f2',
  /** Azure — primary accent: vectors, rings, live highlights. */
  azure: '#7fb2ff',
  /** Warm azure — the secondary vector (e.g. acceleration vs velocity). */
  azureWarm: '#ffc27f',
  /** Faint grid cell colour. */
  grid: '#27364e',
} as const;

/** Matte pearl physical material — the default for most solids. No transmission. */
export function pearl(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(PALETTE.pearl),
    metalness: 0,
    roughness: 0.4,
    clearcoat: 0.6,
    clearcoatRoughness: 0.28,
    envMapIntensity: 1.1,
  });
}

/** Brushed chrome — small metallic accents (axes, plates, centre markers). */
export function chrome(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.chrome),
    metalness: 0.9,
    roughness: 0.22,
    envMapIntensity: 1.4,
  });
}

/**
 * Glass accent — light transmission + clearcoat + a touch of iridescence. Use
 * on the single focal object only; it is the most expensive material here.
 */
export function glassAccent(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(PALETTE.glass),
    metalness: 0,
    roughness: 0.08,
    transmission: 0.7,
    thickness: 0.6,
    ior: 1.4,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    iridescence: 0.5,
    iridescenceIOR: 1.4,
    attenuationColor: new THREE.Color(PALETTE.attenuation),
    attenuationDistance: 2.2,
    envMapIntensity: 2,
    transparent: true,
  });
}

/** Emissive material for vectors, rings, glows. `toneMapped:false` keeps it crisp. */
export function emissive(color: string, intensity = 0.65): THREE.MeshStandardMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0,
    toneMapped: false,
  });
}
