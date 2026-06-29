/**
 * Closed-form correctness harness for the orbit and thin-lens models — the
 * deterministic physics shared by their renderers and their validation gates.
 * Run it with `bun run test` (or `bun src/engine/physicsModels.test.ts`).
 *
 * Like circuitNetwork.test.ts this is a plain standalone script, NOT a `bun:test`
 * suite, so `bun run build` (which typechecks all of `src` with vite/client types
 * only) stays clean. Assertions tally into pass/fail; a non-zero `failed` throws.
 */
import { orbitMechanics, validateOrbit, lensOptics, validateRay } from './validate.ts';
import {
  ORBIT_EQUATION_SET,
  RAY_EQUATION_SET,
  equationsForSpecType,
} from './equations.ts';
import { parseOrbitProblem, parseRayProblem } from './wordProblems.ts';
import type { OrbitSpec, RayDiagramSpec } from './spec.ts';

const approx = (a: number, b: number, tol = 1e-4) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
let pass = 0;
let failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; } else { failed++; console.log('FAIL', name); }
};

const orbit = (centralMass: number, distance: number, speed: number): OrbitSpec => ({
  type: 'orbit-sim', title: 't', centralMass, distance, speed, notes: '',
});

// 1. Circular orbit: v = √(M/r) ⇒ e = 0, a = r, T = 2π√(r³/M).
{
  const k = orbitMechanics(orbit(1, 1, 1));
  check('circular bound', k.bound);
  check('circular e≈0', approx(k.eccentricity, 0));
  check('circular a≈1', approx(k.semiMajor, 1));
  check('circular vc=1', approx(k.circularSpeed, 1));
  check('circular vesc=√2', approx(k.escapeSpeed, Math.SQRT2));
  check('circular T=2π', approx(k.period, 2 * Math.PI));
  check('circular speed steady', approx(k.at(0).speed, 1) && approx(k.at(1).speed, 1));
}

// 2. Elliptical orbit launched fast at periapsis (v > vc): r is the closest point.
{
  const k = orbitMechanics(orbit(1, 1, 1.2));
  check('ellipse bound', k.bound);
  check('ellipse e=0.44', approx(k.eccentricity, 0.44));
  check('ellipse launch at periapsis', k.launchAtPeriapsis);
  check('ellipse periapsis = launch r', approx(k.periapsis, 1));
  check('ellipse periapsis speed = launch v', approx(k.at(0).speed, 1.2));
  // Kepler's 2nd law: faster at periapsis than at apoapsis (half a period later).
  check('ellipse apoapsis slower', k.at(k.period / 2).speed < k.at(0).speed);
  check('ellipse apoapsis = a(1+e)', approx(k.at(k.period / 2).r, k.apoapsis));
}

// 3. Escape: at the escape speed the orbit is unbound (no closed ellipse).
{
  const k = orbitMechanics(orbit(1, 1, Math.SQRT2));
  check('escape unbound', !k.bound);
  check('escape e≈1', approx(k.eccentricity, 1));
  check('escape period ∞', !Number.isFinite(k.period));
  check('escape still valid spec', validateOrbit(orbit(1, 1, Math.SQRT2)).valid);
}

// 4. Orbit validation rejects non-physical inputs.
check('orbit rejects M≤0', !validateOrbit(orbit(0, 1, 1)).valid);
check('orbit rejects r≤0', !validateOrbit(orbit(1, 0, 1)).valid);

const lens = (focalLength: number, objectDistance: number, objectHeight: number): RayDiagramSpec => ({
  type: 'ray-diagram', title: 't', focalLength, objectDistance, objectHeight, notes: '',
});

// 5. Converging lens, object beyond f ⇒ real, inverted, here half-size.
{
  const o = lensOptics(lens(0.1, 0.3, 0.05));
  check('conv di=0.15', approx(o.imageDistance, 0.15));
  check('conv m=-0.5', approx(o.magnification, -0.5));
  check('conv hi=-0.025', approx(o.imageHeight, -0.025));
  check('conv real', o.real);
  check('conv inverted', !o.upright);
}

// 6. Converging lens, object inside f ⇒ virtual, upright, magnified (magnifier).
{
  const o = lensOptics(lens(0.1, 0.05, 0.05));
  check('magnifier di=-0.1', approx(o.imageDistance, -0.1));
  check('magnifier m=2', approx(o.magnification, 2));
  check('magnifier virtual', !o.real);
  check('magnifier upright', o.upright);
  check('magnifier enlarged', Math.abs(o.magnification) > 1);
}

// 7. Diverging lens ⇒ always virtual, upright, reduced.
{
  const o = lensOptics(lens(-0.1, 0.3, 0.05));
  check('div di=-0.075', approx(o.imageDistance, -0.075));
  check('div virtual', !o.real);
  check('div upright', o.upright);
  check('div reduced', Math.abs(o.magnification) < 1);
}

// 8. Lens validation rejects f=0 and object exactly at the focal point.
check('ray rejects f=0', !validateRay(lens(0, 0.3, 0.05)).valid);
check('ray rejects object at focus', !validateRay(lens(0.1, 0.1, 0.05)).valid);
check('ray accepts a normal lens', validateRay(lens(0.1, 0.3, 0.05)).valid);

// 8b. Slow launch (v < circular speed) ⇒ launch point is the APOAPSIS, and at(0)
//     must start the body where it was launched (the apoapsis branch, M0 = π).
{
  const k = orbitMechanics(orbit(1, 1, 0.8));
  check('slow bound', k.bound);
  check('slow launch at apoapsis', !k.launchAtPeriapsis);
  check('slow at(0) speed = launch v', approx(k.at(0).speed, 0.8));
  check('slow at(0) r = launch r', approx(k.at(0).r, 1));
  check('slow at(0) is apoapsis', approx(k.at(0).r, k.apoapsis));
  // Half a period later it is at periapsis: closer and faster.
  check('slow periapsis faster', k.at(k.period / 2).speed > k.at(0).speed);
  check('slow periapsis = a(1-e)', approx(k.at(k.period / 2).r, k.periapsis));
}

// 8c. Unbound orbit: at(t) holds the body at the launch apsis (no closed path).
{
  const k = orbitMechanics(orbit(1, 1, 1.6)); // 1.6 > escape √2 ≈ 1.414
  check('unbound not bound', !k.bound);
  check('unbound at(t) holds position', k.at(5).x === k.periapsis && k.at(5).y === 0);
  check('unbound at(t) holds speed', k.at(5).speed === 1.6);
}

// 9. Orbit equation set: every residual is ~0 at the closed-form solution from
//    orbitMechanics (the set the word-problem solver drives must agree with it).
{
  const M = 1.3, r = 1.4, v = 1.05;
  const k = orbitMechanics(orbit(M, r, v));
  const eq = (id: string) => ORBIT_EQUATION_SET.equations.find((e) => e.id === id)!;
  check('orbit eq eccentricity residual≈0', approx(eq('eccentricity').residual({ e: k.eccentricity, r, v, M }), 0, 1e-9));
  check('orbit eq circular-speed residual≈0', approx(eq('circular-speed').residual({ vc: k.circularSpeed, M, r }), 0, 1e-9));
  check('orbit eq escape-speed residual≈0', approx(eq('escape-speed').residual({ vesc: k.escapeSpeed, M, r }), 0, 1e-9));
  check('orbit eq semi-major residual≈0', approx(eq('semi-major').residual({ a: k.semiMajor, r, v, M }), 0, 1e-9));
  check('orbit eq period residual≈0', approx(eq('period').residual({ T: k.period, M, r, v }), 0, 1e-9));
  // A wrong value must leave a non-zero residual (the solver gate actually bites).
  check('orbit eq circular-speed residual≠0 off solution', Math.abs(eq('circular-speed').residual({ vc: k.circularSpeed + 0.1, M, r })) > 1e-6);
}

// 10. Ray equation set: residuals ~0 at the lensOptics solution.
{
  const f = 0.1, d0 = 0.3, h0 = 0.05;
  const o = lensOptics(lens(f, d0, h0));
  const eq = (id: string) => RAY_EQUATION_SET.equations.find((e) => e.id === id)!;
  check('ray eq lens-equation residual≈0', approx(eq('lens-equation').residual({ di: o.imageDistance, f, do: d0 }), 0, 1e-9));
  check('ray eq magnification residual≈0', approx(eq('magnification').residual({ mag: o.magnification, f, do: d0 }), 0, 1e-9));
  check('ray eq image-height residual≈0', approx(eq('image-height').residual({ hi: o.imageHeight, f, do: d0, ho: h0 }), 0, 1e-9));
  check('ray eq lens-equation residual≠0 off solution', Math.abs(eq('lens-equation').residual({ di: o.imageDistance + 0.05, f, do: d0 })) > 1e-6);
}

// 11. Spec-type → equation-set routing for the two new widgets.
check('equationsForSpecType orbit-sim', equationsForSpecType('orbit-sim') === ORBIT_EQUATION_SET);
check('equationsForSpecType ray-diagram', equationsForSpecType('ray-diagram') === RAY_EQUATION_SET);

// 12. parseOrbitProblem: pulls M/r/v and detects what's being asked.
{
  const p = parseOrbitProblem('A satellite at distance 2 around a central mass of 4, escape speed?');
  check('orbit parse M=4', p.base.M === 4);
  check('orbit parse r=2', p.base.r === 2);
  check('orbit parse asks escape', p.solveFor?.eqId === 'escape-speed' && p.solveFor?.unknown === 'vesc');
}
{
  const p = parseOrbitProblem('M = 1, r = 1, launched at 1.2 — how elliptical is the orbit?');
  check('orbit parse M=1 (M=)', p.base.M === 1);
  check('orbit parse v=1.2 (launched at)', p.base.v === 1.2);
  check('orbit parse asks eccentricity', p.solveFor?.eqId === 'eccentricity');
}
{
  const p = parseOrbitProblem('speed for a circular orbit at radius 3 with mass 2?');
  check('orbit parse radius=3', p.base.r === 3);
  check('orbit parse asks circular speed', p.solveFor?.eqId === 'circular-speed');
}
{
  const p = parseOrbitProblem('period of the orbit at r=5, M=2, v=0.5');
  check('orbit parse asks period', p.solveFor?.eqId === 'period');
}
{
  const p = parseOrbitProblem('semi-major axis for M=1 r=1 v=1.1');
  check('orbit parse asks semi-major', p.solveFor?.eqId === 'semi-major');
}
{
  // No recognizable question → no solve target, but stated numbers still found.
  const p = parseOrbitProblem('a planet orbiting at distance 1 with speed 1');
  check('orbit parse no solveFor', p.solveFor === undefined);
  check('orbit parse found list non-empty', p.found.length > 0);
}

// 13. parseRayProblem: cm↔m conversion, diverging sign, question detection.
{
  const p = parseRayProblem('A converging lens of focal length 10 cm, object placed 30 cm in front. Where is the image?');
  check('ray parse f=0.1m from 10cm', approx(p.base.f, 0.1));
  check('ray parse do=0.3m from 30cm', approx(p.base.do, 0.3));
  check('ray parse asks image distance', p.solveFor?.eqId === 'lens-equation' && p.solveFor?.unknown === 'di');
}
{
  const p = parseRayProblem('A diverging lens with focal length 20 cm, object 50 cm away. Magnification?');
  check('ray parse diverging f negative', p.base.f < 0 && approx(Math.abs(p.base.f), 0.2));
  check('ray parse asks magnification', p.solveFor?.eqId === 'magnification');
}
{
  const p = parseRayProblem('object is 0.05 m tall, lens f = 0.1 m, do = 0.3 m. How tall is the image?');
  check('ray parse ho=0.05m', approx(p.base.ho, 0.05));
  check('ray parse asks image height', p.solveFor?.eqId === 'image-height' && p.solveFor?.unknown === 'hi');
}
{
  // "diverging lens" with no stated f still flips to a negative default focal length.
  const p = parseRayProblem('a diverging lens forms what kind of image?');
  check('ray parse diverging default f<0', p.base.f != null && p.base.f < 0);
}
{
  const p = parseRayProblem('a lens and an object somewhere');
  check('ray parse no solveFor', p.solveFor === undefined);
}

console.log(`physicsModels: ${pass} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
