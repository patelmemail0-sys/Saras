import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Aurora from '../components/Aurora'
import { useAuth } from './useAuth'
import { BrandMark, GoogleIcon } from './ui'
import { GRADE_LEVELS, SUBJECTS, type GradeLevel, type SubjectId } from './types'
import './auth.css'

const STASH_KEY = 'saras.onboarding.pending'

type Stash = {
  full_name: string
  grade_level: GradeLevel | null
  subjects: SubjectId[]
}

function readStash(): Partial<Stash> {
  try {
    return JSON.parse(localStorage.getItem(STASH_KEY) || '{}')
  } catch {
    return {}
  }
}

function isComplete(s: Partial<Stash>): s is Stash {
  return Boolean(s.full_name && s.grade_level && s.subjects && s.subjects.length > 0)
}

/**
 * New-user onboarding. Collects name → grade → subjects, then either creates
 * the account (email+password / Google) or, for an already-authenticated user
 * (Google returnee, or someone who confirmed their email), finishes and saves.
 */
export default function Onboarding() {
  const { loading, session, profile, saveOnboarding } = useAuth()
  const completed = Boolean(profile?.onboarding_completed)
  const applying = useRef(false)

  // A returning user (Google round-trip, or someone who just confirmed their
  // email) lands here with a session and a complete stash. Apply it once and
  // send them on, instead of making them re-click through every step.
  const autoApply = !loading && Boolean(session) && !completed && isComplete(readStash())

  useEffect(() => {
    if (loading || !session) return

    if (completed) {
      window.location.hash = '/try'
      return
    }

    const stash = readStash()
    if (isComplete(stash) && !applying.current) {
      applying.current = true
      saveOnboarding({
        full_name: stash.full_name,
        grade_level: stash.grade_level,
        subjects: stash.subjects,
      }).then((res) => {
        if (res.error) {
          applying.current = false
          return
        }
        localStorage.removeItem(STASH_KEY)
        window.location.hash = '/try'
      })
    }
  }, [loading, session, completed, saveOnboarding])

  if (loading || completed || autoApply) {
    return (
      <div className="auth">
        <Aurora />
      </div>
    )
  }

  return <Wizard key={session ? 'in' : 'out'} hasSession={Boolean(session)} />
}

function Wizard({ hasSession }: { hasSession: boolean }) {
  const { profile, signUpWithPassword, signInWithGoogle, saveOnboarding } = useAuth()
  const stash = useMemo(() => readStash(), [])

  const [fullName, setFullName] = useState(profile?.full_name ?? stash.full_name ?? '')
  const [grade, setGrade] = useState<GradeLevel | null>(profile?.grade_level ?? stash.grade_level ?? null)
  const [subjects, setSubjects] = useState<SubjectId[]>(profile?.subjects ?? stash.subjects ?? [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  // Profile steps, plus the account step only when no one is signed in yet.
  const steps = hasSession ? (['name', 'grade', 'subjects'] as const) : (['name', 'grade', 'subjects', 'account'] as const)
  const current = steps[step]
  const isLast = step === steps.length - 1

  function toggleSubject(id: SubjectId) {
    setSubjects((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  function canAdvance(): boolean {
    if (current === 'name') return fullName.trim().length > 0
    if (current === 'grade') return grade != null
    if (current === 'subjects') return subjects.length > 0
    return true
  }

  async function finish() {
    const { error } = await saveOnboarding({ full_name: fullName.trim(), grade_level: grade, subjects })
    if (error) {
      setError(error)
      setBusy(false)
      return
    }
    localStorage.removeItem(STASH_KEY)
    window.location.hash = '/try'
  }

  async function createAccount() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('That email does not look right.')
      return
    }
    if (password.length < 6) {
      setError('Use a password with at least 6 characters.')
      return
    }
    setBusy(true)
    setError('')
    const res = await signUpWithPassword(email.trim(), password, { full_name: fullName.trim() })
    if (res.error) {
      setError(res.error)
      setBusy(false)
      return
    }
    if (res.hasSession) {
      await finish()
      return
    }
    // Email confirmation required: stash answers so they apply after confirm.
    localStorage.setItem(
      STASH_KEY,
      JSON.stringify({ full_name: fullName.trim(), grade_level: grade, subjects } satisfies Stash),
    )
    setBusy(false)
    setCheckEmail(true)
  }

  async function onNext(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!canAdvance()) return
    setError('')
    if (!isLast) {
      setStep((s) => s + 1)
      return
    }
    if (current === 'account') {
      await createAccount()
    } else {
      setBusy(true)
      await finish()
    }
  }

  async function onGoogle() {
    // Hold answers across the OAuth round-trip.
    localStorage.setItem(
      STASH_KEY,
      JSON.stringify({ full_name: fullName.trim(), grade_level: grade, subjects } satisfies Stash),
    )
    setError('')
    const { error } = await signInWithGoogle()
    if (error) setError(error)
  }

  if (checkEmail) {
    return (
      <div className="auth">
        <Aurora />
        <div className="auth__card">
          <BrandMark />
          <h1 className="auth__title">Check your email</h1>
          <p className="auth__sub">
            We sent a confirmation link to <strong>{email.trim()}</strong>. Click it to finish setting
            up your account. Your answers are saved.
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => (window.location.hash = '/login')}
          >
            <span>Go to login</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth">
      <Aurora />
      <form className="auth__card" onSubmit={onNext} noValidate>
        <BrandMark />
        <div className="auth__steps" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s} className={i <= step ? 'is-on' : ''} />
          ))}
        </div>

        {current === 'name' && (
          <>
            <h1 className="auth__title">What should we call you?</h1>
            <p className="auth__sub">A first name is fine.</p>
            <label className="field">
              <span className="field__label">Your name</span>
              <input
                className="field__input"
                placeholder="Ada Lovelace"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
              />
            </label>
          </>
        )}

        {current === 'grade' && (
          <>
            <h1 className="auth__title">What is your education level?</h1>
            <p className="auth__sub">So we can match examples to your level.</p>
            <div className="choices" role="group" aria-label="Education level">
              {GRADE_LEVELS.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  className="chip"
                  aria-pressed={grade === g.id}
                  onClick={() => setGrade(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </>
        )}

        {current === 'subjects' && (
          <>
            <h1 className="auth__title">What topics do you want to focus on?</h1>
            <p className="auth__sub">Pick at least one. You can change this later.</p>
            <div className="choices" role="group" aria-label="Subjects of interest">
              {SUBJECTS.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="chip"
                  aria-pressed={subjects.includes(s.id)}
                  onClick={() => toggleSubject(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}

        {current === 'account' && (
          <>
            <h1 className="auth__title">Create your account</h1>
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
                autoComplete="new-password"
                className="field__input"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="auth__or">or</div>
            <button type="button" className="btn btn--google" onClick={onGoogle}>
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>
          </>
        )}

        {error && <p className="auth__error" role="alert">{error}</p>}

        <div className="auth__nav">
          <button
            type="button"
            className="auth__back"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            ← Back
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !canAdvance()}>
            <span>
              {busy
                ? 'Saving…'
                : isLast
                  ? current === 'account'
                    ? 'Create account'
                    : 'Finish'
                  : 'Continue'}
            </span>
          </button>
        </div>

        {current === 'name' && (
          <p className="auth__alt">
            Already have an account?{' '}
            <button type="button" onClick={() => (window.location.hash = '/login')}>
              Log in
            </button>
          </p>
        )}
      </form>
    </div>
  )
}
