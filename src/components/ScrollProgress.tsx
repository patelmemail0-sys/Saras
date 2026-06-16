import { useScrollProgress } from '../hooks/useMotion'

/** Thin iridescent scroll-progress bar pinned to the top of the viewport. */
export default function ScrollProgress() {
  const ref = useScrollProgress<HTMLDivElement>()
  return (
    <div className="scrollbar" aria-hidden="true">
      <div className="scrollbar__fill" ref={ref} />
    </div>
  )
}
