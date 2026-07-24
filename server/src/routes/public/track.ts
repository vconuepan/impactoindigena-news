import { Router } from 'express'
import prisma from '../../lib/prisma.js'
import { deviceType, dailyVisitorHash, lookupCountry, clientIpForAnalytics, isBot } from '../../lib/analyticsVisitor.js'

const router = Router()

// POST /api/track
// Lightweight page view counter — no cookies, no PII stored.
// Increments a daily counter per path + traffic source.
// source: "" (direct) | "search" | "social" | "referral" | "newsletter" | "internal"
// (classified client-side from the referrer / the ?_r tag; see usePageTracking)
const ALLOWED_SOURCES = new Set(['newsletter', 'social', 'search', 'referral', 'internal', ''])
// Accept only plausible in-app paths: must start with '/', reasonable length,
// and a restricted character set. This bounds the distinct-path cardinality an
// abuser can create (each distinct path is a new row), rejecting arbitrary
// junk strings while still allowing real routes and story slugs.
// NOTE: query/hash are stripped before matching (see below), and the pattern
// deliberately excludes ? & = so a query string can't reintroduce unbounded
// cardinality even if stripping is ever bypassed.
const VALID_PATH = /^\/[A-Za-z0-9\-_/.~%]*$/

router.post('/', async (req, res) => {
  // Always respond immediately so the client isn't blocked
  res.json({ ok: true })

  try {
    // Skip self-declared crawlers before counting anything: Googlebot renders JS
    // and fires this beacon like a browser, so without this the figures measure
    // indexing sweeps instead of readers.
    if (isBot(req.headers['user-agent'])) return

    const { path, source } = req.body as { path?: unknown; source?: unknown }
    if (!path || typeof path !== 'string') return
    // Strip query string and hash so /x?a=1 and /x?a=2 collapse to /x — otherwise
    // an abuser mints unbounded distinct rows via the query string.
    const cleanPath = path.split('?')[0].split('#')[0].slice(0, 200)
    // Reject malformed paths (must look like an in-app route)
    if (!VALID_PATH.test(cleanPath)) return
    // Ignore admin routes and API calls
    if (cleanPath.startsWith('/admin') || cleanPath.startsWith('/api')) return

    // Validate source — unknown values fall back to direct ("")
    const cleanSource = typeof source === 'string' && ALLOWED_SOURCES.has(source) ? source : ''

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    // Raw upsert — avoids dependency on regenerated Prisma client for the new column
    await prisma.$executeRaw`
      INSERT INTO page_views (id, path, date, source, count)
      VALUES (gen_random_uuid(), ${cleanPath}, ${today}, ${cleanSource}, 1)
      ON CONFLICT (path, date, source) DO UPDATE SET count = page_views.count + 1
    `

    // Record the visitor once per day (aggregate, privacy-preserving). The daily
    // hash lets us count unique visitors without cookies or storing IP/UA; the
    // first hit of the day also captures the visitor's country + device. ON
    // CONFLICT DO NOTHING keeps it to one row per visitor per day. Fails silently
    // if the table isn't migrated yet (deploy-before-migrate is safe).
    const ip = clientIpForAnalytics(req.headers['x-forwarded-for'], req.ip)
    if (ip) {
      const ua = req.headers['user-agent']
      const dayStr = today.toISOString().slice(0, 10)
      const hash = dailyVisitorHash(ip, ua, dayStr)
      const country = await lookupCountry(ip)
      const device = deviceType(ua)
      await prisma.$executeRaw`
        INSERT INTO daily_visitors (id, date, visitor_hash, country, device)
        VALUES (gen_random_uuid(), ${today}, ${hash}, ${country}, ${device})
        ON CONFLICT (date, visitor_hash) DO NOTHING
      `
    }
  } catch {
    // Silently ignore errors — analytics should never break the app
  }
})

export default router
