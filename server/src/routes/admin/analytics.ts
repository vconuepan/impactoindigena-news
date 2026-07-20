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
  })
})

export default router
