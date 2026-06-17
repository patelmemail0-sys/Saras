/**
 * Projectile word-problem parser.
 *
 * Pulls the launch parameters (speed, angle, launch height, gravity) out of a
 * plain-English problem and detects what the problem is ASKING (how far / how
 * high / how long), so the model can fill itself in and pre-select the unknown
 * to solve. Deterministic and offline — no API key, no model call — which suits
 * the fact that textbook projectile problems state their numbers explicitly.
 *
 * It is intentionally conservative: it reports exactly what it matched and leaves
 * everything else untouched, rather than guessing. Unusual phrasings that it
 * can't parse are surfaced honestly instead of silently mis-set.
 */

export interface ParsedProjectile {
  speed?: number;
  angle?: number;
  gravity?: number;
  height?: number;
  /** Detected question → which equation/unknown to surface. */
  solveFor?: { eqId: string; unknown: string };
  /** Human-readable list of what was extracted, for a confirmation line. */
  found: string[];
}

const NUM = '(-?\\d+(?:\\.\\d+)?)';
// "m" / "meters" but NOT the "m" in "m/s" (so speeds aren't read as heights).
const LEN = '(?:meters?|metres?|m(?!/?s))';

export function parseProjectileWordProblem(input: string): ParsedProjectile {
  const t = input.toLowerCase();
  const out: ParsedProjectile = { found: [] };

  // Speed: a number with a velocity unit.
  const speed = t.match(
    new RegExp(NUM + '\\s*(?:m/s|meters?\\s*per\\s*second|metres?\\s*per\\s*second|mps)', 'i'),
  );
  if (speed) {
    out.speed = parseFloat(speed[1]);
    out.found.push(`speed ${out.speed} m/s`);
  }

  // Angle: "35°", "35 degrees", or "angle of 35". (No \b after ° — it isn't a
  // word char, so a trailing word boundary never matches there.)
  const angle =
    t.match(new RegExp(NUM + '\\s*(?:°|deg(?:ree)?s?\\b)', 'i')) ??
    t.match(new RegExp('angle\\s+of\\s+' + NUM, 'i'));
  if (angle) {
    out.angle = parseFloat(angle[1]);
    out.found.push(`angle ${out.angle}°`);
  }

  // Gravity: a named body, or an explicit "g = N".
  if (/\bmoon\b/.test(t)) {
    out.gravity = 1.6;
    out.found.push('gravity 1.6 m/s² (Moon)');
  } else if (/\bmars\b/.test(t)) {
    out.gravity = 3.7;
    out.found.push('gravity 3.7 m/s² (Mars)');
  } else if (/\bjupiter\b/.test(t)) {
    out.gravity = 24.8;
    out.found.push('gravity 24.8 m/s² (Jupiter)');
  } else {
    const gm = t.match(new RegExp('g\\s*=\\s*' + NUM, 'i'));
    if (gm) {
      out.gravity = parseFloat(gm[1]);
      out.found.push(`gravity ${out.gravity} m/s²`);
    }
  }

  // Launch height: a length tied to a height-context word, or "from/off N m".
  const ctx = '(?:height|cliff|building|tower|wall|platform|rooftop|roof|ledge|bridge|tall|high|elevation)';
  const height =
    t.match(new RegExp('(?:height|elevation)\\s+of\\s+' + NUM + '\\s*' + LEN, 'i')) ??
    t.match(new RegExp(NUM + '\\s*' + LEN + '\\s*(?:high|tall|above)', 'i')) ??
    t.match(new RegExp(NUM + '\\s*' + LEN + '[ -]?' + ctx, 'i')) ??
    t.match(new RegExp(ctx + '[^.]{0,18}?' + NUM + '\\s*' + LEN, 'i')) ??
    t.match(new RegExp('(?:from|off|atop|above|on top of)\\s+(?:a\\s+|the\\s+)?' + NUM + '\\s*' + LEN, 'i'));
  if (height) {
    out.height = parseFloat(height[1]);
    out.found.push(`launch height ${out.height} m`);
  } else if (/\bground\b/.test(t)) {
    // Mentions the ground and gave no other launch height → launched from ground.
    out.height = 0;
    out.found.push('launch height 0 m (ground)');
  }

  // Question → equation + unknown to surface.
  if (/(how far|how much .*distance|horizontal distance|\brange\b|land|travel)/.test(t)) {
    out.solveFor = { eqId: 'range', unknown: 'R' };
  } else if (/(how long|how much time|time of flight|flight time|in the air|how many seconds|before it (?:lands|hits))/.test(t)) {
    out.solveFor = { eqId: 'flight-time', unknown: 'T' };
  } else if (/(how high|maximum height|max(?:imum)? height|highest|peak|apex)/.test(t)) {
    out.solveFor = { eqId: 'max-height', unknown: 'H' };
  }

  return out;
}
