import { Router } from 'express'
import prisma from '../../lib/prisma.js'

const router = Router()

// POST /api/track
// Lightweight page view counter — no cookies, no PII stored.
// Increments a daily counter per path + traffic source.
// source: "" (direct) | "newsletter" | "social"
const ALLOWED_SOURCES = new Set(['newsletter', 'social', ''])

router.post('/', async (req, res) => {
  // Always respond immediately so the client isn't blocked
  res.json({ ok: true })

  try {
    const { path, source } = req.body as { path?: unknown; source?: unknown }
    if (!path || typeof path !== 'string') return
    // Ignore admin routes and API calls
    if (path.startsWith('/admin') || path.startsWith('/api')) return

    // Validate source — unknown values fall back to direct ("")
    const cleanSource = typeof source === 'string' && ALLOWED_SOURCES.has(source) ? source : ''

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const cleanPath = path.slice(0, 500)

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
