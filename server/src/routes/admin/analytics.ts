import { Router } from 'express'
import prisma from '../../lib/prisma.js'
import { Prisma } from '@prisma/client'

const router = Router()

// GET /api/admin/analytics?days=30
router.get('/', async (req, res) => {
  const days = Math.min(90, Math.max(7, parseInt(req.query.days as string, 10) || 30))
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  const [totalRow, byDay, byPath, rawBySource] = await Promise.all([
    // Total views in period
    prisma.pageView.aggregate({
      _sum: { count: true },
      where: { date: { gte: since } },
    }),

    // Views grouped by day (aggregate across all sources)
    prisma.pageView.groupBy({
      by: ['date'],
      _sum: { count: true },
      where: { date: { gte: since } },
      orderBy: { date: 'asc' },
    }),

    // Top pages (limited to top 50, aggregate across all sources)
    prisma.pageView.groupBy({
      by: ['path'],
      _sum: { count: true },
      where: { date: { gte: since } },
      orderBy: { _sum: { count: 'desc' } },
      take: 50,
    }),

    // Breakdown by traffic source — raw query so it compiles before db:generate.
    // Excludes 'internal' (in-session SPA navigation isn't an acquisition source),
    // so this reflects where visits actually came from.
    prisma.$queryRaw<Array<{ source: string; total: bigint }>>`
      SELECT source, SUM(count) AS total
      FROM page_views
      WHERE date >= ${since} AND source <> 'internal'
      GROUP BY source
      ORDER BY total DESC
    `,
  ])

  // Today and yesterday views
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1)

  const [todayRow, yesterdayRow] = await Promise.all([
    prisma.pageView.aggregate({
      _sum: { count: true },
      where: { date: { gte: todayStart } },
    }),
    prisma.pageView.aggregate({
      _sum: { count: true },
      where: { date: { gte: yesterdayStart, lt: todayStart } },
    }),
  ])

  // Unique visitors + country + device, from the aggregate daily_visitors table.
  // Wrapped so the page still renders if the table isn't migrated yet. Note: a
  // visitor is counted once PER DAY (the hash rotates daily by design), so the
  // period figure is the sum of daily-unique visitors, not distinct people over
  // the whole range — labelled accordingly in the UI.
  let uniqueToday = 0
  let uniqueYesterday = 0
  let uniquePeriod = 0
  let byCountry: Array<{ country: string; count: number }> = []
  let byDevice: Array<{ device: string; count: number }> = []
  try {
    const [uToday, uYest, uPeriod, countries, devices] = await Promise.all([
      prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM daily_visitors WHERE date >= ${todayStart}`,
      prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM daily_visitors WHERE date >= ${yesterdayStart} AND date < ${todayStart}`,
      prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM daily_visitors WHERE date >= ${since}`,
      prisma.$queryRaw<Array<{ country: string; total: bigint }>>`SELECT country, COUNT(*)::bigint AS total FROM daily_visitors WHERE date >= ${since} GROUP BY country ORDER BY total DESC LIMIT 12`,
      prisma.$queryRaw<Array<{ device: string; total: bigint }>>`SELECT device, COUNT(*)::bigint AS total FROM daily_visitors WHERE date >= ${since} GROUP BY device ORDER BY total DESC`,
    ])
    uniqueToday = Number(uToday[0]?.n ?? 0)
    uniqueYesterday = Number(uYest[0]?.n ?? 0)
    uniquePeriod = Number(uPeriod[0]?.n ?? 0)
    byCountry = countries.map((r) => ({ country: r.country, count: Number(r.total) }))
    byDevice = devices.map((r) => ({ device: r.device, count: Number(r.total) }))
  } catch {
    // daily_visitors not migrated yet — leave uniques/country/device empty.
  }

  // Lo que el panel no veia hasta el 20-nov-2026 (docs/propuesta-analytics-bots.md):
  // los robots que el filtro descarta, las cargas de fichas que nunca ejecutan
  // JavaScript y cuantos visitantes interactuaron de verdad. Cada bloque cuenta
  // desde que su tabla tiene datos (`desde`), no desde el inicio del periodo, para
  // no comparar ventanas distintas. Tolera que el SQL aun no se haya aplicado.
  const automated = await robotsDelPeriodo(since)
  const interaction = await interaccionDelPeriodo(since)

  // Fill in missing days with 0
  const dayMap = new Map<string, number>()
  for (const row of byDay) {
    const key = row.date.toISOString().slice(0, 10)
    dayMap.set(key, (dayMap.get(key) ?? 0) + (row._sum.count ?? 0))
  }
  const filledDays: Array<{ date: string; count: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    d.setUTCHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    filledDays.push({ date: key, count: dayMap.get(key) ?? 0 })
  }

  const pages = byPath.map((row) => ({
    path: row.path,
    count: row._sum.count ?? 0,
  }))

  const storyPages = pages.filter((p) => p.path.startsWith('/stories/'))
  const uniquePages = byPath.length

  const sourceBreakdown = rawBySource.map((row) => ({
    source: row.source || 'direct',
    count: Number(row.total),
  }))
  // Ensure "direct" always appears even if no data yet
  if (!sourceBreakdown.find((s) => s.source === 'direct')) {
    sourceBreakdown.push({ source: 'direct', count: 0 })
  }

  res.json({
    period: days,
    total: totalRow._sum.count ?? 0,
    today: todayRow._sum.count ?? 0,
    yesterday: yesterdayRow._sum.count ?? 0,
    uniquePages,
    uniqueVisitors: { today: uniqueToday, yesterday: uniqueYesterday, period: uniquePeriod },
    byCountry,
    byDevice,
    byDay: filledDays,
    topPages: pages.slice(0, 20),
    topStories: storyPages.slice(0, 10),
    bySource: sourceBreakdown,
    automated,
    interaction,
  })
})

/** El mas tardio de dos dias: el inicio del periodo o el primer dato de la tabla. */
function desdeComun(since: Date, primerDato: Date | null): Date | null {
  if (!primerDato) return null
  return primerDato > since ? primerDato : since
}

export interface RobotsDelPeriodo {
  /** Primer dia con datos dentro del periodo; null si la tabla esta vacia o no existe. */
  desde: string | null
  /** Una fila por superficie, familia y agente, de mayor a menor. */
  filas: Array<{ surface: string; family: string; agent: string; count: number }>
  /** Vistas de fichas que SI enviaron el beacon (page_views), en la misma ventana. */
  fichasConJs: number
}

export async function robotsDelPeriodo(since: Date): Promise<RobotsDelPeriodo> {
  try {
    const [primero] = await prisma.$queryRaw<Array<{ d: Date | null }>>`
      SELECT MIN(date) AS d FROM ua_hits_daily WHERE date >= ${since}
    `
    const desde = desdeComun(since, primero?.d ?? null)
    if (!desde) return { desde: null, filas: [], fichasConJs: 0 }
    const [filas, [conJs]] = await Promise.all([
      prisma.$queryRaw<Array<{ surface: string; family: string; agent: string; total: bigint }>>`
        SELECT surface, family, agent, SUM(count)::bigint AS total
        FROM ua_hits_daily WHERE date >= ${desde}
        GROUP BY surface, family, agent ORDER BY total DESC
      `,
      prisma.$queryRaw<Array<{ total: bigint | null }>>`
        SELECT SUM(count)::bigint AS total FROM page_views
        WHERE date >= ${desde} AND path LIKE '/stories/%' AND source <> 'internal'
      `,
    ])
    return {
      desde: desde.toISOString().slice(0, 10),
      filas: filas.map((r) => ({ surface: r.surface, family: r.family, agent: r.agent, count: Number(r.total) })),
      fichasConJs: Number(conJs?.total ?? 0),
    }
  } catch {
    return { desde: null, filas: [], fichasConJs: 0 }
  }
}

export interface InteraccionDelPeriodo {
  desde: string | null
  visitantes: number
  interactuaron: number
  porPais: Array<{ country: string; visitantes: number; interactuaron: number }>
}

export async function interaccionDelPeriodo(since: Date): Promise<InteraccionDelPeriodo> {
  try {
    const [primero] = await prisma.$queryRaw<Array<{ d: Date | null }>>`
      SELECT MIN(date) AS d FROM visitor_day_signals WHERE date >= ${since}
    `
    const desde = desdeComun(since, primero?.d ?? null)
    if (!desde) return { desde: null, visitantes: 0, interactuaron: 0, porPais: [] }
    const porPais = await prisma.$queryRaw<Array<{ country: string; visitantes: bigint; interactuaron: bigint }>>`
      SELECT d.country,
             COUNT(*)::bigint AS visitantes,
             COUNT(*) FILTER (WHERE s.interacted)::bigint AS interactuaron
      FROM daily_visitors d
      LEFT JOIN visitor_day_signals s ON s.date = d.date AND s.visitor_hash = d.visitor_hash
      WHERE d.date >= ${desde}
      GROUP BY d.country
      ORDER BY visitantes DESC
    `
    const filas = porPais.map((r) => ({ country: r.country, visitantes: Number(r.visitantes), interactuaron: Number(r.interactuaron) }))
    return {
      desde: desde.toISOString().slice(0, 10),
      visitantes: filas.reduce((s, r) => s + r.visitantes, 0),
      interactuaron: filas.reduce((s, r) => s + r.interactuaron, 0),
      porPais: filas.slice(0, 12),
    }
  } catch {
    return { desde: null, visitantes: 0, interactuaron: 0, porPais: [] }
  }
}

export default router
