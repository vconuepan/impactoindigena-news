import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import { expensiveOpLimiter } from '../../middleware/rateLimit.js'
import * as twitterService from '../../services/twitter.js'
import {
  generateTwitterDraftBodySchema,
  updateTwitterDraftBodySchema,
  listTwitterPostsQuerySchema,
} from '../../schemas/twitter.js'

const router = Router()
const log = createLogger('twitter-routes')

// List posts (paginated, filterable by status)
router.get('/posts', validateQuery(listTwitterPostsQuerySchema), async (req, res) => {
  try {
    const result = await twitterService.listPosts(req.parsedQuery || {})
    res.json(result)
  } catch (err) {
    log.error({ err }, 'failed to list Twitter posts')
    res.status(500).json({ error: 'Failed to list posts' })
  }
})

// Get single post
router.get('/posts/:id', async (req, res) => {
  try {
    const post = await twitterService.getPostById(req.params.id)
    if (!post) {
      res.status(404).json({ error: 'Post not found' })
      return
    }
    res.json(post)
  } catch (err) {
    log.error({ err }, 'failed to get Twitter post')
    res.status(500).json({ error: 'Failed to get post' })
  }
})

// Generate draft from a single story
router.post('/posts/generate', expensiveOpLimiter, validateBody(generateTwitterDraftBodySchema), async (req, res) => {
  try {
    const post = await twitterService.generateDraft(req.body.storyId)
    res.status(201).json(post)
  } catch (err: any) {
    if (err.message === 'Story not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err.message?.includes('must be fully analyzed') || err.message === 'Story already has a Twitter post') {
      res.status(400).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to generate Twitter draft')
    res.status(500).json({ error: 'Failed to generate draft' })
  }
})

// Update draft text
router.put('/posts/:id', validateBody(updateTwitterDraftBodySchema), async (req, res) => {
  try {
    const post = await twitterService.updateDraft(req.params.id, req.body.postText)
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
    log.error({ err }, 'failed to update Twitter draft')
    res.status(500).json({ error: 'Failed to update draft' })
  }
})

// Publish draft to Twitter
router.post('/posts/:id/publish', expensiveOpLimiter, async (req, res) => {
  try {
    const post = await twitterService.publishPost(req.params.id)
    res.json(post)
  } catch (err: any) {
    if (err.message === 'Post not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err.message === 'Can only publish draft posts' || err.message === 'Twitter credentials not configured') {
      res.status(400).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to publish tweet')
    res.status(500).json({ error: 'Failed to publish post' })
  }
})

// Delete post record (the tweet itself stays up)
router.delete('/posts/:id', async (req, res) => {
  try {
    await twitterService.deletePostRecord(req.params.id)
    res.status(204).send()
  } catch (err: any) {
    if (err.message === 'Post not found') {
      res.status(404).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to delete Twitter post')
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

// Manually trigger metrics refresh
router.post('/metrics/refresh', expensiveOpLimiter, async (_req, res) => {
  try {
    await twitterService.updateMetrics()
    res.json({ success: true })
  } catch (err) {
    log.error({ err }, 'failed to refresh Twitter metrics')
    res.status(500).json({ error: 'Failed to refresh metrics' })
  }
})

export default router
