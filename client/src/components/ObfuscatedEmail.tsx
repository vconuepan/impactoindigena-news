import { useEffect, useRef } from 'react'

/**
 * Renders an email link that is assembled client-side to deter naive bots.
 * Server-rendered / prerendered HTML shows "[email protected]" as a noscript
 * fallback; after hydration the real mailto: link replaces it.
 */
export default function ObfuscatedEmail({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const p = ['contacto', 'fundacionkm', 'org']
    const addr = `${p[0]}@${p[1]}.${p[2]}`
    const a = document.createElement('a')
    a.href = `\x6D\x61\x69\x6C\x74\x6F:${addr}`
    a.textContent = addr
    if (className) a.className = className
    ref.current.replaceWith(a)
  }, [className])

  return (
    <span ref={ref} className={className}>
      [email&#160;protected]
    </span>
  )
}
