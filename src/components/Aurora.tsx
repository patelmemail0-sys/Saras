/**
 * Fixed full-bleed iridescent aurora. Three soft-blended color fields that
 * drift on their own keyframes (dynamic iridescence) and shift toward the
 * cursor via the global --px/--py pointer field. Pure CSS — no canvas, no JS
 * per frame beyond the shared pointer rAF. Decorative, so aria-hidden.
 */
export default function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="aurora__blob aurora__blob--a" />
      <span className="aurora__blob aurora__blob--b" />
      <span className="aurora__blob aurora__blob--c" />
      <span className="aurora__grain" />
    </div>
  )
}
