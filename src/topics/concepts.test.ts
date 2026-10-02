/**
 * Regression harness for the topics page's read of the Supabase `concepts`
 * table. The page once selected columns the table never had (`name`, `slug`,
 * `has_visualization`), so every subject tab failed with "column concepts.name
 * does not exist". Run it with `bun run test` (or `bun src/topics/concepts.test.ts`).
 *
 * Like the engine tests this is a plain standalone script, NOT a `bun:test`
 * suite. The live-table check needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * (bun loads them from .env.local) and is skipped when they are missing or the
 * network is unreachable.
 */
import { CONCEPT_COLUMNS, tryHref } from './concepts.ts';

let pass = 0;
let failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; } else { failed++; console.log('FAIL', name); }
};

// 1. Try links: only a mapped AND built spec type deep-links to #/try/<spec-type>.
check('built spec type links to its model', tryHref({ spec_type: 'projectile' }) === '#/try/projectile');
check('unmapped concept has no link', tryHref({ spec_type: null }) === null);
check('planned-but-unbuilt spec type has no link', tryHref({ spec_type: 'molecule-3d' }) === null);
check('unknown spec type has no link', tryHref({ spec_type: 'not-a-widget' }) === null);

// 2. Every column the page selects exists on the live table.
const columns = CONCEPT_COLUMNS.split(',').map((c) => c.trim());
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.log('concepts: live-table check skipped (no Supabase env)');
} else {
  let res: Response | null = null;
  try {
    res = await fetch(`${url}/rest/v1/concepts?select=${columns.join(',')}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  } catch {
    console.log('concepts: live-table check skipped (network unreachable)');
  }
  if (res) {
    const body = await res.json();
    if (!res.ok) console.log('  ', body.message ?? body);
    check('select of CONCEPT_COLUMNS succeeds against the live table', res.ok);
    const row = res.ok && Array.isArray(body) ? body[0] : undefined;
    if (row) {
      for (const col of columns) check(`row has column "${col}"`, col in row);
    }
  }
}

console.log(`concepts: ${pass} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
