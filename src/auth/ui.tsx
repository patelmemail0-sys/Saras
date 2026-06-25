// Small shared bits for the auth screens.

export function LotusMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20 C 7 16 7 9 12 4 C 17 9 17 16 12 20 Z"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.4"
      />
      <path
        d="M12 20 C 8 18 4.5 14 4 9 C 9 10.5 11 15 12 20 Z"
        fill="none"
        stroke="var(--ink-3)"
        strokeWidth="1.2"
      />
      <path
        d="M12 20 C 16 18 19.5 14 20 9 C 15 10.5 13 15 12 20 Z"
        fill="none"
        stroke="var(--ink-3)"
        strokeWidth="1.2"
      />
      <line x1="3" y1="20.5" x2="21" y2="20.5" stroke="var(--ink-2)" strokeWidth="1" opacity="0.45" />
    </svg>
  )
}

export function BrandMark() {
  return (
    <span className="auth__brand">
      <LotusMark />
      <span>Saras</span>
    </span>
  )
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
