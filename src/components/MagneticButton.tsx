import { useRef, type ReactNode, type MouseEvent } from 'react'

type Props = {
  children: ReactNode
  href?: string
  variant?: 'primary' | 'ghost'
  onClick?: () => void
  className?: string
}

/**
 * Button that pulls slightly toward the cursor. Transform is written straight
 * to the node ref, so there's no React re-render on mousemove (60fps-safe).
 * Disabled under reduced-motion.
 */
export default function MagneticButton({
  children,
  href,
  variant = 'primary',
  onClick,
  className = '',
}: Props) {
  const ref = useRef<HTMLElement | null>(null)
  const reduce = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  function move(e: MouseEvent) {
    const el = ref.current
    if (!el || reduce.current) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - (r.left + r.width / 2)) * 0.22
    const y = (e.clientY - (r.top + r.height / 2)) * 0.3
    el.style.transform = `translate(${x}px, ${y}px)`
  }

  function reset() {
    const el = ref.current
    if (el) el.style.transform = ''
  }

  const setRef = (node: HTMLElement | null) => {
    ref.current = node
  }

  const cls = `btn btn--${variant} ${className}`.trim()

  if (href) {
    return (
      <a
        ref={setRef}
        className={cls}
        href={href}
        onClick={onClick}
        onMouseMove={move}
        onMouseLeave={reset}
      >
        <span>{children}</span>
      </a>
    )
  }
  return (
    <button
      ref={setRef}
      type="button"
      className={cls}
      onClick={onClick}
      onMouseMove={move}
      onMouseLeave={reset}
    >
      <span>{children}</span>
    </button>
  )
}
