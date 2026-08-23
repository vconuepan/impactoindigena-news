import { Router } from 'express'
import { createLogger } from '../lib/logger.js'
import { exchangeCodeForToken } from '../lib/linkedin.js'
import { verifyOAuthState } from '../lib/linkedinOAuthState.js'
import { authLimiter } from '../middleware/rateLimit.js'

const router = Router()
const log = createLogger('linkedin-oauth')

const ADMIN_LINKEDIN_URL = 'https://vocesindigenas.org/admin/linkedin'

/**
 * Callback del flujo OAuth de LinkedIn.
 *
 * Es una ruta PÚBLICA por necesidad: el navegador llega acá por el redirect de
 * LinkedIn, sin el header `Authorization` que exigen las rutas de admin (la
 * sesión es un JWT Bearer, no una cookie). Lo que la protege es el `state`
 * firmado, que solo se emite a un admin autenticado — sin eso, cualquiera
 * podría canjear un código propio y dejar el sitio publicando en su cuenta.
 *
 * Termina siempre en un redirect al panel, con el resultado en la query, porque
 * quien está mirando es una persona en un navegador y no un cliente de API.
 */
router.get('/oauth/callback', authLimiter, async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query

  // El miembro canceló o LinkedIn rechazó la autorización.
  if (error) {
    log.warn({ error, errorDescription }, 'LinkedIn authorization denied')
    res.redirect(`${ADMIN_LINKEDIN_URL}?auth=denied`)
    return
  }

  if (!verifyOAuthState(typeof state === 'string' ? state : undefined)) {
    // Puede ser un state vencido (el admin dejó la pestaña abierta) o un intento
    // de secuestro. No se distinguen desde acá y no conviene decir cuál es.
    log.warn('LinkedIn OAuth callback with invalid or expired state')
    res.redirect(`${ADMIN_LINKEDIN_URL}?auth=invalid_state`)
    return
  }

  if (typeof code !== 'string' || !code) {
    res.redirect(`${ADMIN_LINKEDIN_URL}?auth=missing_code`)
    return
  }

  try {
    const result = await exchangeCodeForToken(code)
    log.info(
      { expiresAt: result.expiresAt, daysLeft: result.daysLeft, hasRefreshToken: result.hasRefreshToken },
      'LinkedIn token reauthorized',
    )
    res.redirect(`${ADMIN_LINKEDIN_URL}?auth=ok&days=${result.daysLeft}`)
  } catch (err) {
    log.error({ err }, 'LinkedIn token exchange failed')
    res.redirect(`${ADMIN_LINKEDIN_URL}?auth=exchange_failed`)
  }
})

export default router
