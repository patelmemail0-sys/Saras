/**
 * `prefers-reduced-motion` hook for the 3D scenes. When true, Scene3D drops to
 * on-demand rendering and disables auto-rotation, so the picture holds still
 * until the student drives it (sliders/scrub still work). Matches the reduced
 * gating used by the landing lotus (src/landing/lotus/LotusCanvas.tsx).
 */
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
