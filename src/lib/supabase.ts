import { createClient } from '@supabase/supabase-js'

// Single browser Supabase client. The URL + publishable/anon key are safe to
// expose (Row Level Security is the real guard). If they are missing we surface
// a clear error rather than failing deep inside an auth call.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.',
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE returns the auth code as a `?code=` query param instead of tokens in
    // the URL hash. That matters because we use a hash router: token-in-hash
    // would collide with the `#/get-started` route. With PKCE the hash stays
    // clean and detectSessionInUrl exchanges the code on load.
    flowType: 'pkce',
  },
})

export const hasSupabaseConfig = Boolean(url && anonKey)

// ── Topics / curriculum ───────────────────────────────────────────────────────
export interface DbConcept {
  id: number
  subject: string
  course: string
  unit: string
  name: string
  slug: string | null
  has_visualization: boolean
}
