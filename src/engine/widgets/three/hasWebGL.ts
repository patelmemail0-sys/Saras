/**
 * WebGL capability probe — shared gate for the 3D physics widgets. When it
 * returns false (old browser, disabled GPU, headless), a widget falls back to
 * its 2D SVG picture so the verified physics still renders. Mirrors the landing
 * page's check (src/landing/LandingLotus.tsx).
 */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
