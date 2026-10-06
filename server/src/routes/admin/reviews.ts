import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import { config } from '../../config.js'
import { requireRole } from '../../middleware/auth.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import {
  decideReviewSchema,
  bulkDecideReviewSchema,
  setReviewModeSchema,
  reviewListQuerySchema,
  modePreviewQuerySchema,
} from '../../schemas/communityReview.js'
import { communitiesUnderReview, communityReviewStats } from '../../services/communityReview.js'
import {
  ReviewError,
  decideReview,
  decideReviews,
  findReviewCommunity,
  listReviews,
  previewMode,
  setReviewMode,
  statsFor,
  BULK_RELEASE_MAX_SCORE,
} from '../../services/communityReviewDecisions.js'

const router = Router()
const log = createLogger('admin:reviews')

/**
 * /api/admin/reviews — el editor de la retencion por vertical (D4, Tanda B).
 * Admin y editor deciden sobre notas; SOLO admin cambia el modo.
 */

function responder(res: import('express').Response, err: unknown, fallback: string): void {
  if (err instanceof ReviewError) {
    res.status(err.status).json({ error: err.message, ...(err.details ?? {}) })
    return
  }
  log.error({ err }, fallback)
  res.status(500).json({ error: fallback })
}

async function vertical(slug: string, res: import('express').Response) {
  const c = await findReviewCommunity(slug)
  if (!c) res.status(404).json({ error: 'Community not found' })
  return c
}

/** GET / — las verticales en revision (modo distinto de off) con sus contadores. */
router.get('/', async (_req, res) => {
  try {
    const comunidades = await communitiesUnderReview()
    const data = await Promise.all(
      comunidades.map(async (c) => ({ slug: c.slug, mode: c.mode, stats: await communityReviewStats(c, c.mode) })),
    )
    res.json({ learningMode: config.gate.learningMode, bulkReleaseMaxScore: BULK_RELEASE_MAX_SCORE, data })
  } catch (err) {
    responder(res, err, 'Failed to list verticals under review')
  }
})

/** GET /:slug/stats — «hoy se ven N · si aplicaras, se verian M» y la cuenta por estado. */
router.get('/:slug/stats', async (req, res) => {
  try {
    const c = await vertical(req.params.slug, res)
    if (!c) return
    res.json({ slug: c.slug, name: c.name, ...(await statsFor(c)) })
  } catch (err) {
    responder(res, err, 'Failed to load review stats')
  }
})

/** GET /:slug/mode-preview?mode=enforce — cuantas notas se ocultarian, antes de tocar nada. */
router.get('/:slug/mode-preview', validateQuery(modePreviewQuerySchema), async (req, res) => {
  try {
    const c = await vertical(req.params.slug, res)
    if (!c) return
    const { mode } = req.parsedQuery as { mode: 'off' | 'shadow' | 'enforce' }
    res.json({ slug: c.slug, current: c.mode, ...(await previewMode(c, mode)) })
  } catch (err) {
    responder(res, err, 'Failed to preview review mode')
  }
})

/** PUT /:slug/mode — solo administradores. 409 a enforce con el aprendizaje encendido. */
router.put('/:slug/mode', requireRole('admin'), validateBody(setReviewModeSchema), async (req, res) => {
  try {
    const c = await vertical(req.params.slug, res)
    if (!c) return
    const report = await setReviewMode({ community: c, mode: req.body.mode, actor: req.user! })
    res.json({ slug: c.slug, ...report })
  } catch (err) {
    responder(res, err, 'Failed to change review mode')
  }
})

/** GET /:slug?state=pending&page=1&pageSize=25 — la cola, por puntaje y fecha. */
router.get('/:slug', validateQuery(reviewListQuerySchema), async (req, res) => {
  try {
    const c = await vertical(req.params.slug, res)
    if (!c) return
    const q = req.parsedQuery as { state?: 'auto' | 'pending' | 'released' | 'held'; page: number; pageSize: number }
    const lista = await listReviews({ community: c, state: q.state, page: q.page, pageSize: q.pageSize })
    res.json({ slug: c.slug, mode: c.mode, ...lista })
  } catch (err) {
    responder(res, err, 'Failed to list reviews')
  }
})

/** POST /:slug/decide — { storyId, decision: release|hold|reopen, code?, note? } */
router.post('/:slug/decide', validateBody(decideReviewSchema), async (req, res) => {
  try {
    const c = await vertical(req.params.slug, res)
    if (!c) return
    const row = await decideReview({ community: c, actor: req.user!, ...req.body })
    res.json(row)
  } catch (err) {
    responder(res, err, 'Failed to decide review')
  }
})

/** POST /:slug/bulk-decide — { storyIds[], decision, code?, note? }. Liberar en masa: guardia de puntaje. */
router.post('/:slug/bulk-decide', validateBody(bulkDecideReviewSchema), async (req, res) => {
  try {
    const c = await vertical(req.params.slug, res)
    if (!c) return
    const report = await decideReviews({ community: c, actor: req.user!, ...req.body })
    res.json(report)
  } catch (err) {
    responder(res, err, 'Failed to decide reviews in bulk')
  }
})

export default router
