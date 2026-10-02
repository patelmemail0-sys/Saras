import type { DbConcept } from '../lib/supabase'
import { getSpecType } from '../data/curriculum/specTypes.ts'

// The columns the topics page reads from the Supabase `concepts` table. Must
// stay a subset of what scripts/seed-concepts.ts writes — concepts.test.ts
// checks this list against the live table.
export const CONCEPT_COLUMNS = 'id, subject, course, unit, title, spec_type'

// Deep link to the concept's interactive model (#/try/<spec-type>), or null when
// it has no spec type yet or that widget isn't built — never a guessed visual.
export function tryHref(concept: Pick<DbConcept, 'spec_type'>): string | null {
  if (!concept.spec_type || !getSpecType(concept.spec_type)?.built) return null
  return `#/try/${encodeURIComponent(concept.spec_type)}`
}
