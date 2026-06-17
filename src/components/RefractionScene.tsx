import type { CSSProperties, ReactNode } from 'react'

/**
 * The signature visual: one input (a formula) enters a prism and refracts into
 * three distinct representations. Pure SVG + CSS motion (transform/opacity only).
 * The three output colors map 1:1 to the three representation channels.
 */
export default function RefractionScene() {
  return (
    <div className="scene" aria-hidden="true">
      <svg viewBox="0 0 600 460" className="scene__svg" role="presentation">
        <defs>
          <linearGradient id="beam" x1="0" x2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* input beam into the prism */}
        <line
          x1="36"
          y1="230"
          x2="232"
          y2="230"
          stroke="url(#beam)"
          strokeWidth="2"
        />
        <circle className="scene__spark" cx="36" cy="230" r="3" fill="var(--accent)" />

        {/* the prism */}
        <g className="scene__prism">
          <path
            d="M250 196 L300 280 L200 280 Z"
            fill="oklch(0.34 0.03 285)"
            stroke="var(--line)"
            strokeWidth="1.5"
          />
          <path d="M250 196 L300 280 L200 280 Z" fill="var(--accent)" opacity="0.06" />
        </g>

        {/* three refracted rays */}
        <path className="ray ray--a" d="M262 244 C 330 210, 360 150, 430 138" />
        <path className="ray ray--b" d="M268 252 C 340 250, 360 244, 430 240" />
        <path className="ray ray--c" d="M262 262 C 330 300, 360 350, 430 344" />

        {/* three representation tiles */}
        <Tile y={104} channel="a" label="MODEL">
          <CubeGlyph />
        </Tile>
        <Tile y={206} channel="b" label="ANALOGY">
          <PendulumGlyph />
        </Tile>
        <Tile y={308} channel="c" label="STEPS">
          <StepsGlyph />
        </Tile>
      </svg>
    </div>
  )
}

function Tile({
  y,
  channel,
  label,
  children,
}: {
  y: number
  channel: 'a' | 'b' | 'c'
  label: string
  children: ReactNode
}) {
  const color =
    channel === 'a'
      ? 'var(--ch-model)'
      : channel === 'b'
        ? 'var(--ch-analogy)'
        : 'var(--ch-steps)'
  return (
    <g className={`tile tile--${channel}`} transform={`translate(430 ${y})`}>
      <rect
        width="150"
        height="80"
        rx="12"
        fill="var(--bg-1)"
        stroke="var(--line)"
        strokeWidth="1"
      />
      <circle cx="16" cy="18" r="4" fill={color} />
      <text x="30" y="22" className="tile__label" fill="var(--ink-3)">
        {label}
      </text>
      <g transform="translate(16 32)">{children}</g>
    </g>
  )
}

function CubeGlyph() {
  // A small isometric block — the hands-on 3D "model" channel in miniature.
  return (
    <g className="cube-bob">
      <polygon
        points="56,1 69,8.5 56,16 43,8.5"
        fill="var(--ch-model)"
        fillOpacity="0.85"
        stroke="var(--ink)"
        strokeWidth="1"
      />
      <polygon
        points="69,8.5 69,23.5 56,31 56,16"
        fill="oklch(0.46 0.035 285)"
        stroke="var(--line)"
        strokeWidth="1"
      />
      <polygon
        points="43,8.5 56,16 56,31 43,23.5"
        fill="oklch(0.34 0.03 285)"
        stroke="var(--line)"
        strokeWidth="1"
      />
    </g>
  )
}

function PendulumGlyph() {
  return (
    <g>
      <line x1="0" y1="2" x2="118" y2="2" stroke="var(--line)" strokeWidth="1" />
      <g className="pendulum">
        <line x1="59" y1="2" x2="59" y2="34" stroke="var(--ink-3)" strokeWidth="1.5" />
        <circle cx="59" cy="38" r="6" fill="var(--ch-analogy)" />
      </g>
    </g>
  )
}

function StepsGlyph() {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i} className="step-row" style={{ '--i': i } as CSSProperties}>
          <rect y={i * 14} width="10" height="10" rx="3" fill="var(--ch-steps)" />
          <rect
            x="18"
            y={i * 14 + 2}
            width={92 - i * 22}
            height="6"
            rx="3"
            fill="var(--bg-2)"
          />
        </g>
      ))}
    </g>
  )
}
