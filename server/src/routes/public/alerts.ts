/**
 * Alert subscription routes
 * POST /api/alerts/subscribe   — opt-in to topic alerts
 * GET  /api/alerts/confirm     — the email link: only REDIRECTS to /alertas
 * POST /api/alerts/confirm     — the confirmation itself, from the site's button
 * POST /api/alerts/unsubscribe — deactivate alerts
 */
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { validateBody } from '../../middleware/validate.js'
import * as alertsService from '../../services/alerts.js'
import { createLogger, maskEmail } from '../../lib/logger.js'

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

// Token Y correo: el token prueba que el enlace llego a esa bandeja, y el correo
// tiene que coincidir con el de la fila. Es lo mismo que exigia el GET.
const confirmSchema = z.object({
  token: z.string().uuid(),
  email: z.string().email().max(255),
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

/**
 * El enlace del correo. NO confirma: solo lleva a /alertas con el token, donde un
 * boton hace el POST de abajo.
 *
 * Hasta el 11-oct-2026 este GET confirmaba al abrirse. Los filtros de correo
 * corporativos (Safe Links y similares) abren los enlaces para revisarlos antes
 * que la persona, asi que un pedido de cambio de temas hecho por un tercero
 * quedaba aplicado sin que la titular hiciera nada: justo lo que la doble
 * confirmacion venia a impedir. Un GET no debe cambiar estado; abrir el enlace
 * ahora es inocuo. Los correos ya enviados apuntan aqui y siguen funcionando.
 */
router.get('/confirm', (req, res) => {
  const { token, email } = req.query as { token?: unknown; email?: unknown }
  const clientUrl = process.env.CLIENT_URL || 'https://vocesindigenas.org'

  if (typeof token !== 'string' || !token || typeof email !== 'string' || !email) {
    res.redirect(303, `${clientUrl}/alertas?confirmed=invalid`)
    return
  }

  // URLSearchParams codifica los valores: un correo con `&` o `#` no puede
  // agregar parametros ni cambiar el destino, que siempre es nuestro sitio.
  const destino = new URL('/alertas', clientUrl)
  destino.searchParams.set('confirm_token', token)
  destino.searchParams.set('email', email)
  res.redirect(303, destino.toString())
})

router.post('/confirm', alertLimiter, validateBody(confirmSchema), async (req, res) => {
  const { token, email } = req.body as { token: string; email: string }
  try {
    const result = await alertsService.confirmAlert(token, email)
    res.json({ success: true, result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'Confirmation link has expired' || msg === 'Invalid confirmation link') {
      // Sin distinguir si fallo el token o el correo: no es un oraculo de quien esta suscrito.
      log.warn({ err: msg, email: maskEmail(email) }, 'alert confirmation failed')
      res.status(400).json({ error: msg === 'Confirmation link has expired' ? 'expired' : 'invalid' })
      return
    }
    log.error({ err: msg, email: maskEmail(email) }, 'alert confirmation error')
    res.status(500).json({ error: 'Failed to confirm' })
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
