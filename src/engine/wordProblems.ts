/**
 * Word-problem parsers for the equation-based widgets (SHM, circuit, incline,
 * circular motion, orbit, thin-lens optics). Each pulls the stated quantities out of a plain-English
 * problem and detects what it's ASKING, so the model can fill itself in and
 * pre-select the unknown to solve.
 *
 * Deterministic and offline — textbook problems state their numbers explicitly,
 * so a regex pass is reliable and needs no API key. Each parser is conservative:
 * it reports exactly what it matched and leaves the rest untouched.
 */

const NUM = '(-?\\d+(?:\\.\\d+)?)';
const f = (m: RegExpMatchArray | null): number | undefined =>
  m ? parseFloat(m[1]) : undefined;

/** Which equation + variable a question maps to. */
export interface SolveTarget {
  eqId: string;
  unknown: string;
}

export interface ParsedProblem {
  /** Base-parameter values to set, keyed by the widget's base symbol. */
  base: Record<string, number>;
  /** Detected question → which equation/unknown to surface. */
  solveFor?: SolveTarget;
  /** Human-readable list of what was extracted, for a confirmation line. */
  found: string[];
}

// --- Simple harmonic motion --------------------------------------------------
export function parseShmProblem(input: string): ParsedProblem {
  const t = input.toLowerCase();
  const base: Record<string, number> = {};
  const found: string[] = [];

  const mass = f(t.match(new RegExp(NUM + '\\s*(?:kg|kilograms?)', 'i')));
  if (mass != null) {
    base.m = mass;
    found.push(`mass ${mass} kg`);
  }

  const k = f(
    t.match(new RegExp(NUM + '\\s*(?:n/m|newtons?\\s*per\\s*met(?:er|re))', 'i')) ??
      t.match(new RegExp('(?:spring constant|stiffness|k)\\s*(?:of|=)?\\s*' + NUM, 'i')),
  );
  if (k != null) {
    base.k = k;
    found.push(`spring constant ${k} N/m`);
  }

  // Amplitude: a length tied to "amplitude", or "X cm/m amplitude". cm → m.
  const ampCm = f(
    t.match(new RegExp('amplitude\\s*(?:of|=)?\\s*' + NUM + '\\s*cm', 'i')) ??
      t.match(new RegExp(NUM + '\\s*cm\\s*amplitude', 'i')),
  );
  const ampM = f(
    t.match(new RegExp('amplitude\\s*(?:of|=)?\\s*' + NUM + '\\s*(?:m|met(?:er|re)s?)\\b', 'i')) ??
      t.match(new RegExp(NUM + '\\s*(?:m|met(?:er|re)s?)\\s*amplitude', 'i')),
  );
  if (ampCm != null) {
    base.A = ampCm / 100;
    found.push(`amplitude ${ampCm} cm`);
  } else if (ampM != null) {
    base.A = ampM;
    found.push(`amplitude ${ampM} m`);
  }

  let solveFor: SolveTarget | undefined;
  if (/(period|how long .*oscillation|time for one|seconds per)/.test(t))
    solveFor = { eqId: 'period', unknown: 'T' };
  else if (/(frequency|how many .*per second|hertz|\bhz\b|oscillations per)/.test(t))
    solveFor = { eqId: 'frequency', unknown: 'f' };
  else if (/(max(?:imum)? speed|fastest|maximum velocity)/.test(t))
    solveFor = { eqId: 'max-speed', unknown: 'vmax' };
  else if (/(energy)/.test(t)) solveFor = { eqId: 'energy', unknown: 'E' };

  return { base, solveFor, found };
}

// --- Ohm's law / circuit -----------------------------------------------------
export function parseCircuitProblem(input: string): ParsedProblem {
  const t = input.toLowerCase();
  const base: Record<string, number> = {};
  const found: string[] = [];

  const volts = f(t.match(new RegExp(NUM + '\\s*(?:v\\b|volts?)', 'i')));
  if (volts != null) {
    base.V = volts;
    found.push(`voltage ${volts} V`);
  }

  // Resistance: ohms (Ω / "ohm"), with k/M prefixes.
  const rk = f(t.match(new RegExp(NUM + '\\s*k(?:Ω|ohms?)', 'i')));
  const rM = f(t.match(new RegExp(NUM + '\\s*m(?:Ω|ohms?)', 'i')));
  const r = f(t.match(new RegExp(NUM + '\\s*(?:Ω|ohms?)', 'i')));
  if (rk != null) {
    base.R = rk * 1000;
    found.push(`resistance ${rk} kΩ`);
  } else if (rM != null) {
    base.R = rM * 1e6;
    found.push(`resistance ${rM} MΩ`);
  } else if (r != null) {
    base.R = r;
    found.push(`resistance ${r} Ω`);
  }

  let solveFor: SolveTarget | undefined;
  if (/(power|watts?|dissipat|how much .*heat)/.test(t)) solveFor = { eqId: 'power', unknown: 'P' };
  else if (/(current|how many amps?|amperes?)/.test(t)) solveFor = { eqId: 'ohm', unknown: 'I' };

  return { base, solveFor, found };
}

// --- Inclined plane ----------------------------------------------------------
export function parseInclineProblem(input: string): ParsedProblem {
  const t = input.toLowerCase();
  const base: Record<string, number> = {};
  const found: string[] = [];

  const angle = f(
    t.match(new RegExp(NUM + '\\s*(?:°|deg(?:ree)?s?\\b)', 'i')) ??
      t.match(new RegExp('(?:angle|incline|slope|ramp)\\s+of\\s+' + NUM, 'i')),
  );
  if (angle != null) {
    base.theta = angle;
    found.push(`angle ${angle}°`);
  }

  const mass = f(t.match(new RegExp(NUM + '\\s*(?:kg|kilograms?)', 'i')));
  if (mass != null) {
    base.m = mass;
    found.push(`mass ${mass} kg`);
  }

  const mu = f(
    t.match(new RegExp('(?:coefficient of friction|friction coefficient|μ|mu)\\s*(?:of|=|is)?\\s*' + NUM, 'i')),
  );
  if (mu != null) {
    base.mu = mu;
    found.push(`friction μ ${mu}`);
  } else if (/frictionless|smooth/.test(t)) {
    base.mu = 0;
    found.push('frictionless (μ 0)');
  }

  if (/\bmoon\b/.test(t)) {
    base.g = 1.6;
    found.push('gravity 1.6 m/s² (Moon)');
  } else if (/\bmars\b/.test(t)) {
    base.g = 3.7;
    found.push('gravity 3.7 m/s² (Mars)');
  } else {
    const gm = f(t.match(new RegExp('g\\s*=\\s*' + NUM, 'i')));
    if (gm != null) {
      base.g = gm;
      found.push(`gravity ${gm} m/s²`);
    }
  }

  let solveFor: SolveTarget | undefined;
  if (/(acceleration|how fast.*accel|rate of)/.test(t)) solveFor = { eqId: 'accel', unknown: 'a' };
  else if (/(normal force)/.test(t)) solveFor = { eqId: 'normal', unknown: 'N' };
  else if (/(friction force|force of friction)/.test(t)) solveFor = { eqId: 'friction', unknown: 'fr' };

  return { base, solveFor, found };
}

// --- Uniform circular motion -------------------------------------------------
export function parseCircularProblem(input: string): ParsedProblem {
  const t = input.toLowerCase();
  const base: Record<string, number> = {};
  const found: string[] = [];

  const radius = f(
    t.match(new RegExp('(?:radius|circle of radius)\\s*(?:of|=)?\\s*' + NUM + '\\s*(?:m|met(?:er|re)s?)?', 'i')) ??
      t.match(new RegExp(NUM + '\\s*(?:m|met(?:er|re)s?)\\s*(?:radius|in radius)', 'i')),
  );
  if (radius != null) {
    base.r = radius;
    found.push(`radius ${radius} m`);
  }

  const speed = f(
    t.match(new RegExp(NUM + '\\s*(?:m/s|meters?\\s*per\\s*second|metres?\\s*per\\s*second)', 'i')),
  );
  if (speed != null) {
    base.v = speed;
    found.push(`speed ${speed} m/s`);
  }

  let solveFor: SolveTarget | undefined;
  if (/(centripetal|acceleration toward|inward accel|how much .*acceleration)/.test(t))
    solveFor = { eqId: 'centripetal', unknown: 'ac' };
  else if (/(period|how long .*one (?:loop|revolution|orbit|lap)|time for one)/.test(t))
    solveFor = { eqId: 'period', unknown: 'T' };
  else if (/(angular velocity|angular speed|how fast.*radians)/.test(t))
    solveFor = { eqId: 'angular-velocity', unknown: 'omega' };

  return { base, solveFor, found };
}

// --- Two-body orbit (natural units, G = 1) -----------------------------------
export function parseOrbitProblem(input: string): ParsedProblem {
  const t = input.toLowerCase();
  const base: Record<string, number> = {};
  const found: string[] = [];

  const mass = f(
    t.match(new RegExp('(?:central\\s*mass|mass)\\s*(?:of|=|is)?\\s*' + NUM, 'i')) ??
      t.match(new RegExp('\\bM\\s*=\\s*' + NUM, 'i')),
  );
  if (mass != null) {
    base.M = mass;
    found.push(`central mass ${mass}`);
  }

  const dist = f(
    t.match(new RegExp('(?:distance|radius)\\s*(?:of|=|is)?\\s*' + NUM, 'i')) ??
      t.match(new RegExp('(?:at|from)\\s+(?:a\\s+)?(?:distance\\s+(?:of\\s+)?)?' + NUM, 'i')) ??
      t.match(new RegExp('\\br\\s*=\\s*' + NUM, 'i')),
  );
  if (dist != null) {
    base.r = dist;
    found.push(`launch distance ${dist}`);
  }

  const speed = f(
    t.match(new RegExp('(?:speed|velocity)\\s*(?:of|=|is)?\\s*' + NUM, 'i')) ??
      t.match(new RegExp('(?:launched|moving|travelling|traveling)\\s+at\\s+' + NUM, 'i')) ??
      t.match(new RegExp('\\bv\\s*=\\s*' + NUM, 'i')),
  );
  if (speed != null) {
    base.v = speed;
    found.push(`launch speed ${speed}`);
  }

  let solveFor: SolveTarget | undefined;
  if (/(escape)/.test(t)) solveFor = { eqId: 'escape-speed', unknown: 'vesc' };
  else if (/(circular speed|speed .*circular orbit|how fast.*circular)/.test(t))
    solveFor = { eqId: 'circular-speed', unknown: 'vc' };
  else if (/(period|how long .*orbit|time for one)/.test(t))
    solveFor = { eqId: 'period', unknown: 'T' };
  else if (/(eccentricity|how (?:elliptical|stretched)|shape of the orbit)/.test(t))
    solveFor = { eqId: 'eccentricity', unknown: 'e' };
  else if (/(semi-?major|size of the orbit)/.test(t)) solveFor = { eqId: 'semi-major', unknown: 'a' };

  return { base, solveFor, found };
}

// --- Thin-lens optics --------------------------------------------------------
/** Default converging focal length (m) reused when a problem only says "diverging". */
const RAY_DEFAULT_F = 0.1;

/** Parse a length that may be given in cm or m; returns meters. */
function meters(m: RegExpMatchArray | null): number | undefined {
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return undefined;
  return /cm/i.test(m[0]) ? n / 100 : n;
}

export function parseRayProblem(input: string): ParsedProblem {
  const t = input.toLowerCase();
  const base: Record<string, number> = {};
  const found: string[] = [];

  const focal = meters(
    t.match(new RegExp('focal\\s*length\\s*(?:of|=|is)?\\s*' + NUM + '\\s*(cm|m)', 'i')) ??
      t.match(new RegExp('\\bf\\s*=\\s*' + NUM + '\\s*(cm|m)', 'i')),
  );
  if (focal != null) {
    const sign = /diverging|concave\s*lens|negative/.test(t) ? -1 : 1;
    base.f = sign * Math.abs(focal);
    found.push(`focal length ${sign < 0 ? '−' : ''}${Math.abs(focal) * 100} cm`);
  } else if (/diverging|concave\s*lens/.test(t)) {
    // A diverging lens with no stated f still flips the default sign negative.
    base.f = -Math.abs(RAY_DEFAULT_F);
    found.push('diverging lens');
  }

  const objD = meters(
    t.match(new RegExp('(?:object|placed|located)\\D{0,16}?' + NUM + '\\s*(cm|m)', 'i')) ??
      t.match(new RegExp(NUM + '\\s*(cm|m)\\s*(?:in\\s*front|from\\s*the\\s*lens|away)', 'i')) ??
      t.match(new RegExp('d_?o\\s*=\\s*' + NUM + '\\s*(cm|m)', 'i')),
  );
  if (objD != null) {
    base.do = objD;
    found.push(`object distance ${objD * 100} cm`);
  }

  const objH = meters(
    t.match(new RegExp(NUM + '\\s*(cm|m)\\s*(?:tall|high|in height)', 'i')) ??
      t.match(new RegExp('height\\s*(?:of|=)?\\s*' + NUM + '\\s*(cm|m)', 'i')),
  );
  if (objH != null) {
    base.ho = objH;
    found.push(`object height ${objH * 100} cm`);
  }

  let solveFor: SolveTarget | undefined;
  if (/(magnif)/.test(t)) solveFor = { eqId: 'magnification', unknown: 'mag' };
  else if (/(how (?:tall|big|large)|image height|size of the image)/.test(t))
    solveFor = { eqId: 'image-height', unknown: 'hi' };
  else if (/(where .*image|image distance|real or virtual|how far .*image)/.test(t))
    solveFor = { eqId: 'lens-equation', unknown: 'di' };

  return { base, solveFor, found };
}
