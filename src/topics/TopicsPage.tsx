import { useState, useEffect, useRef, useId } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import type { DbConcept } from '../lib/supabase'
import './topics.css'

// ── Types ─────────────────────────────────────────────────────────────────────
type Subject = 'physics' | 'math' | 'biology' | 'chemistry'

interface UnitMap   { [unit: string]: DbConcept[] }
interface CourseMap { [course: string]: UnitMap }

// ── Subject metadata ──────────────────────────────────────────────────────────
const SUBJECTS: { id: Subject; label: string; icon: string }[] = [
  { id: 'physics',   label: 'Physics',   icon: '⚛︎' },
  { id: 'math',      label: 'Math',      icon: '∑' },
  { id: 'biology',   label: 'Biology',   icon: '🧬' },
  { id: 'chemistry', label: 'Chemistry', icon: '⚗︎' },
]

// Canonical course order per subject (alphabetical fallback for unlisted)
const COURSE_ORDER: Record<Subject, string[]> = {
  physics: [
    'AP Physics 1', 'AP Physics 2', 'AP Physics C: Mechanics',
    'AP Physics C: E&M', 'Classical Mechanics', 'Electromagnetism',
    'Thermodynamics', 'Waves & Optics', 'Modern Physics',
  ],
  math: [
    'Pre-Algebra', 'Algebra I', 'Algebra II', 'Geometry',
    'Pre-Calculus', 'Trigonometry', 'Calculus I', 'Calculus II',
    'Multivariable Calculus', 'Linear Algebra', 'Differential Equations',
    'Discrete Math', 'Statistics', 'AP Statistics', 'AP Calculus AB',
    'AP Calculus BC',
  ],
  biology: [
    'Cell Biology', 'Genetics', 'Evolution', 'Ecology',
    'Human Anatomy', 'AP Biology',
  ],
  chemistry: [
    'General Chemistry', 'Organic Chemistry', 'AP Chemistry',
    'Biochemistry', 'Physical Chemistry',
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupByCourse(concepts: DbConcept[]): CourseMap {
  const map: CourseMap = {}
  for (const c of concepts) {
    if (!map[c.course]) map[c.course] = {}
    if (!map[c.course][c.unit]) map[c.course][c.unit] = []
    map[c.course][c.unit].push(c)
  }
  return map
}

function sortedCourses(map: CourseMap, subject: Subject): string[] {
  const order = COURSE_ORDER[subject] ?? []
  const keys = Object.keys(map)
  return [
    ...order.filter(c => keys.includes(c)),
    ...keys.filter(c => !order.includes(c)).sort(),
  ]
}

// ── Sub-components ────────────────────────────────────────────────────────────
function CourseAccordion({
  subject,
  course,
  units,
  defaultOpen,
}: {
  subject: Subject
  course: string
  units: UnitMap
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const headId = useId()
  const panelId = useId()
  const totalConcepts = Object.values(units).reduce((s, u) => s + u.length, 0)

  return (
    <div
      className={`tp-course${open ? ' tp-course--open' : ''}`}
      data-subject={subject}
    >
      <button
        id={headId}
        className="tp-course__header"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
      >
        <span className="tp-course__name">{course}</span>
        <span className="tp-badge tp-badge--count">{totalConcepts}</span>
        <svg
          className="tp-course__chevron"
          width="16" height="16" viewBox="0 0 24 24"
          fill="none" aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headId}
        className="tp-course__body"
      >
        <div className="tp-course__inner">
          {Object.entries(units).map(([unit, concepts]) => (
            <div key={unit} className="tp-unit">
              <h3 className="tp-unit__name">{unit}</h3>
              <div className="tp-chips">
                {concepts.map(c => (
                  <span key={c.id} className={`tp-chip${c.spec_type ? ' tp-chip--live' : ''}`}>
                    <span className="tp-chip__title">{c.title}</span>
                    {c.spec_type && (
                      <a
                        className="tp-chip__try"
                        href={`#/try?concept=${c.id}`}
                        onClick={e => e.stopPropagation()}
                      >
                        Try →
                      </a>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SkeletonCourse({ delay }: { delay: number }) {
  return (
    <div
      className="tp-course tp-course--skeleton"
      style={{ '--skeleton-delay': `${delay}ms` } as CSSProperties}
    >
      <div className="tp-course__header">
        <span className="tp-skeleton tp-skeleton--name" />
        <span className="tp-skeleton tp-skeleton--badge" />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TopicsPage() {
  const [activeSubject, setActiveSubject] = useState<Subject>('physics')
  const [concepts, setConcepts] = useState<DbConcept[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Cache fetched subjects to avoid re-fetching on tab switch
  const cache = useRef<Partial<Record<Subject, DbConcept[]>>>({})

  const tablistId = useId()

  useEffect(() => {
    if (cache.current[activeSubject]) {
      setConcepts(cache.current[activeSubject]!)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    supabase
      .from('concepts')
      .select('id, subject, course, unit, title, spec_type')
      .eq('subject', activeSubject)
      .order('title')
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message)
        } else {
          cache.current[activeSubject] = data ?? []
          setConcepts(data ?? [])
        }
        setLoading(false)
      })
  }, [activeSubject])

  const courseMap = groupByCourse(concepts)
  const courses   = sortedCourses(courseMap, activeSubject)

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    const tabs = SUBJECTS
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setActiveSubject(tabs[(idx + 1) % tabs.length].id)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setActiveSubject(tabs[(idx - 1 + tabs.length) % tabs.length].id)
    }
  }

  const panelId = `${tablistId}-panel`

  return (
    <div className="tp-page">
      {/* ── Nav ── */}
      <nav className="tp-nav" aria-label="Topics navigation">
        <div className="tp-shell tp-nav__inner">
          <a href="#/" className="tp-brand">
            <LotusMark />
            <span>Saras</span>
          </a>
          <div className="tp-nav__links">
            <a href="#/">Home</a>
            <a href="#/try">Try it</a>
            <a href="#/topics" className="tp-nav__active">Topics</a>
          </div>
          <a href="#/get-started" className="tp-nav__cta">Get started</a>
        </div>
      </nav>

      <main className="tp-shell tp-main">
        {/* ── Header ── */}
        <header className="tp-head">
          <span className="tp-label">Topics</span>
          <h1 className="tp-head__title">Every concept, three ways.</h1>
          <p className="tp-head__sub">
            Browse by subject and course. Concepts marked{' '}
            <strong>Try →</strong> open an interactive visualisation instantly.
          </p>
        </header>

        {/* ── Subject tabs ── */}
        <div
          role="tablist"
          id={tablistId}
          aria-label="Subject"
          className="tp-tabs"
        >
          {SUBJECTS.map((s, idx) => (
            <button
              key={s.id}
              role="tab"
              id={`tab-${s.id}`}
              aria-selected={activeSubject === s.id}
              aria-controls={panelId}
              tabIndex={activeSubject === s.id ? 0 : -1}
              data-subject={s.id}
              className={`tp-tab${activeSubject === s.id ? ' tp-tab--active' : ''}`}
              onClick={() => setActiveSubject(s.id)}
              onKeyDown={e => handleTabKeyDown(e, idx)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Tab panel ── */}
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`tab-${activeSubject}`}
          key={activeSubject}
          className="tp-content"
        >
          {error && (
            <p className="tp-error">Could not load concepts: {error}</p>
          )}

          {loading ? (
            <div className="tp-courses">
              {[0, 1, 2, 3].map(i => (
                <SkeletonCourse key={i} delay={i * 80} />
              ))}
            </div>
          ) : (
            <div className="tp-courses">
              {courses.map((course, i) => (
                <CourseAccordion
                  key={course}
                  subject={activeSubject}
                  course={course}
                  units={courseMap[course]}
                  defaultOpen={i === 0}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ── Shared SVG ────────────────────────────────────────────────────────────────
function LotusMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20 C 7 16 7 9 12 4 C 17 9 17 16 12 20 Z"
        fill="none" stroke="var(--ink)" strokeWidth="1.4"
      />
      <path
        d="M12 20 C 8 18 4.5 14 4 9 C 9 10.5 11 15 12 20 Z"
        fill="none" stroke="var(--ink-3)" strokeWidth="1.2"
      />
      <path
        d="M12 20 C 16 18 19.5 14 20 9 C 15 10.5 13 15 12 20 Z"
        fill="none" stroke="var(--ink-3)" strokeWidth="1.2"
      />
      <line x1="3" y1="20.5" x2="21" y2="20.5"
        stroke="var(--ink)" strokeWidth="1" opacity="0.45"
      />
    </svg>
  )
}
