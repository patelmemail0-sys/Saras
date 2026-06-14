import { useId, useMemo, useState } from 'react'

/**
 * A real, manipulable representation: drag the slider and the curve reshapes
 * live. Proves the core promise ("see what changes when you change it") on the
 * landing page itself, with no backend.
 */
export default function InteractiveGraph() {
  const [a, setA] = useState(1.4)
  const sliderId = useId()

  // y = a * x^2 sampled across the viewBox, mapped to SVG coords.
  const path = useMemo(() => {
    const W = 260
    const H = 150
    const pts: string[] = []
    for (let i = 0; i <= 40; i++) {
      const x = (i / 40) * 2 - 1 // -1..1
      const y = a * x * x // 0..a
      const px = ((x + 1) / 2) * W
      const py = H - (y / 2.4) * H - 6
      pts.push(`${px.toFixed(1)} ${Math.max(6, py).toFixed(1)}`)
    }
    return `M${pts.join(' L')}`
  }, [a])

  return (
    <div className="igraph">
      <svg viewBox="0 0 260 150" className="igraph__svg" aria-hidden="true">
        {[0.5, 1, 1.5, 2].map((g) => (
          <line
            key={g}
            x1="0"
            x2="260"
            y1={150 - (g / 2.4) * 150}
            y2={150 - (g / 2.4) * 150}
            stroke="var(--line-soft)"
            strokeWidth="1"
          />
        ))}
        <line x1="130" y1="0" x2="130" y2="150" stroke="var(--line-soft)" strokeWidth="1" />
        <path d={path} fill="none" stroke="var(--ch-graph)" strokeWidth="2.5" />
      </svg>

      <div className="igraph__control">
        <label htmlFor={sliderId} className="igraph__readout">
          <span>y = </span>
          <span className="igraph__coef">{a.toFixed(2)}</span>
          <span>x²</span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={0.2}
          max={2.4}
          step={0.01}
          value={a}
          onChange={(e) => setA(parseFloat(e.target.value))}
          aria-label="Coefficient a"
        />
      </div>
    </div>
  )
}
