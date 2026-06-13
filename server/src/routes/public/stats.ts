import { Router } from 'express'
import prisma from '../../lib/prisma.js'
import { createLogger } from '../../lib/logger.js'

const router = Router()
const log = createLogger('public:stats')

router.get('/daily', async (_req, res) => {
  try {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date(todayStart)
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1)

    const [crawledToday, publishedToday, activeFeeds] = await Promise.all([
      prisma.story.count({
        where: { dateCrawled: { gte: todayStart, lt: todayEnd } },
      }),
      prisma.story.count({
        where: {
          status: 'published',
          datePublished: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.feed.count({ where: { active: true } }),
    ])

    res.set('Cache-Control', 'public, max-age=120')
    res.json({ crawledToday, publishedToday, activeFeeds, updatedAt: now.toISOString() })
  } catch (err) {
    log.error({ err }, 'failed to fetch daily stats')
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

export default router
