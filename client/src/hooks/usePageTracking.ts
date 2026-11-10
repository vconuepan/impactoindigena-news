import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { estaPrerenderizando } from '../lib/prerender'

/**
 * Classifies the acquisition source of a visit from its referrer. Pure and
 * exported so it can be unit-tested. Returns the canonical source label stored
 * by the counter: '' (direct), 'search', 'social', 'referral', or 'internal'.
 */
export function classifyReferrer(referrer: string, currentHost: string): string {
  if (!referrer) return '' // no referrer → direct / typed / bookmark
  let host: string
  try {
    host = new URL(referrer).hostname.toLowerCase()
  } catch {
    return ''
  }
  if (host === currentHost.toLowerCase()) return 'internal'

  const SEARCH = ['google.', 'bing.', 'duckduckgo.', 'yahoo.', 'ecosia.', 'qwant.', 'startpage.', 'brave.', 'yandex.', 'baidu.']
  const SOCIAL = [
    'facebook.', 'fb.com', 'fb.me', 'instagram.', 't.co', 'twitter.', 'x.com',
    'linkedin.', 'lnkd.in', 'bsky.', 'mastodon', 'reddit.', 'whatsapp', 'wa.me',
    't.me', 'telegram', 'tiktok.', 'youtube.', 'youtu.be',
  ]
  if (SEARCH.some((s) => host.includes(s))) return 'search'
  if (SOCIAL.some((s) => host.includes(s))) return 'social'
  return 'referral'
}

// Only the first hit of a full page load is an acquisition event; subsequent
// SPA route changes are internal navigation. Module-level so it persists across
// route changes within one load and resets on a real reload.
let isFirstHit = true

/**
 * Fires a lightweight page view hit on every route change.
 * No cookies, no PII — just path + day counter + traffic source on the server.
 *
 * Source attribution:
 *   ?_r=newsletter / ?_r=social  → explicit tag on an outbound link (wins).
 *   otherwise, on the entry hit  → classified from document.referrer
 *                                  (search / social / referral / direct).
 *   subsequent in-session hits   → 'internal'.
 */
export function usePageTracking() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    // Don't track admin routes
    if (pathname.startsWith('/admin')) return
    // Ni el horneado del build. No es una visita, y el servidor ya la descartaba
    // por el User-Agent (HeadlessChrome), pero cada una gastaba cupo del
    // limitador publico: 85 de las 204 consultas de un build eran estas, y desde
    // la 101 las paginas salian en esqueleto (B23, 10-nov-2026).
    if (estaPrerenderizando()) return

    let source = ''
    if (isFirstHit) {
      const ref = new URLSearchParams(search).get('_r')
      if (ref === 'newsletter') source = 'newsletter'
      else if (ref === 'social') source = 'social'
      else source = classifyReferrer(document.referrer, window.location.hostname)
    } else {
      source = 'internal'
    }
    isFirstHit = false

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
