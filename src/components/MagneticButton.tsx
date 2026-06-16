import { type ReactNode } from 'react'

type Props = {
  children: ReactNode
  href?: string
  variant?: 'primary' | 'ghost'
  onClick?: () => void
  className?: string
}

/**
 * Primary CTA button. Holds in place on hover — the chrome surface, bevel and
 * sheen sweep are all CSS, so the only hover motion is the light sweep, not the
 * button itself. (Previously this pulled toward the cursor; removed by request.)
 */
export default function MagneticButton({
  children,
  href,
  variant = 'primary',
  onClick,
  className = '',
}: Props) {
  const cls = `btn btn--${variant} ${className}`.trim()

  if (href) {
    return (
      <a className={cls} href={href} onClick={onClick}>
        <span>{children}</span>
      </a>
    )
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      <span>{children}</span>
    </button>
  )
}
