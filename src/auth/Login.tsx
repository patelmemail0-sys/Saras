import { useEffect, useState, type FormEvent } from 'react'
import Aurora from '../components/Aurora'
import { useAuth } from './useAuth'
import { BrandMark, GoogleIcon } from './ui'
import './auth.css'

/**
 * Returning-user login: email + password or Google. New users are nudged to
 * /#/get-started (the onboarding flow). On success Root routes them onward.
 */
export default function Login() {
  const { session, profile, loading, signInWithPassword, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Already authenticated → leave the login screen.
  useEffect(() => {
    if (loading || !session) return
    window.location.hash = profile?.onboarding_completed ? '/try' : '/get-started'
  }, [loading, session, profile])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const { error } = await signInWithPassword(email.trim(), password)
    if (error) {
      setError(error)
      setBusy(false)
    }
    // success: the effect above redirects once the session lands.
  }

  async function onGoogle() {
    setError('')
    const { error } = await signInWithGoogle()
    if (error) setError(error)
  }

  return (
    <div className="auth">
      <Aurora />
      <div className="auth__card">
        <BrandMark />
        <h1 className="auth__title">Welcome back</h1>
        <p className="auth__sub">Log in to pick up where you left off.</p>

        <form onSubmit={onSubmit} noValidate>
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              className="field__input"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="field__input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="auth__error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            <span>{busy ? 'Logging in…' : 'Log in'}</span>
          </button>
        </form>

        <div className="auth__or">or</div>
        <button type="button" className="btn btn--google" onClick={onGoogle}>
          <GoogleIcon />
          <span>Continue with Google</span>
        </button>

        <p className="auth__alt">
          New to Saras?{' '}
          <button type="button" onClick={() => (window.location.hash = '/get-started')}>
            Create an account
          </button>
        </p>
      </div>
    </div>
  )
}
