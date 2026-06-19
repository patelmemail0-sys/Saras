import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from './types'

export interface AuthResult {
  error: string | null
}

export interface AuthContextValue {
  /** Still resolving the initial session; gate redirects on this. */
  loading: boolean
  session: Session | null
  profile: Profile | null
  signUpWithPassword: (
    email: string,
    password: string,
    metadata?: { full_name?: string },
  ) => Promise<AuthResult & { hasSession: boolean }>
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>
  signInWithGoogle: () => Promise<AuthResult>
  signOut: () => Promise<void>
  /** Persist onboarding answers and flip onboarding_completed. */
  saveOnboarding: (input: {
    full_name: string
    grade_level: Profile['grade_level']
    subjects: Profile['subjects']
  }) => Promise<AuthResult>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
