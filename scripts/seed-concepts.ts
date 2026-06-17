/**
 * Seed the Supabase `concepts` table from the canonical curriculum JSON.
 *
 * The curriculum JSON (src/data/curriculum) stays the source of truth; this
 * mirrors it into Postgres so `visuals` / `coverage_gaps` can foreign-key to
 * concepts and the app can run relational queries. Idempotent (upsert on id) —
 * re-run any time the curriculum changes.
 *
 * Usage (from repo root):
 *   SUPABASE_SERVICE_ROLE_KEY='<service_role secret>' bun scripts/seed-concepts.ts
 *
 * Get the service_role key at: Supabase dashboard → SARAS → Project Settings →
 * API → "service_role" (secret). It bypasses RLS, so keep it server-side only —
 * never commit it, never ship it to the browser.
 */
import { createClient } from '@supabase/supabase-js';
import { concepts } from '../src/data/curriculum/index.ts';

const url = process.env.SUPABASE_URL ?? 'https://btzgbjonnhrsivzvyoqe.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
  console.error(
    'Missing SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Get it from Supabase → SARAS → Project Settings → API → service_role (secret), then:\n' +
      "  SUPABASE_SERVICE_ROLE_KEY='...' bun scripts/seed-concepts.ts",
  );
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const rows = concepts.map((c) => ({
  id: c.id,
  subject: c.subject,
  course: c.course,
  unit: c.unit,
  title: c.title,
  grade_band: c.gradeBand,
  level: c.level,
  description: c.description,
  keywords: c.keywords,
  representations: c.representations,
  diagram_3d_fit: c.diagram3dFit,
  spec_type: c.specType ?? null,
  khan_url: c.khanUrl ?? null,
}));

const BATCH = 500;
let done = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const { error } = await sb.from('concepts').upsert(chunk, { onConflict: 'id' });
  if (error) {
    console.error(`Upsert failed at row ${i}: ${error.message}`);
    process.exit(1);
  }
  done += chunk.length;
  console.log(`upserted ${done}/${rows.length}`);
}

console.log(`\n✅ Seeded ${rows.length} concepts into ${url}`);
