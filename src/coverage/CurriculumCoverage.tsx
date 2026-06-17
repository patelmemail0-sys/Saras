/**
 * Curriculum coverage dashboard — internal planning tool (not a product surface).
 *
 * Reach it at #/coverage. It reads the curriculum database and lets you:
 *  - see coverage stats and the 3D-diagram seed list,
 *  - star the first ~6 concepts to prototype (the build queue),
 *  - tentatively map concepts to spec types and watch the coverage gap shrink.
 *
 * Star + spec-type assignments are a PLANNING layer persisted to localStorage —
 * they never mutate the committed data. The source of truth stays the JSON; once
 * a mapping is decided, set `specType` in the raw data and rebuild.
 */
import { useMemo, useState } from 'react';
import {
  concepts,
  courses,
  SPEC_TYPES,
  stats,
  type Concept,
  type Subject,
  type Diagram3dFit,
} from '../data/curriculum';
import './coverage.css';

const SUBJECTS: Subject[] = ['math', 'physics', 'chemistry', 'biology', 'computing'];
const FIT_ORDER: Record<Diagram3dFit, number> = { none: 0, low: 1, medium: 2, high: 3 };
const QUEUE_KEY = 'saras.coverage.queue';
const ASSIGN_KEY = 'saras.coverage.assignments';

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function CurriculumCoverage() {
  const base = useMemo(() => stats(), []);

  // Planning layer (localStorage).
  const [queue, setQueue] = useState<string[]>(() => loadJSON<string[]>(QUEUE_KEY, []));
  const [assign, setAssign] = useState<Record<string, string>>(() =>
    loadJSON<Record<string, string>>(ASSIGN_KEY, {}),
  );

  // Filters.
  const [subject, setSubject] = useState<Subject | 'all'>('all');
  const [course, setCourse] = useState<string>('all');
  const [minFit, setMinFit] = useState<Diagram3dFit>('high');
  const [query, setQuery] = useState('');
  const [gapsOnly, setGapsOnly] = useState(true);

  const queueSet = useMemo(() => new Set(queue), [queue]);

  function persistQueue(next: string[]) {
    setQueue(next);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  }
  function persistAssign(next: Record<string, string>) {
    setAssign(next);
    localStorage.setItem(ASSIGN_KEY, JSON.stringify(next));
  }
  function toggleStar(id: string) {
    persistQueue(queueSet.has(id) ? queue.filter((q) => q !== id) : [...queue, id]);
  }
  function setSpec(id: string, spec: string) {
    const next = { ...assign };
    if (spec) next[id] = spec;
    else delete next[id];
    persistAssign(next);
  }

  const courseOptions = useMemo(
    () =>
      courses
        .filter((c) => subject === 'all' || c.subject === subject)
        .map((c) => c.name)
        .sort(),
    [subject],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return concepts
      .filter((c) => subject === 'all' || c.subject === subject)
      .filter((c) => course === 'all' || c.course === course)
      .filter((c) => FIT_ORDER[c.diagram3dFit] >= FIT_ORDER[minFit])
      .filter((c) => !gapsOnly || !assign[c.id])
      .filter((c) => {
        if (!q) return true;
        return [c.title, c.description, c.course, c.unit, ...c.keywords]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => FIT_ORDER[b.diagram3dFit] - FIT_ORDER[a.diagram3dFit] || a.title.localeCompare(b.title));
  }, [subject, course, minFit, query, gapsOnly, assign]);

  const mappedCount = Object.keys(assign).length;
  const highFit = base.byDiagram3dFit.high ?? 0;
  const highGap = useMemo(
    () => concepts.filter((c) => c.diagram3dFit === 'high' && !assign[c.id]).length,
    [assign],
  );

  const queueConcepts = queue
    .map((id) => concepts.find((c) => c.id === id))
    .filter((c): c is Concept => !!c);

  const specCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of Object.keys(assign)) counts[assign[id]] = (counts[assign[id]] ?? 0) + 1;
    return counts;
  }, [assign]);

  function copyQueue() {
    const payload = queueConcepts.map((c) => ({
      id: c.id,
      title: c.title,
      subject: c.subject,
      course: c.course,
      diagram3dFit: c.diagram3dFit,
      representations: c.representations,
      specType: assign[c.id] ?? null,
    }));
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
  }

  return (
    <div className="cov">
      <div className="cov__head">
        <div>
          <div className="cov__title">
            <b>Saras</b> · curriculum coverage
          </div>
          <div className="cov__sub">
            Plan which concepts become interactive 3D diagrams, and track the coverage gap.
          </div>
        </div>
        <a className="cov__back" href="#/">← back to site</a>
      </div>

      <div className="cov__stats">
        <div className="stat">
          <div className="stat__n">{base.totalConcepts}</div>
          <div className="stat__l">concepts · {base.totalCourses} courses</div>
        </div>
        <div className="stat">
          <div className="stat__n">{highFit}</div>
          <div className="stat__l">high 3D-fit (seed list)</div>
        </div>
        <div className="stat">
          <div className={'stat__n ' + (mappedCount ? 'is-good' : '')}>{mappedCount}</div>
          <div className="stat__l">mapped to a spec type</div>
          <div className="stat__bar">
            <span style={{ width: `${(mappedCount / base.totalConcepts) * 100}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className={'stat__n ' + (highGap ? 'is-gap' : 'is-good')}>{highGap}</div>
          <div className="stat__l">high-fit gaps remaining</div>
        </div>
        <div className="stat">
          <div className="stat__n">{queue.length}</div>
          <div className="stat__l">in prototype queue</div>
        </div>
      </div>

      <div className="cov__body">
        <div>
          <div className="cov__filters">
            <input
              type="search"
              placeholder="Search concepts, keywords, units…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value as Subject | 'all');
                setCourse('all');
              }}
            >
              <option value="all">All subjects</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value="all">All courses</option>
              {courseOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={minFit} onChange={(e) => setMinFit(e.target.value as Diagram3dFit)}>
              <option value="high">3D fit: high</option>
              <option value="medium">3D fit: medium+</option>
              <option value="low">3D fit: low+</option>
              <option value="none">3D fit: any</option>
            </select>
            <label className="cov__chiptoggle">
              <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} />
              unmapped only
            </label>
            <span className="cov__count">{filtered.length} shown</span>
          </div>

          <div className="cov__list">
            {filtered.length === 0 && <div className="cov__empty">No concepts match these filters.</div>}
            {filtered.map((c) => (
              <div key={c.id} className={'row' + (queueSet.has(c.id) ? ' is-queued' : '')}>
                <button
                  className={'star' + (queueSet.has(c.id) ? ' is-on' : '')}
                  title={queueSet.has(c.id) ? 'Remove from prototype queue' : 'Add to prototype queue'}
                  onClick={() => toggleStar(c.id)}
                >
                  {queueSet.has(c.id) ? '★' : '☆'}
                </button>
                <div className="row__main">
                  <div className="row__title">{c.title}</div>
                  <div className="row__meta">
                    {c.course} · {c.unit} · {c.gradeBand}
                  </div>
                  <div className="reps">
                    {c.representations.map((r) => (
                      <span key={r} className="rep">{r}</span>
                    ))}
                  </div>
                </div>
                <span className={'fit fit-' + c.diagram3dFit}>{c.diagram3dFit} 3D</span>
                <select
                  className={'specsel' + (assign[c.id] ? ' is-set' : '')}
                  value={assign[c.id] ?? ''}
                  onChange={(e) => setSpec(c.id, e.target.value)}
                >
                  <option value="">— unmapped —</option>
                  {SPEC_TYPES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <aside className="side">
          <div className="card">
            <h3>Prototype queue</h3>
            <p className="hint">Star ~6 concepts spanning subjects to build first.</p>
            {queueConcepts.length === 0 && <div className="queue__empty">Nothing starred yet.</div>}
            {queueConcepts.map((c) => (
              <div key={c.id} className="queue__item">
                <div className="queue__name">
                  <b>{c.title}</b>
                  <small>{c.subject} · {c.diagram3dFit} 3D</small>
                </div>
                <span className={'queue__spec' + (assign[c.id] ? '' : ' is-unset')}>
                  {assign[c.id] ? SPEC_TYPES.find((s) => s.id === assign[c.id])?.label : 'no spec'}
                </span>
                <button className="queue__x" title="Remove" onClick={() => toggleStar(c.id)}>✕</button>
              </div>
            ))}
            <button className="btn" disabled={!queueConcepts.length} onClick={copyQueue}>
              Copy queue as JSON
            </button>
          </div>

          <div className="card">
            <h3>Spec-type coverage</h3>
            <p className="hint">{mappedCount} of {base.totalConcepts} concepts mapped.</p>
            {SPEC_TYPES.map((s) => (
              <div key={s.id} className="spectype">
                <span className="spectype__label">
                  {s.label} <span className="spectype__cat">{s.category}</span>
                </span>
                <span className={'spectype__n' + ((specCounts[s.id] ?? 0) === 0 ? ' is-zero' : '')}>
                  {specCounts[s.id] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
