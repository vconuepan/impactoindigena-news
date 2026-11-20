import { Router, type Request } from 'express'
import prisma from '../../lib/prisma.js'
import { config } from '../../config.js'
import { deviceType, dailyVisitorHash, lookupCountry, clientIpForAnalytics, isBot } from '../../lib/analyticsVisitor.js'
import { registrarVisitaPorFamilia } from '../../services/uaHits.js'

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

/** La ruta limpia de un beacon, o null si no parece una ruta publica del sitio. */
export function rutaValida(path: unknown): string | null {
  if (!path || typeof path !== 'string') return null
  // Strip query string and hash so /x?a=1 and /x?a=2 collapse to /x — otherwise
  // an abuser mints unbounded distinct rows via the query string.
  const cleanPath = path.split('?')[0].split('#')[0].slice(0, 200)
  if (!VALID_PATH.test(cleanPath)) return null
  // Ignore admin routes and API calls
  if (cleanPath.startsWith('/admin') || cleanPath.startsWith('/api')) return null
  return cleanPath
}

function hoyUtc(): Date {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return today
}

function ipDelLector(req: Request): string | undefined {
  return clientIpForAnalytics(req.headers['x-forwarded-for'], req.ip, config.proxy.clientIpFromRight)
}

router.post('/', async (req, res) => {
  // Always respond immediately so the client isn't blocked
  res.json({ ok: true })

  try {
    // Skip self-declared crawlers before counting anything: Googlebot renders JS
    // and fires this beacon like a browser, so without this the figures measure
    // indexing sweeps instead of readers.
    //
    // Desde el 20-nov-2026 lo descartado se CUENTA aparte, agregado y sin IP
    // (services/uaHits.ts): hasta ese dia se tiraba el 51 % de los beacons y el
    // panel no lo sabia.
    if (isBot(req.headers['user-agent'])) {
      await registrarVisitaPorFamilia('beacon', req.headers['user-agent'], ipDelLector(req))
      return
    }

    const { path, source } = req.body as { path?: unknown; source?: unknown }
    const cleanPath = rutaValida(path)
    if (!cleanPath) return

    // Validate source — unknown values fall back to direct ("")
    const cleanSource = typeof source === 'string' && ALLOWED_SOURCES.has(source) ? source : ''

    const today = hoyUtc()

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
    const ip = ipDelLector(req)
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

/**
 * POST /api/track/engaged — hubo interaccion humana en la pagina.
 *
 * El navegador lo manda UNA vez por carga, cuando hubo scroll, toque, tecla o
 * movimiento del mouse Y la pestaña estuvo visible al menos 5 segundos
 * (client/src/lib/engagement.ts). Un robot que solo carga la pagina no lo hace.
 *
 * Marca `interacted = true` para el visitante del dia en `visitor_day_signals`,
 * con el MISMO hash diario de daily_visitors (misma IP, mismo User-Agent, misma
 * sal en memoria), asi que se puede cruzar con su pais y dispositivo sin guardar
 * nada nuevo que identifique. Si el servidor se reinicio entre el beacon y este
 * aviso, la sal cambio y el aviso queda huerfano: es el mismo sobreconteo menor
 * que ya acepta daily_visitors.
 *
 * Tabla nueva y no columna de daily_visitors: el codigo puede llegar antes que
 * el SQL sin romper nada (.context/database-migrations.md).
 */
router.post('/engaged', async (req, res) => {
  res.json({ ok: true })
  try {
    if (isBot(req.headers['user-agent'])) return
    const { path } = req.body as { path?: unknown }
    if (!rutaValida(path)) return
    const ip = ipDelLector(req)
    if (!ip) return
    const today = hoyUtc()
    const hash = dailyVisitorHash(ip, req.headers['user-agent'], today.toISOString().slice(0, 10))
    await prisma.$executeRaw`
      INSERT INTO visitor_day_signals (id, date, visitor_hash, interacted)
      VALUES (gen_random_uuid(), ${today}, ${hash}, true)
      ON CONFLICT (date, visitor_hash) DO UPDATE SET interacted = true
    `
  } catch {
    // Igual que el beacon: la analitica nunca rompe el sitio.
  }
})

export default router
