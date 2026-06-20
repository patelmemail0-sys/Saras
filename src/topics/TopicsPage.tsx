import { useState, useEffect, useRef, useId } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import type { DbConcept, Subject } from '../lib/supabase'
import './topics.css'

// ── Static course ordering per subject (from curriculum JSON) ─────────────────
const COURSE_ORDER: Record<Subject, string[]> = {
  physics: [
    'High school physics',
    'AP Physics 1',
    'AP Physics 2',
    'Physics library',
  ],
  math: [
    'Algebra 1',
    'Geometry',
    'Algebra 2',
    'Precalculus',
    'Trigonometry',
    'AP Calculus AB',
    'AP Calculus BC',
    'AP Statistics',
    'Differential equations',
    'Linear algebra',
    'Multivariable calculus',
  ],
  biology: ['High school biology', 'AP Biology'],
  chemistry: ['High school chemistry', 'AP Chemistry', 'Organic chemistry'],
  computing: [],
}

const LEVEL_LABEL: Record<string, string> = {
  hs: '9–12',
  ap: 'AP',
  college: 'College',
}

const SUBJECTS: { id: Subject; label: string }[] = [
  { id: 'physics', label: 'Physics' },
  { id: 'math', label: 'Math' },
  { id: 'biology', label: 'Biology' },
  { id: 'chemistry', label: 'Chemistry' },
]

// ── Types ─────────────────────────────────────────────────────────────────────
interface UnitGroup {
  unit: string
  concepts: DbConcept[]
}

interface CourseGroup {
  course: string
  level: string
  gradeBand: string
  units: UnitGroup[]
  total: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupByCourse(concepts: DbConcept[], subject: Subject): CourseGroup[] {
  const order = COURSE_ORDER[subject]
  const byCourseName = new Map<string, DbConcept[]>()

  for (const c of concepts) {
    const arr = byCourseName.get(c.course) ?? []
    arr.push(c)
    byCourseName.set(c.course, arr)
  }

  const courseNames = [
    ...order.filter((n) => byCourseName.has(n)),
    ...[...byCourseName.keys()].filter((n) => !order.includes(n)),
  ]

  return courseNames.map((course) => {
    const rows = byCourseName.get(course) ?? []
    const unitMap = new Map<string, DbConcept[]>()
    for (const c of rows) {
      const arr = unitMap.get(c.unit) ?? []
      arr.push(c)
      unitMap.set(c.unit, arr)
    }
    const units: UnitGroup[] = [...unitMap.entries()].map(([unit, cs]) => ({
      unit,
      concepts: cs.sort((a, b) => a.title.localeCompare(b.title)),
    }))
    return {
      course,
      level: rows[0]?.level ?? 'hs',
      gradeBand: rows[0]?.grade_band ?? '',
      units,
      total: rows.length,
    }
  })
}

function tryHref(title: string) {
  return `#/try?q=${encodeURIComponent(title)}`
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ConceptChip({ concept }: { concept: DbConcept }) {
  const canTry = !!concept.spec_type
  return (
    <div className={`tp-chip ${canTry ? 'tp-chip--live' : ''}`}>
      <span className="tp-chip__title">{concept.title}</span>
      {canTry && (
        <a
          className="tp-chip__try"
          href={tryHref(concept.title)}
          aria-label={`Try ${concept.title} in the visualizer`}
        >
          Try
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      )}
    </div>
  )
}

function UnitSection({ unit }: { unit: UnitGroup }) {
  return (
    <div className="tp-unit">
      <h4 className="tp-unit__name">{unit.unit}</h4>
      <div className="tp-unit__chips">
        {unit.concepts.map((c) => (
          <ConceptChip key={c.id} concept={c} />
        ))}
      </div>
    </div>
  )
}

function CourseAccordion({
  course,
  subjectId,
  defaultOpen,
}: {
  course: CourseGroup
  subjectId: Subject
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`tp-course ${open ? 'tp-course--open' : ''}`} data-subject={subjectId}>
      <button
        className="tp-course__header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="tp-course__meta">
          <span className="tp-course__name">{course.course}</span>
          <span className="tp-course__badges">
            <span className="tp-badge tp-badge--level">
              {LEVEL_LABEL[course.level] ?? course.level}
            </span>
            <span className="tp-badge tp-badge--count">{course.total} topics</span>
          </span>
        </div>
        <svg
          className="tp-course__chevron"
          width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="tp-course__body">
        <div className="tp-course__inner">
          {course.units.map((u) => (
            <UnitSection key={u.unit} unit={u} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SkeletonCourse({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="tp-course tp-course--skeleton"
      style={{ animationDelay: `${delay}ms` } as CSSProperties}
    >
      <div className="tp-course__header">
        <div className="tp-course__meta">
          <div className="tp-skel tp-skel--name" />
          <div className="tp-skel tp-skel--badge" />
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TopicsPage() {
  const [activeSubject, setActiveSubject] = useState<Subject>('physics')
  const [courses, setCourses] = useState<CourseGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cache = useRef<Partial<Record<Subject, CourseGroup[]>>>({})
  const tablistRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (cache.current[activeSubject]) {
      setCourses(cache.current[activeSubject]!)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .from('concepts')
      .select('*')
      .eq('subject', activeSubject)
      .order('course')
      .then(({ data, error: err }) => {
        if (err) {
          setError('Could not load topics. Try again.')
          setLoading(false)
          return
        }
        const grouped = groupByCourse((data ?? []) as DbConcept[], activeSubject)
        cache.current[activeSubject] = grouped
        setCourses(grouped)
        setLoading(false)
      })
  }, [activeSubject])

  // Arrow-key navigation for tab list (WAI-ARIA tablist pattern)
  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = idx
    if (e.key === 'ArrowRight') next = (idx + 1) % SUBJECTS.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + SUBJECTS.length) % SUBJECTS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = SUBJECTS.length - 1
    else return

    e.preventDefault()
    setActiveSubject(SUBJECTS[next].id)
    const tabs = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs?.[next]?.focus()
  }

  return (
    <div className="tp-page">
      {/* Nav */}
      <header className="tp-nav">
        <div className="tp-shell tp-nav__inner">
          <a href="#/" className="tp-brand" aria-label="Saras home">
            <Prismlet />
            <span>Saras</span>
          </a>
          <nav className="tp-nav__links" aria-label="Site">
            <a href="#/">How it works</a>
            <a href="#/topics" className="tp-nav__active" aria-current="page">Topics</a>
          </nav>
          <a href="#/" className="tp-nav__cta">
            Get early access
          </a>
        </div>
      </header>

      <main className="tp-main">
        <div className="tp-shell">
          {/* Page header */}
          <div className="tp-head">
            <span className="tp-label">Curriculum</span>
            <h1 className="tp-head__title">Explore topics</h1>
            <p className="tp-head__sub">
              Browse concepts across four subjects. Each topic opens Saras's three-view engine.
            </p>
          </div>

          {/* Subject tabs */}
          <div
            className="tp-tabs"
            role="tablist"
            aria-label="Subjects"
            ref={tablistRef}
          >
            {SUBJECTS.map((s, i) => (
              <button
                key={s.id}
                id={`tab-${s.id}`}
                role="tab"
                aria-selected={activeSubject === s.id}
                aria-controls={panelId}
                tabIndex={activeSubject === s.id ? 0 : -1}
                className={`tp-tab ${activeSubject === s.id ? 'tp-tab--active' : ''}`}
                data-subject={s.id}
                onClick={() => setActiveSubject(s.id)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
              >
                <SubjectIcon subject={s.id} />
                {s.label}
              </button>
            ))}
          </div>

          {/* Content — keyed by subject so it remounts and triggers entry animation */}
          <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={`tab-${activeSubject}`}
            className="tp-content"
            key={activeSubject}
          >
            {loading && (
              <div className="tp-courses">
                <SkeletonCourse />
                <SkeletonCourse delay={60} />
                <SkeletonCourse delay={120} />
              </div>
            )}

            {error && (
              <div className="tp-error">
                <p>{error}</p>
                <button
                  onClick={() => {
                    cache.current[activeSubject] = undefined
                    setLoading(true)
                    setError(null)
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && courses.length === 0 && (
              <div className="tp-empty">
                <p>No topics found for this subject yet.</p>
              </div>
            )}

            {!loading && !error && courses.length > 0 && (
              <div className="tp-courses">
                {courses.map((c, i) => (
                  <CourseAccordion
                    key={c.course}
                    course={c}
                    subjectId={activeSubject}
                    defaultOpen={i === 0}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function Prismlet() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="prismlet">
      <path d="M12 4 L20 19 L4 19 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="12" y1="4" x2="12" y2="19" stroke="var(--ch-model)" strokeWidth="1.4" />
      <line x1="12" y1="11.5" x2="20" y2="19" stroke="var(--ch-analogy)" strokeWidth="1.4" />
      <line x1="12" y1="11.5" x2="4" y2="19" stroke="var(--ch-steps)" strokeWidth="1.4" />
    </svg>
  )
}

function SubjectIcon({ subject }: { subject: Subject }) {
  switch (subject) {
    case 'physics':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.8" />
          <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.8" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.8" transform="rotate(120 12 12)" />
        </svg>
      )
    case 'math':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16M4 12h10M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18 9l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'biology':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2C7 2 4 6 4 10c0 5 4 8 8 10 4-2 8-5 8-10 0-4-3-8-8-8z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 2v20M4 10h16" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2" />
        </svg>
      )
    case 'chemistry':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 3h6M10 3v6l-5 9a1 1 0 00.9 1.5h12.2a1 1 0 00.9-1.5L14 9V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="16" r="1" fill="currentColor" />
          <circle cx="14" cy="14" r="1" fill="currentColor" />
        </svg>
      )
    default:
      return null
  }
}
