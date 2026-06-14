import { useId, useState, type FormEvent } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

/**
 * Early-access capture. Honest about being pre-product: no backend is wired,
 * so this validates and records intent locally (localStorage) and shows the
 * full interaction cycle (idle / loading / success / error).
 */
export default function EarlyAccessForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const inputId = useId()

  function validate(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (status === 'loading') return
    if (!validate(email)) {
      setStatus('error')
      setError('That email does not look right. Check it and try again.')
      return
    }
    setStatus('loading')
    setError('')
    // No server yet. Record intent locally so nothing is lost, then confirm.
    window.setTimeout(() => {
      try {
        const key = 'saras.earlyAccess'
        const prior: string[] = JSON.parse(localStorage.getItem(key) || '[]')
        if (!prior.includes(email.trim())) prior.push(email.trim())
        localStorage.setItem(key, JSON.stringify(prior))
        setStatus('success')
      } catch {
        setStatus('error')
        setError('Could not save locally. Your browser may be blocking storage.')
      }
    }, 650)
  }

  if (status === 'success') {
    return (
      <div className="ea ea--done" role="status">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.2 4.2L19 7"
            stroke="var(--accent)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <strong>You are on the list.</strong>
          <p>We will reach out before the first build goes live. No spam, ever.</p>
        </div>
      </div>
    )
  }

  return (
    <form className="ea" onSubmit={onSubmit} noValidate>
      <label htmlFor={inputId} className="ea__label">
        Get early access
      </label>
      <div className="ea__row">
        <input
          id={inputId}
          type="email"
          inputMode="email"
          placeholder="you@school.edu"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (status === 'error') setStatus('idle')
          }}
          aria-invalid={status === 'error'}
          aria-describedby={status === 'error' ? `${inputId}-err` : undefined}
          className="ea__input"
        />
        <button type="submit" className="btn btn--primary" disabled={status === 'loading'}>
          <span>{status === 'loading' ? 'Adding…' : 'Join the list'}</span>
        </button>
      </div>
      {status === 'error' && (
        <p id={`${inputId}-err`} className="ea__error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
