import { Router } from 'express'
import { config } from '../../config.js'
import { createLogger } from '../../lib/logger.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import { expensiveOpLimiter } from '../../middleware/rateLimit.js'
import * as linkedinService from '../../services/linkedin.js'
import {
  buildAuthorizationUrl,
  introspectToken,
  isLinkedInConfigured,
  isLinkedInOAuthConfigured,
} from '../../lib/linkedin.js'
import { createOAuthState } from '../../lib/linkedinOAuthState.js'
import {
  generateLinkedInDraftBodySchema,
  updateLinkedInDraftBodySchema,
  listLinkedInPostsQuerySchema,
} from '../../schemas/linkedin.js'

const router = Router()
const log = createLogger('linkedin-routes')

// List posts (paginated, filterable by status)
router.get('/posts', validateQuery(listLinkedInPostsQuerySchema), async (req, res) => {
  try {
    const result = await linkedinService.listPosts(req.parsedQuery || {})
    res.json(result)
  } catch (err) {
    log.error({ err }, 'failed to list LinkedIn posts')
    res.status(500).json({ error: 'Failed to list posts' })
  }
})

// Get single post
router.get('/posts/:id', async (req, res) => {
  try {
    const post = await linkedinService.getPostById(req.params.id)
    if (!post) {
      res.status(404).json({ error: 'Post not found' })
      return
    }
    res.json(post)
  } catch (err) {
    log.error({ err }, 'failed to get LinkedIn post')
    res.status(500).json({ error: 'Failed to get post' })
  }
})

// Generate draft from a story
router.post('/posts/generate', expensiveOpLimiter, validateBody(generateLinkedInDraftBodySchema), async (req, res) => {
  try {
    const post = await linkedinService.generateDraft(req.body.storyId)
    res.status(201).json(post)
  } catch (err: any) {
    if (err.message === 'Story not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err.message?.includes('must be fully analyzed') || err.message === 'Story already has a LinkedIn post') {
      res.status(400).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to generate LinkedIn draft')
    res.status(500).json({ error: 'Failed to generate draft' })
  }
})

// Update draft postText
router.put('/posts/:id', validateBody(updateLinkedInDraftBodySchema), async (req, res) => {
  try {
    const post = await linkedinService.updateDraft(req.params.id, req.body.postText)
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
    log.error({ err }, 'failed to update LinkedIn draft')
    res.status(500).json({ error: 'Failed to update draft' })
  }
})

// Publish draft to LinkedIn
router.post('/posts/:id/publish', expensiveOpLimiter, async (req, res) => {
  try {
    const post = await linkedinService.publishPost(req.params.id)
    res.json(post)
  } catch (err: any) {
    if (err.message === 'Post not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err.message === 'Can only publish draft posts' || err.message === 'LinkedIn credentials not configured') {
      res.status(400).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to publish LinkedIn post')
    res.status(500).json({ error: 'Failed to publish post' })
  }
})

// Delete post record (DB only)
router.delete('/posts/:id', async (req, res) => {
  try {
    await linkedinService.deletePostRecord(req.params.id)
    res.status(204).send()
  } catch (err: any) {
    if (err.message === 'Post not found') {
      res.status(404).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to delete LinkedIn post')
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

// Manually trigger metrics refresh
router.post('/metrics/refresh', expensiveOpLimiter, async (_req, res) => {
  try {
    await linkedinService.updateMetrics()
    res.json({ success: true })
  } catch (err) {
    log.error({ err }, 'failed to refresh LinkedIn metrics')
    res.status(500).json({ error: 'Failed to refresh metrics' })
  }
})

// ---------------------------------------------------------------------------
// Token — estado y reautorización
// ---------------------------------------------------------------------------

/**
 * Estado del token según LinkedIn. Nunca devuelve el token, solo su salud:
 * si está activo, cuándo expira y con qué permisos.
 */
router.get('/token/status', async (_req, res) => {
  if (!isLinkedInConfigured()) {
    res.json({ configured: false, canReauthorize: isLinkedInOAuthConfigured() })
    return
  }

  if (!isLinkedInOAuthConfigured()) {
    // Sin credenciales de app no se puede introspeccionar ni reautorizar.
    res.json({
      configured: true,
      canReauthorize: false,
      error: 'LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET not configured',
    })
    return
  }

  try {
    const status = await introspectToken()
    res.json({
      configured: true,
      canReauthorize: true,
      active: status.active,
      status: status.status,
      expiresAt: status.expiresAt,
      daysLeft: status.daysLeft,
      scopes: status.scopes,
      authType: status.authType,
      source: status.source,
      warnThresholdDays: config.linkedin.tokenCheck.thresholdDays,
    })
  } catch (err) {
    log.error({ err }, 'failed to introspect LinkedIn token')
    res.status(502).json({ error: 'Failed to check token status' })
  }
})

/**
 * Devuelve la URL a la que hay que mandar al admin para reautorizar.
 *
 * No redirige desde acá: la llamada viene por fetch con el JWT en el header, y
 * un redirect en esa respuesta no navegaría la pestaña. El cliente recibe la URL
 * y navega él.
 */
router.post('/token/authorize', expensiveOpLimiter, async (_req, res) => {
  if (!isLinkedInOAuthConfigured()) {
    res.status(400).json({ error: 'LinkedIn app credentials not configured' })
    return
  }

  try {
    const url = buildAuthorizationUrl(createOAuthState())
    res.json({ url })
  } catch (err) {
    log.error({ err }, 'failed to build LinkedIn authorization URL')
    res.status(500).json({ error: 'Failed to start authorization' })
  }
})

export default router
