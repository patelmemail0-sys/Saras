/**
 * Build + validate the curriculum database.
 *
 * Reads every raw/<slice>.json (produced per-subject), validates all concepts and
 * courses against the schema in types.ts, merges them into per-subject
 * SubjectCurriculum files, and writes a generated index. Run with:
 *
 *   bun run src/data/curriculum/build.ts
 *
 * Exits non-zero on any validation error so it can gate CI.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Concept,
  Course,
  Subject,
  SubjectCurriculum,
} from './types.ts';
import { SPEC_TYPE_IDS } from './specTypes.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(HERE, 'raw');

const SUBJECTS: Subject[] = ['math', 'physics', 'chemistry', 'biology', 'computing'];
const GRADE_BANDS = new Set(['9-10', '11-12', 'college']);
const LEVELS = new Set(['hs', 'ap', 'college']);
const REPRESENTATIONS = new Set(['graph', 'physical', 'procedural', 'structural', 'symbolic']);
const DIAGRAM_FIT = new Set(['high', 'medium', 'low', 'none']);
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface RawSlice {
  courses: Course[];
  concepts: Concept[];
}

const errors: string[] = [];
const warnings: string[] = [];

const allCourses: Course[] = [];
const allConcepts: Concept[] = [];
const seenConceptIds = new Map<string, string>(); // id -> source file
const seenCourseSlugs = new Map<string, string>();

const rawFiles = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
if (rawFiles.length === 0) {
  console.error(`No raw JSON files found in ${RAW_DIR}`);
  process.exit(1);
}

for (const file of rawFiles) {
  let slice: RawSlice;
  try {
    slice = JSON.parse(readFileSync(join(RAW_DIR, file), 'utf8'));
  } catch (e) {
    errors.push(`${file}: invalid JSON — ${(e as Error).message}`);
    continue;
  }

  for (const course of slice.courses ?? []) {
    if (!SUBJECTS.includes(course.subject))
      errors.push(`${file}: course "${course.slug}" has invalid subject "${course.subject}"`);
    if (!GRADE_BANDS.has(course.gradeBand))
      errors.push(`${file}: course "${course.slug}" has invalid gradeBand "${course.gradeBand}"`);
    if (!LEVELS.has(course.level))
      errors.push(`${file}: course "${course.slug}" has invalid level "${course.level}"`);
    if (!Array.isArray(course.units) || course.units.length === 0)
      errors.push(`${file}: course "${course.slug}" has no units`);
    const prevCourse = seenCourseSlugs.get(course.slug);
    if (prevCourse) errors.push(`${file}: duplicate course slug "${course.slug}" (also in ${prevCourse})`);
    else {
      seenCourseSlugs.set(course.slug, file);
      allCourses.push(course);
    }
  }

  const courseUnits = new Map<string, Set<string>>(); // course name -> units
  for (const c of slice.courses ?? []) courseUnits.set(c.name, new Set(c.units));

  for (const concept of slice.concepts ?? []) {
    const where = `${file}: concept "${concept.id}"`;
    if (!ID_RE.test(concept.id)) errors.push(`${where} has malformed id`);
    const prev = seenConceptIds.get(concept.id);
    if (prev) {
      errors.push(`${where} is a duplicate id (also in ${prev})`);
      continue;
    }
    seenConceptIds.set(concept.id, file);

    if (!SUBJECTS.includes(concept.subject)) errors.push(`${where} invalid subject "${concept.subject}"`);
    if (!concept.id.startsWith(`${concept.subject}.`))
      errors.push(`${where} id prefix does not match subject "${concept.subject}"`);
    if (!GRADE_BANDS.has(concept.gradeBand)) errors.push(`${where} invalid gradeBand "${concept.gradeBand}"`);
    if (!LEVELS.has(concept.level)) errors.push(`${where} invalid level "${concept.level}"`);
    if (!concept.title?.trim()) errors.push(`${where} missing title`);
    if (!concept.description?.trim()) errors.push(`${where} missing description`);
    if (!Array.isArray(concept.keywords) || concept.keywords.length < 1)
      warnings.push(`${where} has no keywords`);
    if (!Array.isArray(concept.representations) || concept.representations.length < 1)
      errors.push(`${where} has no representations`);
    for (const r of concept.representations ?? [])
      if (!REPRESENTATIONS.has(r)) errors.push(`${where} invalid representation "${r}"`);
    if (!DIAGRAM_FIT.has(concept.diagram3dFit)) errors.push(`${where} invalid diagram3dFit "${concept.diagram3dFit}"`);
    if (concept.specType != null && !SPEC_TYPE_IDS.has(concept.specType))
      errors.push(`${where} references unknown specType "${concept.specType}"`);

    const units = courseUnits.get(concept.course);
    if (!units) errors.push(`${where} references unknown course "${concept.course}"`);
    else if (!units.has(concept.unit)) errors.push(`${where} unit "${concept.unit}" not in course "${concept.course}"`);

    allConcepts.push(concept);
  }
}

// Cross-file: every prerequisite id must resolve to a real concept.
for (const concept of allConcepts) {
  for (const pre of concept.prerequisites ?? []) {
    if (!seenConceptIds.has(pre))
      warnings.push(`concept "${concept.id}" has unresolved prerequisite "${pre}"`);
  }
}

if (errors.length) {
  console.error(`\n❌ ${errors.length} validation error(s):`);
  for (const e of errors) console.error('  - ' + e);
  console.error('\nAborting — no files written.');
  process.exit(1);
}

// Write per-subject merged files.
allCourses.sort((a, b) => a.name.localeCompare(b.name));
allConcepts.sort((a, b) => a.id.localeCompare(b.id));

for (const subject of SUBJECTS) {
  const data: SubjectCurriculum = {
    subject,
    courses: allCourses.filter((c) => c.subject === subject),
    concepts: allConcepts.filter((c) => c.subject === subject),
  };
  writeFileSync(join(HERE, `${subject}.json`), JSON.stringify(data, null, 2) + '\n');
}

// Coverage report.
console.log(`\n✅ Curriculum built: ${allConcepts.length} concepts, ${allCourses.length} courses\n`);
console.log('Per subject:');
for (const subject of SUBJECTS) {
  const cs = allConcepts.filter((c) => c.subject === subject);
  const courses = allCourses.filter((c) => c.subject === subject).length;
  const fit = (f: string) => cs.filter((c) => c.diagram3dFit === f).length;
  console.log(
    `  ${subject.padEnd(10)} ${String(cs.length).padStart(4)} concepts  ${courses} courses  ` +
      `(3D fit: ${fit('high')} high / ${fit('medium')} med / ${fit('low')} low / ${fit('none')} none)`,
  );
}
// Renderability / coverage-gap report.
const renderable = allConcepts.filter((c) => c.specType);
const highFit = allConcepts.filter((c) => c.diagram3dFit === 'high');
const highFitGap = highFit.filter((c) => !c.specType).length;
console.log(
  `\nRenderable: ${renderable.length}/${allConcepts.length} concepts mapped to a spec type ` +
    `(${highFitGap} high-3D-fit concepts still unmapped — the build queue).`,
);

if (warnings.length) {
  console.log(`\n⚠️  ${warnings.length} warning(s) (non-fatal):`);
  for (const w of warnings.slice(0, 20)) console.log('  - ' + w);
  if (warnings.length > 20) console.log(`  …and ${warnings.length - 20} more`);
}
