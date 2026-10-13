import { Router } from 'express'
import { z } from 'zod'
import { createLogger } from '../../lib/logger.js'
import { config } from '../../config.js'
import { requireRole } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { BrandError, cambiarModoDeMarca, elegidasDeMarca, panelDeMarca, panelesDeMarca } from '../../services/brandAdmin.js'
import { invalidarFeedComunidad } from '../public/feed.js'

const router = Router()
const log = createLogger('admin:brand')

/**
 * /api/admin/brand — «Criterio por marca» (D5, entrega 2, ítem 11). Admin y
 * editor leen; SOLO admin cambia el modo.
 */

const modo = z.enum(['off', 'shadow', 'enforce'])
const cambiarModoSchema = z
  .object({ mode: modo.optional(), rescueMode: modo.optional() })
  .refine((b) => b.mode !== undefined || b.rescueMode !== undefined, { message: 'mode o rescueMode' })

function responder(res: import('express').Response, err: unknown, fallback: string): void {
  if (err instanceof BrandError) {
    res.status(err.status).json({ error: err.message, ...(err.details ?? {}) })
    return
  }
  log.error({ err }, fallback)
  res.status(500).json({ error: fallback })
}

/** GET / — cada marca con su estado, lo de hoy y la vista previa «si encendieras». */
router.get('/', async (_req, res) => {
  try {
    res.json({ learningMode: config.gate.learningMode, enabled: config.brandLane.enabled, data: await panelesDeMarca() })
  } catch (err) {
    responder(res, err, 'Failed to list brand criteria')
  }
})

/** GET /:slug/elegidas — lo elegido por la marca en los últimos 7 días. */
router.get('/:slug/elegidas', async (req, res) => {
  try {
    const p = await panelDeMarca(req.params.slug)
    if (!p) {
      res.status(404).json({ error: 'Esta vertical no tiene criterio de marca' })
      return
    }
    res.json({ slug: p.slug, data: await elegidasDeMarca(p.communityId) })
  } catch (err) {
    responder(res, err, 'Failed to list brand selections')
  }
})

/** PUT /:slug/mode — { mode?, rescueMode? }. Solo administradores. Saca de la caché el RSS de la vertical. */
router.put('/:slug/mode', requireRole('admin'), validateBody(cambiarModoSchema), async (req, res) => {
  try {
    const r = await cambiarModoDeMarca({ slug: req.params.slug, mode: req.body.mode, rescueMode: req.body.rescueMode, actor: req.user! })
    invalidarFeedComunidad(req.params.slug)
    res.json({ slug: req.params.slug, ...r })
  } catch (err) {
    responder(res, err, 'Failed to change brand mode')
  }
})

export default router
