import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, Text } from '@react-three/drei'
import * as THREE from 'three'
import { WHORLS } from './roseCurve'
import { sceneAt, roomTextAt, easedIndex } from '../scrollScene'

export type RoomCopy = {
  id: string
  cell: number
  headline: string
  ribbon: string
}
const HEADLINE_FONT = '/fonts/ClashDisplay-Semibold.ttf'
// gentle curve on the text plane (decoupled from the orbit so the headline
// stays legible at the front; the orbit itself supplies the wrap)
const HEADLINE_CURVE = 2.3
// kinetic ribbon: large faded words on a band BEHIND the lotus, so the petals
// occlude and refract them as they slide past (z is behind every petal)
const RIBBON_Z = -1.95
const RIBBON_Y = 0.18
const RIBBON_SPACING = 6.2

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
        roughness: 0.06,
        ior: 1.4,
        iridescence: 1,
        iridescenceIOR: 1.5,
        iridescenceThicknessRange: [200, 880],
        clearcoat: 1,
        clearcoatRoughness: 0.09,
        metalness: 0,
        color: new THREE.Color('#e3eef7'),
        attenuationColor: new THREE.Color('#bcd2e6'),
        attenuationDistance: 3.8,
        specularColor: new THREE.Color('#eef5ff'),
        specularIntensity: 1,
        envMapIntensity: 2.7,
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
        // the solid lotus disintegrates into the shard burst
        group.current.visible = s.shatter < 0.62
      }
      material.opacity = 1 - Math.min(1, s.shatter / 0.5)
      for (let i = 0; i < petals.length; i++) {
        const mesh = meshes.current[i]
        if (!mesh) continue
        const p = petals[i]
        const o = Math.min(1, Math.max(0, (s.bloom - p.lead) / (1 - p.lead * 0.5)))
        mesh.rotation.set(THREE.MathUtils.lerp(0.12, p.openTilt, o), p.azimuth, 0)
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

// One room headline, rendered as glass-lit curved text orbiting the lotus on a
// vertical cylinder. Opaque core (alphaTest + depthWrite) so the petals occlude
// it as it passes behind, while the transmission pass refracts it through the
// glass; DoubleSide so the back face stays visible while it wraps around.
function RoomHeadline({
  room,
  progressRef,
}: {
  room: RoomCopy
  progressRef: MutableRefObject<number>
}) {
  const grp = useRef<THREE.Group>(null)
  const txt = useRef<THREE.Mesh & { material: THREE.Material & { opacity: number } }>(
    null,
  )
  useFrame(() => {
    const s = roomTextAt(room.cell, progressRef.current)
    const g = grp.current
    if (!g) return
    const vis = s.opacity > 0.012
    g.visible = vis
    if (!vis) return
    g.position.set(s.x, s.y, s.z)
    g.rotation.y = s.rotY
    g.scale.setScalar(s.scale)
    const m = txt.current?.material
    if (m) m.opacity = s.opacity
  })
  return (
    <group ref={grp}>
      <Text
        ref={txt as never}
        font={HEADLINE_FONT}
        // @ts-expect-error curveRadius is a valid troika-three-text prop, not in drei's Text types
        curveRadius={HEADLINE_CURVE}
        fontSize={0.235}
        maxWidth={2.45}
        lineHeight={1.08}
        letterSpacing={-0.012}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color="#eef5ff"
        fillOpacity={1}
        material-toneMapped={false}
        material-transparent
        material-depthWrite
        material-alphaTest={0.16}
        material-side={THREE.DoubleSide}
      >
        {room.headline}
      </Text>
    </group>
  )
}

function RoomHeadlines({
  rooms,
  progressRef,
}: {
  rooms: RoomCopy[]
  progressRef: MutableRefObject<number>
}) {
  return (
    <>
      {rooms.map((r) => (
        <RoomHeadline key={r.id} room={r} progressRef={progressRef} />
      ))}
    </>
  )
}

// The kinetic word band, rendered in the scene BEHIND the lotus. The whole band
// pans left with the corridor; word i sits dead-centre behind the lotus while
// its room (cell i+1) is centred, so the petals slice across it and the glass
// refracts it. Faded so it reads as an undertone, not a headline.
function KineticRibbon({
  words,
  progressRef,
}: {
  words: string[]
  progressRef: MutableRefObject<number>
}) {
  const grp = useRef<THREE.Group>(null)
  useFrame(() => {
    if (grp.current) {
      grp.current.position.x = -RIBBON_SPACING * (easedIndex(progressRef.current) - 1)
    }
  })
  return (
    <group ref={grp} position={[0, RIBBON_Y, RIBBON_Z]}>
      {words.map((w, i) => (
        <Text
          key={i}
          font={HEADLINE_FONT}
          position={[i * RIBBON_SPACING, 0, 0]}
          fontSize={1.05}
          letterSpacing={-0.02}
          anchorX="center"
          anchorY="middle"
          color="#b8cce4"
          fillOpacity={0.32}
          material-toneMapped={false}
          material-transparent
          material-depthWrite={false}
        >
          {w}
        </Text>
      ))}
    </group>
  )
}

// The shatter: a cloud of small translucent glass fragments that burst out of
// the lotus and spiral UP the screen on individual helices, then keep drifting
// in the final space scene. One instanced mesh of small tetrahedra rendered in
// the same cool blue glass as the lotus. All motion is a pure function of the
// `shatter` progress (+ time for the ongoing drift).
const SHARD_COUNT = 1000
const SHARD_ORIGIN_Y = -0.2

type Shard = {
  phase: number
  helixR: number
  turns: number
  rise: number
  delay: number
  size: number
  ax: THREE.Vector3
  spin: number
  bob: number
  drift: number
}

function ShardBurst({
  progressRef,
}: {
  progressRef: MutableRefObject<number>
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const quat = useMemo(() => new THREE.Quaternion(), [])
  const geo = useMemo(() => new THREE.TetrahedronGeometry(1, 0), [])
  const mat = useMemo(
    () =>
      // the same cool blue glass as the lotus, just smaller and translucent
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#bcd4ec'),
        metalness: 0,
        roughness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        iridescence: 0.5,
        iridescenceIOR: 1.4,
        iridescenceThicknessRange: [200, 760],
        transmission: 0.6, // translucent
        thickness: 0.5,
        ior: 1.4,
        attenuationColor: new THREE.Color('#a9c0db'),
        attenuationDistance: 2.6,
        specularColor: new THREE.Color('#eef5ff'),
        specularIntensity: 1,
        envMapIntensity: 2.5,
        transparent: true,
        fog: false,
      }),
    [],
  )
  const shards = useMemo<Shard[]>(() => {
    const arr: Shard[] = []
    for (let i = 0; i < SHARD_COUNT; i++) {
      arr.push({
        phase: Math.random() * Math.PI * 2,
        helixR: 0.5 + Math.random() * 3.1,
        turns: 0.5 + Math.random() * 1.8,
        // biased LOW (squared) so most shards linger in view drifting, while a
        // minority rocket up and off the top of the screen
        rise: 0.2 + Math.random() * Math.random() * 5.4,
        delay: Math.random() * 0.3,
        size: 0.35 + Math.random() * 1.15,
        ax: new THREE.Vector3(
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
        ).normalize(),
        spin: (0.5 + Math.random() * 2.2) * (Math.random() < 0.5 ? -1 : 1),
        bob: Math.random() * Math.PI * 2,
        drift: Math.random() * Math.PI * 2,
      })
    }
    return arr
  }, [])

  useFrame((state) => {
    const inst = ref.current
    if (!inst) return
    const s = sceneAt(progressRef.current).shatter
    const on = s > 0.001
    inst.visible = on
    if (!on) return
    const t = state.clock.elapsedTime
    for (let i = 0; i < SHARD_COUNT; i++) {
      const sh = shards[i]
      const si = Math.min(1, Math.max(0, (s - sh.delay) / (1 - sh.delay)))
      const e = 1 - Math.pow(1 - si, 3) // easeOutCubic
      // helix radius keeps gently breathing so the lingering cloud stays alive
      const radius = 0.12 + sh.helixR * e + Math.sin(t * 0.3 + sh.phase) * 0.16 * si
      const ang = sh.phase + e * sh.turns * Math.PI * 2 + t * 0.14
      const x = Math.sin(ang) * radius
      const z = Math.cos(ang) * radius
      const y =
        SHARD_ORIGIN_Y +
        e * sh.rise +
        Math.sin(t * 0.5 + sh.bob) * 0.22 * si +
        Math.cos(t * 0.23 + sh.drift) * 0.14 * si
      const pop = Math.min(1, si / 0.08)
      dummy.position.set(x, y, z)
      quat.setFromAxisAngle(sh.ax, t * sh.spin + sh.phase)
      dummy.quaternion.copy(quat)
      dummy.scale.setScalar(sh.size * 0.038 * pop)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
    }
    inst.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={ref}
      args={[geo, mat, SHARD_COUNT]}
      frustumCulled={false}
      visible={false}
    />
  )
}

// Deep-space starfield that fades in as the scene morphs past the shatter.
function SpaceField({
  progressRef,
}: {
  progressRef: MutableRefObject<number>
}) {
  const ref = useRef<THREE.Points>(null)
  const geo = useMemo(() => {
    const N = 2800
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const r = 12 + Math.random() * 34
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th)
      pos[i * 3 + 1] = r * Math.cos(ph)
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 2.2,
        color: new THREE.Color('#eaf2ff'),
        transparent: true,
        opacity: 0,
        sizeAttenuation: false, // crisp constant-size stars regardless of depth
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  )
  useFrame((state) => {
    const space = sceneAt(progressRef.current).space
    mat.opacity = space
    if (ref.current) {
      ref.current.visible = space > 0.001
      ref.current.rotation.y = state.clock.elapsedTime * 0.006
    }
  })
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} visible={false} />
}

function Backdrop({
  progressRef,
}: {
  progressRef?: MutableRefObject<number>
}) {
  // a localized glow halo the glass refracts (fades to obsidian so the rest of
  // the scene stays dark and deep, like water); fades away as space takes over
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    const space = progressRef ? sceneAt(progressRef.current).space : 0
    // keep this OPAQUE so the lotus transmission keeps refracting the glow (its
    // pearly luminosity); fade for the space scene by darkening the colour
    ;(ref.current.material as THREE.MeshBasicMaterial).color.setScalar(1 - space)
  })
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
    <mesh ref={ref} position={[0, 0.2, -2.6]} scale={[11, 8, 1]}>
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
function Atmosphere({
  progressRef,
}: {
  progressRef?: MutableRefObject<number>
}) {
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
  const skyRef = useRef<THREE.Mesh>(null)
  const a = useRef<THREE.Mesh>(null)
  const b = useRef<THREE.Mesh>(null)
  const d = useRef<THREE.Mesh>(null)
  // base opacities so the space-morph can dim each layer toward a faint nebula
  const base = useMemo(() => [0.5, 0.4, 0.36] as const, [])
  useFrame((s) => {
    const t = s.clock.elapsedTime
    if (a.current) a.current.position.set(-7 + Math.sin(t * 0.06) * 2.4, 3.5 + Math.cos(t * 0.05) * 1.6, -10)
    if (b.current) b.current.position.set(7 + Math.cos(t * 0.045) * 2.2, -3.5 + Math.sin(t * 0.05) * 1.6, -11)
    if (d.current) d.current.position.set(Math.sin(t * 0.03) * 3.5, 5.5 + Math.cos(t * 0.04) * 1.2, -9)
    const space = progressRef ? sceneAt(progressRef.current).space : 0
    const setOp = (m: THREE.Mesh | null, v: number) => {
      if (m) (m.material as THREE.Material & { opacity: number }).opacity = v
    }
    setOp(a.current, base[0] * (1 - space * 0.72))
    setOp(b.current, base[1] * (1 - space * 0.72))
    setOp(d.current, base[2] * (1 - space * 0.72))
    // the graded "water sky" stays OPAQUE (so the glass refracts it) but darkens
    // toward the deep space tone as the scene morphs
    if (skyRef.current) {
      ;(skyRef.current.material as THREE.MeshBasicMaterial).color.setScalar(
        1 - space * 0.78,
      )
    }
  })
  return (
    <group>
      <mesh ref={skyRef} scale={50}>
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
  rooms,
}: Omit<Refs, 'reduce'> & { rooms?: RoomCopy[] }) {
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

      <Atmosphere progressRef={progressRef} />
      <Backdrop progressRef={progressRef} />
      {progressRef && <SpaceField progressRef={progressRef} />}

      <Suspense fallback={null}>
        <Lotus
          bloomRef={bloomRef}
          focusRef={focusRef}
          progressRef={progressRef}
          reduce={reduce}
        />
        {progressRef && <ShardBurst progressRef={progressRef} />}
        {progressRef && rooms && rooms.length > 0 && (
          <>
            <KineticRibbon
              words={rooms.map((r) => r.ribbon)}
              progressRef={progressRef}
            />
            <RoomHeadlines rooms={rooms} progressRef={progressRef} />
          </>
        )}
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
