/**
 * Unit registry for the equation panel. Every EqVariable declares ONE canonical
 * unit (the unit its residual math and the renderer expect — m, kg, s, °, N/m…).
 * This module maps that canonical unit to the family of interchangeable units a
 * student may want to read/enter it in (cm, ft, g, rad, kΩ…).
 *
 * The physics never sees anything but canonical units: the panel converts a typed
 * value UP to canonical before it touches state, and converts the stored canonical
 * value DOWN for display. So changing the displayed unit is purely cosmetic — it
 * never perturbs the solver or the picture.
 *
 * Conversions are single-factor (no offsets), which covers every unit here:
 *   canonicalValue = displayValue × factor      (factor = canonical units per 1 display unit)
 */

export interface UnitOption {
  /** Display symbol, e.g. "cm". */
  symbol: string;
  /** Canonical units per 1 of this unit. The canonical option has factor 1. */
  factor: number;
}

// Keyed by the canonical unit symbol used in equations.ts. The first entry of
// each list is the canonical unit (factor 1).
const FAMILIES: Record<string, UnitOption[]> = {
  // length
  m: [
    { symbol: 'm', factor: 1 },
    { symbol: 'cm', factor: 0.01 },
    { symbol: 'mm', factor: 0.001 },
    { symbol: 'km', factor: 1000 },
    { symbol: 'ft', factor: 0.3048 },
    { symbol: 'in', factor: 0.0254 },
  ],
  // velocity
  'm/s': [
    { symbol: 'm/s', factor: 1 },
    { symbol: 'km/h', factor: 0.277778 },
    { symbol: 'mph', factor: 0.44704 },
    { symbol: 'ft/s', factor: 0.3048 },
  ],
  // acceleration
  'm/s²': [
    { symbol: 'm/s²', factor: 1 },
    { symbol: 'g', factor: 9.80665 },
    { symbol: 'ft/s²', factor: 0.3048 },
  ],
  // angle (canonical is degrees — the residuals convert deg→rad internally)
  '°': [
    { symbol: '°', factor: 1 },
    { symbol: 'rad', factor: 57.29578 },
  ],
  // time
  s: [
    { symbol: 's', factor: 1 },
    { symbol: 'ms', factor: 0.001 },
    { symbol: 'min', factor: 60 },
    { symbol: 'hr', factor: 3600 },
  ],
  // mass
  kg: [
    { symbol: 'kg', factor: 1 },
    { symbol: 'g', factor: 0.001 },
    { symbol: 'lb', factor: 0.453592 },
  ],
  // frequency
  Hz: [
    { symbol: 'Hz', factor: 1 },
    { symbol: 'kHz', factor: 1000 },
  ],
  // energy
  J: [
    { symbol: 'J', factor: 1 },
    { symbol: 'kJ', factor: 1000 },
    { symbol: 'cal', factor: 4.184 },
    { symbol: 'Wh', factor: 3600 },
  ],
  // force
  N: [
    { symbol: 'N', factor: 1 },
    { symbol: 'kN', factor: 1000 },
    { symbol: 'lbf', factor: 4.44822 },
  ],
  // voltage
  V: [
    { symbol: 'V', factor: 1 },
    { symbol: 'mV', factor: 0.001 },
    { symbol: 'kV', factor: 1000 },
  ],
  // current
  A: [
    { symbol: 'A', factor: 1 },
    { symbol: 'mA', factor: 0.001 },
  ],
  // resistance
  'Ω': [
    { symbol: 'Ω', factor: 1 },
    { symbol: 'mΩ', factor: 0.001 },
    { symbol: 'kΩ', factor: 1000 },
    { symbol: 'MΩ', factor: 1e6 },
  ],
  // power
  W: [
    { symbol: 'W', factor: 1 },
    { symbol: 'mW', factor: 0.001 },
    { symbol: 'kW', factor: 1000 },
    { symbol: 'hp', factor: 745.7 },
  ],
  // spring stiffness
  'N/m': [
    { symbol: 'N/m', factor: 1 },
    { symbol: 'N/cm', factor: 100 },
    { symbol: 'N/mm', factor: 1000 },
  ],
  // angular velocity
  'rad/s': [
    { symbol: 'rad/s', factor: 1 },
    { symbol: 'deg/s', factor: 0.0174533 },
    { symbol: 'rpm', factor: 0.10472 },
  ],
};

/** The interchangeable units for a canonical unit (just itself if none registered). */
export function unitsFor(canonical: string): UnitOption[] {
  return FAMILIES[canonical] ?? [{ symbol: canonical, factor: 1 }];
}

/** Display value (in `opt`'s unit) → canonical value. */
export const toCanonical = (value: number, opt: UnitOption): number => value * opt.factor;

/** Canonical value → display value in `opt`'s unit. */
export const fromCanonical = (value: number, opt: UnitOption): number => value / opt.factor;
