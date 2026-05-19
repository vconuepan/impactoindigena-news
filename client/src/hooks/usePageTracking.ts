import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Fires a lightweight page view hit on every route change.
 * No cookies, no PII — just path + day counter + traffic source on the server.
 *
 * Source attribution: reads the `?_r` query parameter appended by outbound links.
 *   ?_r=newsletter → traffic from an email newsletter
 *   ?_r=social     → traffic from a social media post
 *   (absent)       → direct / organic traffic
 */
export function usePageTracking() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    // Don't track admin routes
    if (pathname.startsWith('/admin')) return

    // Map ?_r= value to a canonical source label
    const params = new URLSearchParams(search)
    const ref = params.get('_r')
    const source = ref === 'newsletter' ? 'newsletter' : ref === 'social' ? 'social' : ''

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname, source }),
      // keepalive ensures the request completes even if the page unloads
      keepalive: true,
    }).catch(() => {
      // Silently ignore — analytics should never affect UX
    })
  }, [pathname, search])
}
