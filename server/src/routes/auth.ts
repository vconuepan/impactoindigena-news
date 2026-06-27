import { Router } from 'express'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireMember } from '../middleware/auth.js'
import { authLimiter, refreshLimiter } from '../middleware/rateLimit.js'
import { loginSchema, changePasswordSchema } from '../schemas/auth.js'
import { getUserByEmail, changePassword } from '../services/user.js'
import {
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  verifyAccessToken,
} from '../services/auth.js'
import { getUserById } from '../services/user.js'
import { createLogger, maskEmail } from '../lib/logger.js'
import prisma from '../lib/prisma.js'
import * as brevo from '../services/brevo.js'

const log = createLogger('auth')

const router = Router()

const REFRESH_COOKIE = 'refresh_token'
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours

function isSecureEnv(): boolean {
  return process.env.NODE_ENV === 'production'
}

function setRefreshCookie(res: any, token: string) {
  // sameSite: 'none' is required because the frontend (impactoindigena.news) and
  // backend (vocesindigenas-backend.onrender.com) are on different origins.
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

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await getUserByEmail(email)
    if (!user || !user.passwordHash) {
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
    const subscription = await prisma.pendingSubscription.findFirst({
      where: { email: req.user!.email, confirmedAt: { not: null } },
    })
    res.json({ subscribed: !!subscription, confirmedAt: subscription?.confirmedAt ?? null })
  } catch (err) {
    log.error({ err }, 'failed to fetch subscription status')
    res.status(500).json({ error: 'Failed to fetch subscription status' })
  }
})

/**
 * DELETE /api/auth/subscription
 * Cancels the newsletter subscription for the authenticated user.
 * Removes them from Brevo list 2 and deletes the PendingSubscription record.
 */
router.delete('/subscription', requireMember, async (req, res) => {
  try {
    const subscription = await prisma.pendingSubscription.findFirst({
      where: { email: req.user!.email, confirmedAt: { not: null } },
    })
    if (!subscription) {
      res.status(404).json({ error: 'No active subscription found' })
      return
    }

    if (subscription.plunkContactId) {
      try {
        await brevo.updateContact(subscription.plunkContactId, { subscribed: false })
      } catch (err) {
        log.warn({ err, email: maskEmail(req.user!.email) }, 'failed to update Brevo contact on unsubscribe, deleting record anyway')
      }
    }

    await prisma.pendingSubscription.delete({ where: { id: subscription.id } })
    log.info({ email: maskEmail(req.user!.email) }, 'subscription cancelled')
    res.json({ success: true })
  } catch (err) {
    log.error({ err }, 'failed to cancel subscription')
    res.status(500).json({ error: 'Failed to cancel subscription' })
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
