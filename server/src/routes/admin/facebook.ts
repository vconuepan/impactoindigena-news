import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import { expensiveOpLimiter } from '../../middleware/rateLimit.js'
import * as facebookService from '../../services/facebook.js'
import { introspectToken, isFacebookAppConfigured, isFacebookConfigured } from '../../lib/facebook.js'
import {
  generateFacebookDraftBodySchema,
  updateFacebookDraftBodySchema,
  listFacebookPostsQuerySchema,
} from '../../schemas/facebook.js'

const router = Router()
const log = createLogger('facebook-routes')

// Token health for the admin card. Never throws on a dead token: the card has to
// be able to render precisely when the token is broken.
router.get('/token/status', async (_req, res) => {
  if (!isFacebookConfigured()) {
    res.json({ configured: false, appConfigured: isFacebookAppConfigured() })
    return
  }
  if (!isFacebookAppConfigured()) {
    res.json({ configured: true, appConfigured: false })
    return
  }

  try {
    const status = await introspectToken()
    res.json({
      configured: true,
      appConfigured: true,
      isValid: status.isValid,
      expiresAt: status.expiresAt,
      daysLeft: status.daysLeft,
      neverExpires: status.expiresAt === null,
      scopes: status.scopes,
      source: status.source,
    })
  } catch (err) {
    log.warn({ err }, 'Facebook token introspection failed')
    res.json({
      configured: true,
      appConfigured: true,
      isValid: false,
      error: err instanceof Error ? err.message : 'Introspection failed',
    })
  }
})

// List posts (paginated, filterable by status)
router.get('/posts', validateQuery(listFacebookPostsQuerySchema), async (req, res) => {
  try {
    const result = await facebookService.listPosts(req.parsedQuery || {})
    res.json(result)
  } catch (err) {
    log.error({ err }, 'failed to list Facebook posts')
    res.status(500).json({ error: 'Failed to list posts' })
  }
})

// Get single post
router.get('/posts/:id', async (req, res) => {
  try {
    const post = await facebookService.getPostById(req.params.id)
    if (!post) {
      res.status(404).json({ error: 'Post not found' })
      return
    }
    res.json(post)
  } catch (err) {
    log.error({ err }, 'failed to get Facebook post')
    res.status(500).json({ error: 'Failed to get post' })
  }
})

// Generate draft from a single story
router.post('/posts/generate', expensiveOpLimiter, validateBody(generateFacebookDraftBodySchema), async (req, res) => {
  try {
    const post = await facebookService.generateDraft(req.body.storyId)
    res.status(201).json(post)
  } catch (err: any) {
    if (err.message === 'Story not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err.message?.includes('must be fully analyzed') || err.message === 'Story already has a Facebook post') {
      res.status(400).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to generate Facebook draft')
    res.status(500).json({ error: 'Failed to generate draft' })
  }
})

// Update draft text
router.put('/posts/:id', validateBody(updateFacebookDraftBodySchema), async (req, res) => {
  try {
    const post = await facebookService.updateDraft(req.params.id, req.body.postText)
    res.json(post)
  } catch (err: any) {
    if (err.message === 'Post not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err.message === 'Can only edit draft posts') {
      res.status(400).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to update Facebook draft')
    res.status(500).json({ error: 'Failed to update draft' })
  }
})

// Publish to the Page
router.post('/posts/:id/publish', expensiveOpLimiter, async (req, res) => {
  try {
    const post = await facebookService.publishPost(req.params.id)
    res.json(post)
  } catch (err: any) {
    if (err.message === 'Post not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err.message === 'Can only publish draft posts' || err.message === 'Facebook credentials not configured') {
      res.status(400).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to publish Facebook post')
    res.status(500).json({ error: 'Failed to publish post' })
  }
})

// Delete the record (the Page post stays up)
router.delete('/posts/:id', async (req, res) => {
  try {
    await facebookService.deletePostRecord(req.params.id)
    res.status(204).send()
  } catch (err: any) {
    if (err.message === 'Post not found') {
      res.status(404).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to delete Facebook post')
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

// Manually trigger metrics refresh
router.post('/metrics/refresh', expensiveOpLimiter, async (_req, res) => {
  try {
    await facebookService.updateMetrics()
    res.json({ success: true })
  } catch (err) {
    log.error({ err }, 'failed to refresh Facebook metrics')
    res.status(500).json({ error: 'Failed to refresh metrics' })
  }
})

export default router
