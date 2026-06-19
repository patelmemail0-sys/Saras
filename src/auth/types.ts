// Shared auth + onboarding domain types and the option lists the onboarding
// flow renders. Subjects mirror the `concepts.subject` check in the database.

export const SUBJECTS = [
  { id: 'math', label: 'Math' },
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'biology', label: 'Biology' },
] as const

export type SubjectId = (typeof SUBJECTS)[number]['id']

// Education levels mirror the check constraint on profiles.grade_level.
export const GRADE_LEVELS = [
  { id: 'grade-9', label: '9th grade' },
  { id: 'grade-10', label: '10th grade' },
  { id: 'grade-11', label: '11th grade' },
  { id: 'grade-12', label: '12th grade' },
  { id: 'undergrad', label: 'Undergrad' },
  { id: 'postgrad', label: 'Postgrad' },
  { id: 'other', label: 'Other' },
] as const

export type GradeLevel = (typeof GRADE_LEVELS)[number]['id']

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  grade_level: GradeLevel | null
  subjects: SubjectId[]
  onboarding_completed: boolean
}
