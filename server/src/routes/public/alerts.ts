/**
 * Alert subscription routes
 * POST /api/alerts/subscribe   — opt-in to topic alerts
 * GET  /api/alerts/confirm     — confirm via email token
 * POST /api/alerts/unsubscribe — deactivate alerts
 */
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { validateBody } from '../../middleware/validate.js'
import * as alertsService from '../../services/alerts.js'
import { createLogger } from '../../lib/logger.js'

const router = Router()
const log    = createLogger('public:alerts')

const alertLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many attempts. Please try again later.' },
})

const subscribeSchema = z.object({
  email:  z.string().email().max(255),
  topics: z.array(z.string().min(1).max(100)).min(1).max(20),
})

// SOLO token. Hasta el 8-sep-2026 esto aceptaba tambien un correo suelto, de
// modo que cualquiera que conociera una direccion podia dar de baja a esa
// persona —y el endpoint no tenia limitador—. El token es la prueba de posesion:
// llega en el correo de su titular y nadie mas lo tiene.
const unsubscribeSchema = z.object({
  token: z.string().uuid(),
})

router.post('/subscribe', alertLimiter, validateBody(subscribeSchema), async (req, res) => {
  try {
    await alertsService.subscribeToAlerts(req.body.email, req.body.topics)
    res.json({ success: true, message: 'Check your email to confirm your alerts.' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'At least one topic required') {
      res.status(400).json({ error: msg })
      return
    }
    log.error({ err: msg }, 'alert subscribe error')
    res.json({ success: true, message: 'Check your email to confirm your alerts.' })
  }
})

router.get('/confirm', async (req, res) => {
  const { token, email } = req.query as { token?: string; email?: string }
  const clientUrl = process.env.CLIENT_URL || 'https://vocesindigenas.org'

  if (!token || !email) {
    res.redirect(`${clientUrl}/alertas?confirmed=error`)
    return
  }

  try {
    await alertsService.confirmAlert(token, email)
    res.redirect(`${clientUrl}/alertas?confirmed=true`)
  } catch (err: any) {
    log.warn({ err: err?.message, email }, 'alert confirmation failed')
    const reason = err?.message === 'Confirmation link has expired' ? 'expired' : 'invalid'
    res.redirect(`${clientUrl}/alertas?confirmed=${reason}`)
  }
})

router.post('/unsubscribe', alertLimiter, validateBody(unsubscribeSchema), async (req, res) => {
  try {
    // Idempotent: an unknown or already-used token still answers success —
    // no oracle for probing tokens, and double-clicks just work.
    await alertsService.unsubscribeByToken(req.body.token)
    res.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ err: msg }, 'alert unsubscribe error')
    res.status(500).json({ error: 'Failed to unsubscribe' })
  }
})

export default router
