import { useEffect, useRef } from 'react'

/**
 * Auto-closes a mobile surface (drawer/menu) whenever the viewport crosses up
 * into the Tailwind `lg` breakpoint (>= 1024px) — e.g. when a tablet is
 * rotated to landscape while the drawer is open.
 *
 * Uses `window.matchMedia` when the browser exposes it (all modern engines)
 * and gracefully falls back to a plain `resize` listener otherwise, so the
 * drawer still auto-closes on older or partial implementations.
 */
export function useCloseOnDesktop(onDesktopEnter: () => void) {
  const onDesktopEnterRef = useRef(onDesktopEnter)

  useEffect(() => {
    onDesktopEnterRef.current = onDesktopEnter
  }, [onDesktopEnter])

  useEffect(() => {
    if (typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(min-width: 1024px)')
      const handleChange = (event: MediaQueryListEvent) => {
        if (event.matches) onDesktopEnterRef.current()
      }
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    // Fallback for engines without matchMedia: derive the same lg breakpoint
    // from plain resize events.
    const handleResize = () => {
      if (window.innerWidth >= 1024) onDesktopEnterRef.current()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
}
