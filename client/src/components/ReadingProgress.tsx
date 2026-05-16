/**
 * ReadingProgress — thin accent bar at the top of the viewport.
 *
 * Tracks scroll position relative to the total page height and renders a
 * 3px bar using the current category's brand color. Respects
 * prefers-reduced-motion (bar still renders but updates without animation).
 *
 * Usage: mount at the top of any long-form page component.
 */
import { useEffect, useState } from 'react'

interface ReadingProgressProps {
  /** Accent color in any valid CSS color string (defaults to brand green) */
  color?: string
}

export default function ReadingProgress({ color = 'var(--brand, #0D5F3C)' }: ReadingProgressProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const scrollTop = doc.scrollTop || document.body.scrollTop
      const scrollHeight = doc.scrollHeight - doc.clientHeight
      const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0
      setProgress(Math.min(100, Math.max(0, pct)))
    }

    // Read initial position (e.g. after back-navigation)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
      style={{ height: 3 }}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progreso de lectura"
    >
      <div
        className="h-full motion-safe:transition-[width] motion-safe:duration-75 ease-out"
        style={{ width: `${progress}%`, backgroundColor: color }}
      />
    </div>
  )
}
