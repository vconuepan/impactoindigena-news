/**
 * GET /api/public/contrast
 *
 * Returns two parallel story lists for the "Por qué importa" page:
 *   - our: top 8 Voces Indígenas stories from the last 7 days (highest relevance score)
 *   - mainstream: top 8 items from Google News Latinoamérica (Spanish, general)
 *
 * Both lists are cached for 30 minutes. Mainstream fetch fails gracefully —
 * if Google News is unavailable, we return an empty mainstream array instead of a 500.
 */
import { Router } from 'express'
import prisma from '../../lib/prisma.js'
import { TTLCache, cached } from '../../lib/cache.js'
import { createLogger } from '../../lib/logger.js'
import { parseFeed } from '../../services/rssParser.js'

const router = Router()
const log = createLogger('public:contrast')

const TTL = 30 * 60 * 1000 // 30 minutes
const contrastCache = new TTLCache<unknown>(TTL)

// Google News top stories in Spanish — Latinoamérica
const MAINSTREAM_FEED = 'https://news.google.com/rss?hl=es-419&gl=MX&ceid=MX:es-419'

interface MainstreamItem {
  title: string
  url: string
  source: string | null
  datePublished: string | null
}

interface OurItem {
  id: string
  title: string | null
  slug: string | null
  sourceTitle: string
  relevanceScore: number | null
  datePublished: string | null
  issueName: string | null
  issueSlug: string | null
}

interface ContrastResponse {
  our: OurItem[]
  mainstream: MainstreamItem[]
  generatedAt: string
}

router.get('/', async (_req, res) => {
  try {
    const data = await cached(contrastCache, 'contrast', async (): Promise<ContrastResponse> => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      // Our top stories this week — use `relevance` (the final score field)
      const ourStories = await prisma.story.findMany({
        where: {
          status: 'published',
          datePublished: { gte: sevenDaysAgo },
          relevance: { not: null },
        },
        orderBy: { relevance: 'desc' },
        take: 8,
        include: {
          feed: { select: { displayTitle: true, title: true } },
          issue: { select: { name: true, slug: true } },
        },
      })

      const our: OurItem[] = ourStories.map((s) => ({
        id: s.id,
        title: s.title,
        slug: s.slug,
        sourceTitle: s.feed.displayTitle ?? s.feed.title,
        relevanceScore: s.relevance,
        datePublished: s.datePublished?.toISOString() ?? null,
        issueName: s.issue?.name ?? null,
        issueSlug: s.issue?.slug ?? null,
      }))

      // Google News mainstream — fail gracefully
      let mainstream: MainstreamItem[] = []
      try {
        const feed = await parseFeed(MAINSTREAM_FEED)
        mainstream = feed.items.slice(0, 8).map((item) => ({
          title: item.title,
          url: item.url,
          source: null,
          datePublished: item.datePublished,
        }))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn({ err: msg }, 'mainstream feed fetch failed — returning empty array')
      }

      return { our, mainstream, generatedAt: new Date().toISOString() }
    })

    res.setHeader('Cache-Control', 'public, max-age=1800')
    res.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ err: msg }, 'contrast endpoint failed')
    res.status(500).json({ error: 'Failed to generate contrast data' })
  }
})

export default router
