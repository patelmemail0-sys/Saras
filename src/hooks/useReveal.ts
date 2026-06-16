import { useEffect, useRef } from 'react'

/**
 * Adds `is-in` to elements with `.reveal` once they enter the viewport.
 * One observer for the whole subtree, unobserves after reveal. No scroll listener.
 */
export function useReveal<T extends HTMLElement = HTMLElement>() {
  const root = useRef<T>(null)

  useEffect(() => {
    const node = root.current
    if (!node) return

    const targets = node.querySelectorAll<HTMLElement>('.reveal, .reveal-fade')
    if (!('IntersectionObserver' in window) || targets.length === 0) {
      targets.forEach((el) => el.classList.add('is-in'))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    )

    targets.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return root
}
