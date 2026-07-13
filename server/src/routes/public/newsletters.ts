/**
 * GET /api/public/newsletters        — list of published newsletters (archive)
 * GET /api/public/newsletters/:id    — single newsletter detail with HTML
 *
 * Newsletters are published weekly. This endpoint makes the archive
 * publicly accessible for the /archivo web page.
 */
import { Router } from 'express'
import prisma from '../../lib/prisma.js'
import { TTLCache, cached } from '../../lib/cache.js'
import { createLogger } from '../../lib/logger.js'

const router = Router()
const log = createLogger('public:newsletters')

const LIST_TTL  = 10 * 60 * 1000  // 10 minutes
const listCache = new TTLCache<unknown>(LIST_TTL)

interface NewsletterListItem {
  id: string
  title: string
  storyCount: number
  sentAt: string | null
}

interface NewsletterDetail {
  id: string
  title: string
  html: string
  sentAt: string | null
  storyCount: number
}

// List published newsletters, sorted by send date desc
router.get('/', async (_req, res) => {
  try {
    const data = await cached(listCache, 'archive', async (): Promise<NewsletterListItem[]> => {
      const newsletters = await prisma.newsletter.findMany({
        where: {
          status: 'published',
          // Exclude specialty/private newsletters — show only main "Impacto Indígena" editions
          title: { not: { startsWith: '[' } },
        },
        select: {
          id: true,
          title: true,
          selectedStoryIds: true,
          sends: {
            where: { isTest: false, status: 'sent' },
            select: { sentAt: true },
            orderBy: { sentAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 52, // up to one year of weekly newsletters
      })

      return newsletters.map((n) => ({
        id: n.id,
        title: n.title,
        storyCount: n.selectedStoryIds.length,
        sentAt: n.sends[0]?.sentAt?.toISOString() ?? null,
      }))
    })

    res.setHeader('Cache-Control', 'public, max-age=600')
    res.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ err: msg }, 'failed to list newsletters')
    res.status(500).json({ error: 'Failed to list newsletters' })
  }
})

// Single newsletter detail
router.get('/:id', async (req, res) => {
  try {
    const newsletter = await prisma.newsletter.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        title: true,
        html: true,
        status: true,
        selectedStoryIds: true,
        sends: {
          where: { isTest: false, status: 'sent' },
          select: { sentAt: true },
          orderBy: { sentAt: 'desc' },
          take: 1,
        },
      },
    })

    // Specialty/private editions are prefixed with '[' and excluded from the
    // public archive — the detail endpoint must hide them too, not just the list.
    if (!newsletter || newsletter.status !== 'published' || newsletter.title.startsWith('[')) {
      res.status(404).json({ error: 'Newsletter not found' })
      return
    }

    const result: NewsletterDetail = {
      id: newsletter.id,
      title: newsletter.title,
      html: newsletter.html,
      sentAt: newsletter.sends[0]?.sentAt?.toISOString() ?? null,
      storyCount: newsletter.selectedStoryIds.length,
    }

    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ err: msg }, 'failed to get newsletter')
    res.status(500).json({ error: 'Failed to get newsletter' })
  }
})

export default router
