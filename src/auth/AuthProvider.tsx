import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext, type AuthContextValue, type AuthResult } from './authContext'
import type { Profile } from './types'

const PROFILE_COLUMNS = 'id, email, full_name, grade_level, subjects, onboarding_completed'

/** Map Supabase auth errors to short, student-friendly messages. */
function friendly(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return 'That email and password do not match.'
  if (m.includes('already registered')) return 'An account with that email already exists. Try logging in.'
  if (m.includes('password should be')) return 'Use a password with at least 6 characters.'
  if (m.includes('email not confirmed')) return 'Check your inbox to confirm your email, then log in.'
  return message
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  // Avoid clobbering newer state from a slow in-flight profile fetch.
  const fetchToken = useRef(0)

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const token = ++fetchToken.current
    const { data } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle()
    if (token === fetchToken.current) setProfile((data as Profile) ?? null)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      void loadProfile(next?.user.id)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadProfile(data.session?.user.id)
  }, [loadProfile])

  const signUpWithPassword = useCallback(
    async (
      email: string,
      password: string,
      metadata?: { full_name?: string },
    ): Promise<AuthResult & { hasSession: boolean }> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          // After clicking the confirmation link, land back on onboarding so the
          // stashed answers get applied (see Onboarding auto-apply effect).
          emailRedirectTo: `${window.location.origin}/#/get-started`,
        },
      })
      // No session means email confirmation is required before the user is
      // authenticated; the caller should hold onboarding until they confirm.
      return {
        error: error ? friendly(error.message) : null,
        hasSession: Boolean(data.session),
      }
    },
    [],
  )

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error ? friendly(error.message) : null }
    },
    [],
  )

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Land back on the app; Root decides onboarding vs. /try from the profile.
      options: { redirectTo: `${window.location.origin}/#/get-started` },
    })
    return { error: error ? friendly(error.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const saveOnboarding = useCallback<AuthContextValue['saveOnboarding']>(
    async ({ full_name, grade_level, subjects }) => {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) return { error: 'Your session expired. Please log in again.' }

      // upsert so it works whether or not the signup trigger already created
      // the row (race-safe).
      const { error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            email: user.email,
            full_name,
            grade_level,
            subjects,
            onboarding_completed: true,
          },
          { onConflict: 'id' },
        )
      if (error) return { error: friendly(error.message) }
      await refreshProfile()
      return { error: null }
    },
    [refreshProfile],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      profile,
      signUpWithPassword,
      signInWithPassword,
      signInWithGoogle,
      signOut,
      saveOnboarding,
      refreshProfile,
    }),
    [
      loading,
      session,
      profile,
      signUpWithPassword,
      signInWithPassword,
      signInWithGoogle,
      signOut,
      saveOnboarding,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
