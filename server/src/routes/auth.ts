import { Router } from 'express'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireMember } from '../middleware/auth.js'
import { authLimiter, accountAuthLimiter, refreshLimiter } from '../middleware/rateLimit.js'
import { loginSchema, changePasswordSchema } from '../schemas/auth.js'
import { getUserByEmail, changePassword } from '../services/user.js'
import {
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  verifyAccessToken,
  DUMMY_PASSWORD_HASH,
} from '../services/auth.js'
import { getUserById } from '../services/user.js'
import { isTrustedOrigin } from '../lib/allowedOrigins.js'
import { createLogger, maskEmail } from '../lib/logger.js'
import prisma from '../lib/prisma.js'
import {
  borrarDelBoletin,
  suprimirPorCorreo,
  correoDeLaCuenta,
  suscripcionesConfirmadas,
  normalizarCorreo,
  candidatas,
  esDe,
  BrevoNoRespondeError,
} from '../services/supresion.js'
import { writeAuditLog, actorTitular } from '../services/audit.js'

const log = createLogger('auth')

const router = Router()

const REFRESH_COOKIE = 'refresh_token'
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours

function isSecureEnv(): boolean {
  return process.env.NODE_ENV === 'production'
}

function setRefreshCookie(res: any, token: string) {
  // sameSite: 'none' is required because the frontend (vocesindigenas.org) and
  // backend (the Azure App Service) are on different origins.
  // CSRF risk is mitigated by: (1) restrictive CORS allowing only FRONTEND_URL,
  // (2) cookie scoped to path '/api/auth' only, (3) access token kept in memory.
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isSecureEnv(),
    sameSite: isSecureEnv() ? 'none' as const : 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/api/auth',
  })
}

function clearRefreshCookie(res: any) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isSecureEnv(),
    sameSite: isSecureEnv() ? 'none' as const : 'lax' as const,
    path: '/api/auth',
  })
}

router.post('/login', authLimiter, accountAuthLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await getUserByEmail(email)
    if (!user || !user.passwordHash) {
      // Run a dummy comparison so response timing matches the wrong-password
      // path, preventing user enumeration via latency.
      await verifyPassword(password, DUMMY_PASSWORD_HASH)
      log.warn({ email: maskEmail(email) }, 'login failed: user not found')
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      log.warn({ email: maskEmail(email) }, 'login failed: wrong password')
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const accessToken = generateAccessToken(user)
    const refreshToken = await generateRefreshToken(user.id)

    setRefreshCookie(res, refreshToken)
    res.json({
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: (user.userType ?? 'viewer').toLowerCase() as string },
    })
  } catch (err) {
    log.error({ err }, 'login failed')
    res.status(500).json({ error: 'Login failed' })
  }
})

router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE]
    if (!token) {
      res.status(401).json({ error: 'No refresh token' })
      return
    }

    // CSRF defense: the refresh cookie is sent cross-site (sameSite:none), so
    // require a trusted Origin/Referer on this state-changing request. Do NOT
    // clear the cookie here — that would let a forged request log the user out.
    if (!isTrustedOrigin(req)) {
      res.status(403).json({ error: 'Invalid request origin' })
      return
    }

    const result = await rotateRefreshToken(token)
    setRefreshCookie(res, result.refreshToken)
    res.json({ accessToken: result.accessToken })
  } catch (err) {
    clearRefreshCookie(res)
    if (err instanceof Error && (err.message === 'Invalid refresh token' || err.message === 'Refresh token expired' || err.message === 'Refresh token reuse detected')) {
      res.status(401).json({ error: err.message })
      return
    }
    log.error({ err }, 'token refresh failed')
    res.status(500).json({ error: 'Token refresh failed' })
  }
})

router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE]
    if (token) {
      await revokeRefreshToken(token)
    }
    clearRefreshCookie(res)
    res.json({ message: 'Logged out' })
  } catch (err) {
    log.error({ err }, 'logout failed')
    clearRefreshCookie(res)
    res.json({ message: 'Logged out' })
  }
})

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization header' })
      return
    }

    const token = authHeader.slice(7)
    const payload = verifyAccessToken(token)
    const user = await getUserById(payload.userId)
    if (!user) {
      res.status(401).json({ error: 'User not found' })
      return
    }

    res.json(user)
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
})

router.get('/memberships', requireAuth, async (req, res) => {
  try {
    const memberships = await prisma.communityMember.findMany({
      where: { userId: req.user!.userId },
      include: {
        community: { select: { id: true, slug: true, name: true, type: true } },
      },
      orderBy: { joinedAt: 'asc' },
    })
    res.json({ communities: memberships.map((m) => m.community) })
  } catch (err) {
    log.error({ err }, 'failed to fetch memberships')
    res.status(500).json({ error: 'Failed to fetch memberships' })
  }
})

router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name } = req.body as { name?: string }
    const trimmed = name?.trim()
    if (!trimmed || trimmed.length < 2 || trimmed.length > 100) {
      res.status(400).json({ error: 'name must be between 2 and 100 characters' })
      return
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { name: trimmed },
    })

    res.json({ name: trimmed })
  } catch (err) {
    log.error({ err }, 'failed to update user profile')
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

/**
 * GET /api/auth/digest-exclusions
 * Returns the list of community IDs the user has opted out of for digests.
 */
router.get('/digest-exclusions', requireMember, async (req, res) => {
  try {
    const exclusions = await prisma.digestExclusion.findMany({
      where: { userId: req.user!.userId },
      select: { communityId: true },
    })
    res.json({ excludedCommunityIds: exclusions.map((e) => e.communityId) })
  } catch (err) {
    log.error({ err }, 'failed to fetch digest exclusions')
    res.status(500).json({ error: 'Failed to fetch preferences' })
  }
})

/**
 * POST /api/auth/digest-exclusions/:communityId
 * Opt out of digest emails for a community.
 */
router.post('/digest-exclusions/:communityId', requireMember, async (req, res) => {
  try {
    const { communityId } = req.params
    await prisma.digestExclusion.upsert({
      where: { userId_communityId: { userId: req.user!.userId, communityId } },
      create: { userId: req.user!.userId, communityId },
      update: {},
    })
    res.json({ success: true })
  } catch (err) {
    log.error({ err }, 'failed to add digest exclusion')
    res.status(500).json({ error: 'Failed to update preferences' })
  }
})

/**
 * DELETE /api/auth/digest-exclusions/:communityId
 * Opt back in to digest emails for a community.
 */
router.delete('/digest-exclusions/:communityId', requireMember, async (req, res) => {
  try {
    const { communityId } = req.params
    await prisma.digestExclusion.deleteMany({
      where: { userId: req.user!.userId, communityId },
    })
    res.json({ success: true })
  } catch (err) {
    log.error({ err }, 'failed to remove digest exclusion')
    res.status(500).json({ error: 'Failed to update preferences' })
  }
})

/**
 * GET /api/auth/subscription
 * Returns the newsletter subscription status for the authenticated user.
 */
router.get('/subscription', requireMember, async (req, res) => {
  try {
    // El correo de la base, no el del token (que puede ser viejo, o de una
    // cuenta ya borrada), y sin mayúsculas: el alta guarda el correo como se
    // escribió.
    const email = await correoDeLaCuenta(req.user!.userId)
    if (!email) {
      res.json({ subscribed: false, confirmedAt: null })
      return
    }
    const [subscription] = await suscripcionesConfirmadas(email)
    res.json({ subscribed: !!subscription, confirmedAt: subscription?.confirmedAt ?? null })
  } catch (err) {
    log.error({ err }, 'failed to fetch subscription status')
    res.status(500).json({ error: 'Failed to fetch subscription status' })
  }
})

/**
 * DELETE /api/auth/subscription
 * Cancels the newsletter subscription for the authenticated user: deletes the
 * Brevo contact and every subscription row for the email.
 */
router.delete('/subscription', requireMember, async (req, res) => {
  try {
    // El correo de la base y sin mayúsculas, como en GET /subscription.
    const email = await correoDeLaCuenta(req.user!.userId)
    if (!email || (await suscripcionesConfirmadas(email)).length === 0) {
      res.status(404).json({ error: 'No active subscription found' })
      return
    }

    // Hasta el 3-nov-2026 esto daba de baja en Brevo solo si la fila tenía id
    // de contacto, y quien había vuelto tras una baja no lo tiene: su fila se
    // borraba y la campaña le seguía llegando. Ahora se borra el contacto (por
    // id y por correo). Si Brevo no responde no se borra nada, y la persona ve
    // un error en vez de una baja que no ocurrió.
    try {
      await borrarDelBoletin(email)
    } catch (err) {
      if (err instanceof BrevoNoRespondeError) {
        res.status(503).json({ error: 'Email provider unavailable, please try again' })
        return
      }
      throw err
    }
    log.info({ email: maskEmail(req.user!.email) }, 'subscription cancelled')
    res.json({ success: true })
  } catch (err) {
    log.error({ err }, 'failed to cancel subscription')
    res.status(500).json({ error: 'Failed to cancel subscription' })
  }
})

/**
 * GET /api/auth/export — data portability/access (Ley 21.719 arts. 5 y 9).
 * Assembles every piece of the authenticated member's personal data into a
 * downloadable JSON. Excludes password hashes and raw tokens.
 */
router.get('/export', requireMember, async (req, res) => {
  try {
    const userId = req.user!.userId
    // Lo que se guarda por correo se busca con el correo que la cuenta tiene
    // HOY, sin mayúsculas y exacto, igual que la supresión: el del token puede
    // ser viejo o de una cuenta ya borrada, y entonces es de otra persona.
    // Así el acceso muestra exactamente lo que el borrado borraría.
    const correo = await correoDeLaCuenta(userId)
    const objetivo = correo ? normalizarCorreo(correo) : null
    const porCorreo = async <T extends { email: string | null }>(buscar: (where: object) => Promise<T[]>) => {
      if (!objetivo) return []
      const filas = (await buscar(candidatas(objetivo))).filter(esDe(objetivo))
      return filas.map(({ email: _email, ...resto }) => resto)
    }

    const [user, memberships, digestExclusions, posts, subscriptions, alerts, feedback] = await Promise.all([
      getUserById(userId),
      prisma.communityMember.findMany({
        where: { userId },
        select: { joinedAt: true, consentedAt: true, consentVersion: true, community: { select: { name: true, slug: true, type: true } } },
      }),
      prisma.digestExclusion.findMany({
        where: { userId },
        select: { createdAt: true, community: { select: { name: true, slug: true } } },
      }),
      prisma.communityPost.findMany({ where: { userId } }),
      // TODAS las filas, no la primera: quien se suscribio mas de una vez (o dejo
      // una pendiente sin confirmar) tiene varias, y el derecho de acceso alcanza
      // a todas. `findFirst` exportaba una sola y callaba el resto.
      porCorreo((where) =>
        prisma.pendingSubscription.findMany({
          where,
          select: { email: true, confirmedAt: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ),
      porCorreo((where) =>
        prisma.alertSubscription.findMany({
          where,
          select: { email: true, topics: true, confirmedAt: true, active: true, createdAt: true },
        }),
      ),
      porCorreo((where) =>
        prisma.feedback.findMany({
          where,
          select: { email: true, category: true, message: true, status: true, createdAt: true },
        }),
      ),
    ])

    const exportData = {
      exportedAt: new Date().toISOString(),
      responsable: 'Fundación KM (vocesindigenas.org)',
      profile: user,
      communityMemberships: memberships,
      digestExclusions,
      communityPosts: posts,
      newsletterSubscriptions: subscriptions,
      topicAlerts: alerts,
      feedback,
    }

    // Mismo caso que el borrado: quien exporta es el titular, y su `userId` ya
    // lo identifica sin necesidad de duplicar el correo en el registro.
    await writeAuditLog({ actor: actorTitular(req.user), action: 'data.export', targetType: 'user', targetId: userId })

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="mis-datos-vocesindigenas.json"')
    res.send(JSON.stringify(exportData, null, 2))
  } catch (err) {
    log.error({ err }, 'failed to export user data')
    res.status(500).json({ error: 'Failed to export data' })
  }
})

/**
 * DELETE /api/auth/account — right to erasure (Ley 21.719 art. 7).
 * Deletes the member's account and all linked personal data. Requires an
 * explicit typed confirmation. Idempotent. Clears session cookies and audits.
 */
router.delete('/account', requireMember, async (req, res) => {
  try {
    if (req.body?.confirm !== 'ELIMINAR') {
      res.status(400).json({ error: 'confirmation_required' })
      return
    }
    const userId = req.user!.userId
    const email = req.user!.email

    // Todo lo que guarda su correo, aquí y en Brevo (services/supresion.ts).
    // El contacto se BORRA, no se da de baja: el derecho de supresión alcanza
    // al encargado, y un contacto «dado de baja» sigue siendo su correo guardado
    // allá. La cuenta va por su id y los datos por el correo que tiene hoy en
    // la base, no por el del token. Si Brevo no responde no se borra nada y la
    // persona ve un error para reintentar: seguir de largo la dejaba en la lista
    // del boletín sin ningún registro con que reintentar.
    let resultado
    try {
      resultado = await suprimirPorCorreo({ correo: email, userId })
    } catch (err) {
      if (err instanceof BrevoNoRespondeError) {
        log.warn({ userId }, 'account deletion postponed: brevo did not respond')
        res.status(503).json({ error: 'Email provider unavailable, please try again' })
        return
      }
      throw err
    }

    // Clear session cookies (mirror auth-public cookie options)
    const secure = process.env.NODE_ENV !== 'development'
    res.clearCookie('member_token', { httpOnly: true, secure, sameSite: 'none', path: '/' })
    res.clearCookie('member_session', { httpOnly: false, secure, sameSite: 'none', path: '/' })
    res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure, sameSite: 'none', path: '/api/auth' })

    // `actorTitular` y no `req.user`: el actor es el propio titular, asi que su
    // correo no entra al registro. Guardarlo aqui dejaba el correo del titular
    // en `audit_log` justo al borrar su cuenta, y como nada purgaba esa tabla
    // era el unico dato suyo que sobrevivia al borrado.
    await writeAuditLog({
      actor: actorTitular(req.user),
      action: 'account.delete',
      targetType: 'user',
      targetId: userId,
      metadata: { ...resultado },
    })
    log.info({ email: maskEmail(email) }, 'member account deleted (self-service)')
    res.json({ success: true })
  } catch (err) {
    log.error({ err }, 'failed to delete account')
    res.status(500).json({ error: 'Failed to delete account' })
  }
})

router.put('/password', requireAuth, validateBody(changePasswordSchema), async (req, res) => {
  try {
    await changePassword(req.user!.userId, req.body.currentPassword, req.body.newPassword)
    res.json({ message: 'Password changed' })
  } catch (err) {
    if (err instanceof Error && err.message === 'Current password is incorrect') {
      res.status(401).json({ error: err.message })
      return
    }
    log.error({ err }, 'password change failed')
    res.status(500).json({ error: 'Password change failed' })
  }
})

export default router
