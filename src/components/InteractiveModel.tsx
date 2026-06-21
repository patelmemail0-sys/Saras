import { useId, useMemo, useState } from 'react'

/**
 * A hands-on stand-in for the 3D "model" channel: drag the slider and a
 * parametric block reshapes in space — the structure responds in real time.
 * Stands in for the real manipulable 3D engine (built separately) and proves
 * the promise ("move one thing, watch the rest respond") on the page itself.
 * Pure SVG isometric projection, no 3D library.
 */
// Isometric projection: +x → down-right, +y → down-left, +z → up.
const C = 0.866 // cos(30°)
const S = 0.5 // sin(30°)
const UNIT = 30
const ORIGIN = { x: 130, y: 36 }
const iso = (x: number, y: number, z: number) => ({
  x: ORIGIN.x + (x - y) * C * UNIT,
  y: ORIGIN.y + ((x + y) * S - z) * UNIT,
})
const pts = (vs: { x: number; y: number }[]) =>
  vs.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ')

export default function InteractiveModel() {
  const [n, setN] = useState(1.4)
  const sliderId = useId()

  // The block scales with n on all three axes — algebra made spatial.
  const { top, left, right, gridTop } = useMemo(() => {
    const s = n // edge length in units
    const v = (x: number, y: number, z: number) => iso(x * s, y * s, z * s)
    return {
      top: [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
      right: [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)],
      left: [v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1)],
      // a couple of unit gridlines on the top face so it reads as "blocks"
      gridTop: [0.5].map((t) => ({
        a: iso(t * s, 0, s),
        b: iso(t * s, s, s),
        c: iso(0, t * s, s),
        d: iso(s, t * s, s),
      })),
    }
  }, [n])

  return (
    <div className="imodel">
      <svg viewBox="0 0 260 150" className="imodel__svg" aria-hidden="true">
        {/* ground shadow */}
        <ellipse
          cx={ORIGIN.x}
          cy={132}
          rx={26 + n * 18}
          ry={9 + n * 5}
          fill="oklch(0 0 0 / 0.35)"
        />
        {/* three visible faces: light top, mid right, dark left = chrome read */}
        <polygon points={pts(left)} fill="oklch(0.34 0.03 62)" stroke="var(--line)" strokeWidth="1" />
        <polygon points={pts(right)} fill="oklch(0.46 0.035 62)" stroke="var(--line)" strokeWidth="1" />
        <polygon points={pts(top)} fill="var(--ch-model)" fillOpacity="0.85" stroke="var(--ink)" strokeWidth="1" />
        {gridTop.map((g, i) => (
          <g key={i} stroke="oklch(1 0 0 / 0.4)" strokeWidth="0.75">
            <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} />
            <line x1={g.c.x} y1={g.c.y} x2={g.d.x} y2={g.d.y} />
          </g>
        ))}
      </svg>

      <div className="imodel__control">
        <label htmlFor={sliderId} className="imodel__readout">
          <span>size </span>
          <span className="imodel__coef">{n.toFixed(2)}</span>
          <span> → volume {(n * n * n).toFixed(2)}</span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={0.5}
          max={2}
          step={0.01}
          value={n}
          onChange={(e) => setN(parseFloat(e.target.value))}
          aria-label="Model size"
        />
      </div>
    </div>
  )
}
