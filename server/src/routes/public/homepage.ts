import { Router } from 'express'
import * as storyService from '../../services/story.js'
import * as issueService from '../../services/issue.js'
import prisma from '../../lib/prisma.js'
import { TTLCache, cached } from '../../lib/cache.js'
import { createLogger } from '../../lib/logger.js'

const router = Router()
const log = createLogger('public:homepage')

// Cache homepage data for 1 minute
const HOMEPAGE_TTL = 60 * 1000
const homepageCache = new TTLCache<unknown>(HOMEPAGE_TTL)

// Issue slugs in display order for homepage
const HOMEPAGE_ISSUE_SLUGS = [
  'cambio-climatico',
  'derechos-indigenas',
  'desarrollo-sostenible-y-autodeterminado',
  'chile-indigena',
]

router.get('/', async (req, res) => {
  try {
    const data = await cached(homepageCache, 'homepage-data', async () => {
      // Fetch issues, stories, and active cases in parallel
      const [issues, storyData, activeCases] = await Promise.all([
        issueService.getPublicIssues(),
        storyService.getHomepageData(HOMEPAGE_ISSUE_SLUGS, 7),
        prisma.ongoingCase.findMany({
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, slug: true, description: true, imageUrl: true, keywords: true },
        }),
      ])

      // Count matching stories for each case
      const casesWithCounts = await Promise.all(
        activeCases.map(async (c) => {
          const keywordConditions = c.keywords.flatMap((kw) => [
            { title:   { contains: kw, mode: 'insensitive' as const } },
            { summary: { contains: kw, mode: 'insensitive' as const } },
          ])
          const storyCount = c.keywords.length === 0 ? 0 : await prisma.story.count({
            where: { status: 'published', slug: { not: null }, OR: keywordConditions },
          })
          return { ...c, storyCount }
        })
      )

      return {
        issues,
        storiesByIssue: storyData.storiesByIssue,
        activeCases: casesWithCounts,
      }
    })

    res.set('Cache-Control', 'public, max-age=60')
    res.json(data)
  } catch (err) {
    log.error({ err }, 'failed to fetch homepage data')
    res.status(500).json({ error: 'Failed to fetch homepage data' })
  }
})

export default router
