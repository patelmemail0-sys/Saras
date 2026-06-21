import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { WHORLS } from './roseCurve'
import { sceneAt } from '../scrollScene'

// Full 3D glass lotus. Each petal is a cupped surface with a physically-based
// transmissive (refractive) material plus iridescence and clearcoat, lit by a
// Lightformer environment and a glowing backdrop the glass refracts so it reads
// luminous, like a blown-glass object. Scroll drives the bloom and drift.

type Refs = {
  bloomRef: MutableRefObject<number>
  focusRef: MutableRefObject<number>
  progressRef?: MutableRefObject<number>
  reduce: boolean
}

function makePetalGeometry(len: number, wid: number) {
  const geo = new THREE.PlaneGeometry(1, 1, 12, 20)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getY(i) + 0.5
    const v = pos.getX(i)
    const halfW = wid * Math.pow(Math.sin(Math.PI * u), 0.7) * (1 - 0.35 * u)
    const x = v * 2 * halfW
    const y = u * len
    const cup =
      0.16 * len * (1 - Math.cos(Math.PI * u)) * 0.5 +
      0.85 * halfW * (v * 2) * (v * 2) * (0.3 + 0.7 * u)
    pos.setXYZ(i, x, y, cup)
  }
  geo.computeVertexNormals()
  return geo
}

type Petal = {
  geo: THREE.BufferGeometry
  azimuth: number
  openTilt: number
  lead: number
  whorl: number
}

const BASE_SCALE = 1.32 // overall lotus size

function Lotus({ bloomRef, focusRef, progressRef, reduce }: Refs) {
  const group = useRef<THREE.Group>(null)
  const meshes = useRef<THREE.Mesh[]>([])
  const cur = useRef({ bloom: 0.2, focus: 0.5, spin: 0, progress: 0 })

  // lower tilt = more cupped (petals stay more upright when open)
  const openByWhorl = [0.96, 0.72, 0.48]
  const lenByWhorl = [1.0, 0.74, 0.5]
  const widByWhorl = [0.34, 0.3, 0.26]

  const petals = useMemo<Petal[]>(() => {
    const arr: Petal[] = []
    WHORLS.forEach((w, wi) => {
      const geo = makePetalGeometry(lenByWhorl[wi], widByWhorl[wi])
      for (let i = 0; i < w.count; i++) {
        arr.push({
          geo,
          azimuth: w.phase + (i / w.count) * Math.PI * 2,
          openTilt: openByWhorl[wi],
          lead: wi * 0.16 + (i / w.count) * 0.08,
          whorl: wi,
        })
      }
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        transmission: 1,
        thickness: 0.5,
        roughness: 0.07,
        ior: 1.4,
        iridescence: 1,
        iridescenceIOR: 1.5,
        iridescenceThicknessRange: [180, 780],
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        metalness: 0,
        color: new THREE.Color('#dde9f4'),
        attenuationColor: new THREE.Color('#a9c0db'),
        attenuationDistance: 3.0,
        specularColor: new THREE.Color('#eaf2ff'),
        specularIntensity: 1,
        envMapIntensity: 2.1,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    [],
  )

  useFrame((state, delta) => {
    // HORIZONTAL CORRIDOR: the whole lotus is driven by one scroll progress.
    if (progressRef) {
      cur.current.progress += (progressRef.current - cur.current.progress) * 0.08
      const s = sceneAt(cur.current.progress)
      if (group.current) {
        group.current.rotation.y =
          s.spin + (reduce ? 0 : Math.sin(state.clock.elapsedTime * 0.2) * 0.02)
        group.current.rotation.x = s.tiltX
        group.current.rotation.z = reduce ? 0 : Math.sin(state.clock.elapsedTime * 0.3) * 0.03
        group.current.position.set(0, s.posY, s.posZ)
        group.current.scale.setScalar(BASE_SCALE * s.scale)
      }
      for (let i = 0; i < petals.length; i++) {
        const mesh = meshes.current[i]
        if (!mesh) continue
        const p = petals[i]
        const o = Math.min(1, Math.max(0, (s.bloom - p.lead) / (1 - p.lead * 0.5)))
        mesh.rotation.set(THREE.MathUtils.lerp(0.12, p.openTilt, o), p.azimuth, 0)
        // outer-whorl petals detach radially during the "shards" room
        if (p.whorl === 0 && s.shard > 0.001) {
          const d = s.shard * 0.95
          mesh.position.set(Math.sin(p.azimuth) * d, 0, Math.cos(p.azimuth) * d)
        } else if (mesh.position.lengthSq() > 0) {
          mesh.position.set(0, 0, 0)
        }
      }
      return
    }

    // VERTICAL FALLBACK: bloom + drift from refs, idle spin.
    cur.current.bloom += (bloomRef.current - cur.current.bloom) * 0.08
    cur.current.focus += (focusRef.current - cur.current.focus) * 0.06
    if (!reduce) cur.current.spin += delta * 0.13
    const bloom = cur.current.bloom

    if (group.current) {
      group.current.rotation.y = cur.current.spin
      group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.3) * 0.04
      group.current.position.x = (cur.current.focus - 0.5) * 4.6
      group.current.position.y =
        -0.35 + (reduce ? 0 : Math.sin(state.clock.elapsedTime * 0.6) * 0.05)
      group.current.scale.setScalar(BASE_SCALE)
    }

    for (let i = 0; i < petals.length; i++) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      const p = petals[i]
      const o = Math.min(1, Math.max(0, (bloom - p.lead) / (1 - p.lead * 0.5)))
      const tilt = THREE.MathUtils.lerp(0.12, p.openTilt, o)
      mesh.rotation.set(tilt, p.azimuth, 0)
    }
  })

  return (
    <group ref={group} rotation-x={-0.18}>
      {petals.map((p, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) {
              // YXZ: distribute around the vertical axis first, THEN tilt the
              // petal outward, so the bloom fans open instead of clustering.
              m.rotation.order = 'YXZ'
              meshes.current[i] = m
            }
          }}
          geometry={p.geo}
          material={material}
        />
      ))}
    </group>
  )
}

function Backdrop() {
  // a localized glow halo the glass refracts (fades to obsidian so the rest of
  // the scene stays dark and deep, like water)
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const g = c.getContext('2d')
    if (g) {
      g.fillStyle = '#0a0e13'
      g.fillRect(0, 0, 512, 512)
      const grad = g.createRadialGradient(256, 236, 0, 256, 256, 250)
      grad.addColorStop(0, '#c9d6e6')
      grad.addColorStop(0.28, '#5d6d8c')
      grad.addColorStop(0.55, '#1a212c')
      grad.addColorStop(1, '#0a0e13')
      g.fillStyle = grad
      g.fillRect(0, 0, 512, 512)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  return (
    <mesh position={[0, 0.2, -2.6]} scale={[11, 8, 1]}>
      <planeGeometry />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  )
}

function verticalGradient(stops: [number, string][]) {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256)
    for (const [o, col] of stops) grad.addColorStop(o, col)
    g.fillStyle = grad
    g.fillRect(0, 0, 4, 256)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function radialGlow() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, 'rgba(255,255,255,0.9)')
    grad.addColorStop(0.4, 'rgba(255,255,255,0.28)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
  }
  const t = new THREE.CanvasTexture(c)
  return t
}

// Soft atmospheric depth so the background is not a harsh flat black: a graded
// sky sphere plus slow-drifting coloured glows behind the lotus.
function Atmosphere() {
  const sky = useMemo(
    () =>
      verticalGradient([
        [0, '#243352'],
        [0.42, '#121d31'],
        [0.72, '#0b1322'],
        [1, '#070b13'],
      ]),
    [],
  )
  const glow = useMemo(() => radialGlow(), [])
  const a = useRef<THREE.Mesh>(null)
  const b = useRef<THREE.Mesh>(null)
  const d = useRef<THREE.Mesh>(null)
  useFrame((s) => {
    const t = s.clock.elapsedTime
    if (a.current) a.current.position.set(-7 + Math.sin(t * 0.06) * 2.4, 3.5 + Math.cos(t * 0.05) * 1.6, -10)
    if (b.current) b.current.position.set(7 + Math.cos(t * 0.045) * 2.2, -3.5 + Math.sin(t * 0.05) * 1.6, -11)
    if (d.current) d.current.position.set(Math.sin(t * 0.03) * 3.5, 5.5 + Math.cos(t * 0.04) * 1.2, -9)
  })
  return (
    <group>
      <mesh scale={50}>
        <sphereGeometry args={[1, 40, 40]} />
        <meshBasicMaterial map={sky} side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      <mesh ref={a} scale={15}>
        <planeGeometry />
        <meshBasicMaterial map={glow} color="#4f6fb4" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </mesh>
      <mesh ref={b} scale={16}>
        <planeGeometry />
        <meshBasicMaterial map={glow} color="#7d61b4" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </mesh>
      <mesh ref={d} scale={13}>
        <planeGeometry />
        <meshBasicMaterial map={glow} color="#3f93b4" transparent opacity={0.36} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </mesh>
    </group>
  )
}

export default function LotusCanvas({
  bloomRef,
  focusRef,
  progressRef,
}: Omit<Refs, 'reduce'>) {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Nudge the renderer to measure its container on mount (some embedded
  // browsers don't fire the initial ResizeObserver). No-op in normal browsers.
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 60)
    return () => clearTimeout(id)
  }, [])

  return (
    <Canvas
      camera={{ position: [0, 0.5, 5.2], fov: 40 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#0b1120']} />
      <fog attach="fog" args={['#0e1626', 9, 22]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 5, 4]} intensity={1.5} />
      <directionalLight position={[-4, 2, -3]} intensity={0.6} color="#bcd0e0" />
      <pointLight position={[0, 1, 3.5]} intensity={1.6} color="#eaf2f8" />

      <Atmosphere />
      <Backdrop />

      <Suspense fallback={null}>
        <Lotus
          bloomRef={bloomRef}
          focusRef={focusRef}
          progressRef={progressRef}
          reduce={reduce}
        />
        <Environment resolution={256}>
          <Lightformer
            form="rect"
            intensity={4}
            position={[3, 4, 4]}
            scale={[6, 6, 1]}
            color="#ffffff"
          />
          <Lightformer
            form="rect"
            intensity={2.4}
            position={[-4, 2, 3]}
            scale={[4, 5, 1]}
            color="#cfe0ea"
          />
          <Lightformer
            form="ring"
            intensity={3}
            position={[0, 1, 5]}
            scale={4}
            color="#dfeaf4"
          />
          <Lightformer
            form="circle"
            intensity={2}
            position={[0, -3, 3]}
            scale={4}
            color="#9fb6c8"
          />
        </Environment>
      </Suspense>
    </Canvas>
  )
}
