import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key)

// ── Types matching the `concepts` table schema ──────────────────────────────

export type Subject = 'math' | 'physics' | 'chemistry' | 'biology' | 'computing'
export type GradeBand = '9-10' | '11-12' | 'college'
export type Level = 'hs' | 'ap' | 'college'
export type Diagram3dFit = 'high' | 'medium' | 'low' | 'none'

export interface DbConcept {
  id: string
  subject: Subject
  course: string
  unit: string
  title: string
  grade_band: GradeBand
  level: Level
  description: string
  keywords: string[]
  representations: string[]
  diagram_3d_fit: Diagram3dFit
  spec_type: string | null
  khan_url: string | null
  created_at: string
}
