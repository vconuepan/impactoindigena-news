import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../../config.js'
import { validateBody } from '../../middleware/validate.js'
import * as subscribeService from '../../services/subscribe.js'
import { EmailValidationError, EmailDeliveryError } from '../../services/subscribe.js'
import { createLogger, maskEmail } from '../../lib/logger.js'

const router = Router()
const log = createLogger('public:subscribe')

const subscribeLimiter = rateLimit({
  windowMs: config.subscribe.rateLimitWindowMs,
  max: config.subscribe.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many subscription attempts. Please try again later.' },
})

const subscribeSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  firstName: z.string().max(100).optional(),
  language: z.enum(['es', 'en']).optional(),
})

router.post('/', subscribeLimiter, validateBody(subscribeSchema), async (req, res) => {
  try {
    const { email, firstName, language } = req.body
    await subscribeService.subscribe({ email, firstName, language })
    // Always return success to avoid information leaks
    res.json({ success: true, message: 'Check your email to confirm your subscription.' })
  } catch (err) {
    if (err instanceof EmailValidationError) {
      res.json({ success: false, message: err.message })
      return
    }
    // El fallo de ENTREGA se dice. No filtra nada sobre la direccion —le pasa
    // igual a cualquiera cuando el proveedor esta caido— y callarlo dejaba a la
    // persona esperando un correo que nunca iba a llegar.
    if (err instanceof EmailDeliveryError) {
      log.error({ err }, 'confirmation email could not be delivered')
      res.status(502).json({
        success: false,
        message: 'No pudimos enviarte el correo de confirmacion. Intentalo de nuevo en unos minutos.',
      })
      return
    }
    log.error({ err }, 'subscribe error')
    // Still return success to avoid leaking whether an email exists
    res.json({ success: true, message: 'Check your email to confirm your subscription.' })
  }
})

// El token es el que genera `subscribe()` (randomUUID) y el correo tiene que
// coincidir con el de la fila: es lo mismo que exigia el GET.
const confirmSchema = z.object({
  token: z.string().uuid(),
  email: z.string().email().max(255),
})

// El enlace del correo NO confirma: solo lleva a /subscribed con el token, y la
// confirmacion es el POST de abajo, que hace un boton de esa pagina. Los filtros
// de correo corporativos (Safe Links y similares) abren los enlaces para
// revisarlos antes que la persona, asi que un GET que cambia estado dejaba
// confirmada la suscripcion de cualquiera a quien un tercero le hubiera escrito
// el correo. Es el mismo patron que /api/alerts/confirm.
router.get('/confirm', (req, res) => {
  const { token, email } = req.query as { token?: unknown; email?: unknown }
  const clientUrl = process.env.CLIENT_URL || 'https://vocesindigenas.org'

  if (typeof token !== 'string' || !token || typeof email !== 'string' || !email) {
    res.redirect(303, `${clientUrl}/subscribed?error=invalid`)
    return
  }

  // URLSearchParams codifica los valores: un correo con `&` o `#` no puede
  // agregar parametros ni cambiar el destino, que siempre es nuestro sitio.
  const destino = new URL('/subscribed', clientUrl)
  destino.searchParams.set('confirm_token', token)
  destino.searchParams.set('email', email)
  res.redirect(303, destino.toString())
})

router.post('/confirm', subscribeLimiter, validateBody(confirmSchema), async (req, res) => {
  const { token, email } = req.body as { token: string; email: string }
  try {
    await subscribeService.confirmSubscription(token, email)
    res.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'Confirmation link has expired' || msg === 'Invalid confirmation link') {
      // Sin distinguir si fallo el token o el correo: no es un oraculo de quien esta suscrito.
      log.warn({ err: msg, email: maskEmail(email) }, 'confirmation failed')
      res.status(400).json({ error: msg === 'Confirmation link has expired' ? 'expired' : 'invalid' })
      return
    }
    log.error({ err: msg, email: maskEmail(email) }, 'confirmation error')
    res.status(500).json({ error: 'Failed to confirm' })
  }
})

export default router
