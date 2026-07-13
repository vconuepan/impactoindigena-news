import { Router } from 'express'
import prisma from '../../lib/prisma.js'

const router = Router()

// POST /api/track
// Lightweight page view counter — no cookies, no PII stored.
// Increments a daily counter per path + traffic source.
// source: "" (direct) | "newsletter" | "social"
const ALLOWED_SOURCES = new Set(['newsletter', 'social', ''])
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
  } catch {
    // Silently ignore errors — analytics should never break the app
  }
})

export default router
