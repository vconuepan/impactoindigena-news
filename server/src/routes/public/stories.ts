import { Router } from 'express'
import * as storyService from '../../services/story.js'
import { validateQuery } from '../../middleware/validate.js'
import { searchLimiter } from '../../middleware/rateLimit.js'
import { publicStoryQuerySchema } from '../../schemas/story.js'
import { createLogger } from '../../lib/logger.js'
import { config } from '../../config.js'
import { fetchOgImage } from '../../lib/extract-og-image.js'
import prisma from '../../lib/prisma.js'

const router = Router()
const log = createLogger('public:stories')

// Apply stricter rate limit when search triggers OpenAI embedding calls
router.get('/', (req, res, next) => {
  if (req.query.search) return searchLimiter(req, res, next)
  next()
}, validateQuery(publicStoryQuerySchema), async (req, res) => {
  try {
    const query = req.parsedQuery!
    const emotionTags = query.emotionTags
      ? query.emotionTags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : undefined
    const result = await storyService.getPublishedStories({
      page: query.page,
      pageSize: query.pageSize,
      issueSlug: query.issueSlug,
      search: query.search,
      emotionTags,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })
    res.set('Cache-Control', 'public, max-age=60')
    res.json(result)
  } catch (err) {
    log.error({ err }, 'failed to fetch stories')
    res.status(500).json({ error: 'Failed to fetch stories' })
  }
})

router.get('/:slug/cluster', async (req, res) => {
  try {
    const result = await storyService.getClusterMembers(req.params.slug)
    res.set('Cache-Control', 'public, max-age=300')
    res.json(result ?? { sources: [] })
  } catch (err) {
    log.error({ err, slug: req.params.slug }, 'failed to fetch cluster members')
    res.status(500).json({ error: 'Failed to fetch cluster members' })
  }
})

router.get('/:slug/related', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string, 10) || 4, 10))
    const stories = await storyService.getRelatedStories(req.params.slug, limit)
    res.set('Cache-Control', `public, max-age=${config.relatedStories.httpCacheSeconds}`)
    res.json(stories)
  } catch (err) {
    log.error({ err, slug: req.params.slug }, 'failed to fetch related stories')
    res.status(500).json({ error: 'Failed to fetch related stories' })
  }
})

router.get('/:slug', async (req, res) => {
  try {
    const story = await storyService.getPublishedStoryBySlug(req.params.slug)
    if (!story) {
      // Check if this slug belongs to a non-primary cluster member and redirect to primary
      const redirectSlug = await storyService.getClusterRedirectSlug(req.params.slug)
      if (redirectSlug) {
        res.set('Cache-Control', 'public, max-age=300')
        res.redirect(302, `/api/stories/${redirectSlug}`)
        return
      }
      res.status(404).json({ error: 'Story not found' })
      return
    }
    res.set('Cache-Control', 'public, max-age=60')
    res.json(story)

    // Lazy-fill imageUrl in background if missing
    if (!story.imageUrl && story.sourceUrl) {
      setImmediate(async () => {
        try {
          const imageUrl = await fetchOgImage(story.sourceUrl)
          if (imageUrl) {
            await prisma.story.update({ where: { id: story.id }, data: { imageUrl } })
            log.info({ slug: req.params.slug, imageUrl }, 'lazy-filled imageUrl')
          }
        } catch (err) {
          log.warn({ err, slug: req.params.slug }, 'lazy-fill imageUrl failed')
        }
      })
    }
  } catch (err) {
    log.error({ err, slug: req.params.slug }, 'failed to fetch story')
    res.status(500).json({ error: 'Failed to fetch story' })
  }
})

export default router
