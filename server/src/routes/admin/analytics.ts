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
    byDay: filledDays,
    topPages: pages.slice(0, 20),
    topStories: storyPages.slice(0, 10),
    bySource: sourceBreakdown,
  })
})

export default router
