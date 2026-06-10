import { Router } from 'express'
import { randomUUID } from 'crypto'
import prisma from '../lib/prisma.js'
import * as brevo from '../services/brevo.js'
import { generateMemberToken } from '../services/auth.js'
import { magicLinkLimiter } from '../middleware/rateLimit.js'
import { createLogger } from '../lib/logger.js'

const router = Router()
const log = createLogger('auth-public')

const CLIENT_URL = process.env.CLIENT_URL || 'https://impactoindigena.news'
const API_URL = process.env.API_URL || 'https://impactoindigena.news'
const MAGIC_LINK_EXPIRY_MINUTES = 10

/** Cookie options for the httpOnly JWT (not readable by JS) */
const MEMBER_TOKEN_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== 'development',
  sameSite: 'none' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
}

/** Cookie options for the readable indicator (email only — not sensitive) */
const MEMBER_EMAIL_COOKIE_OPTS = {
  httpOnly: false,
  secure: process.env.NODE_ENV !== 'development',
  sameSite: 'none' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
}

function magicLinkExpiresAt(): Date {
  return new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000)
}

async function sendMagicLinkEmail(email: string, token: string, redirectTo?: string): Promise<void> {
  const verifyUrl = new URL(`${API_URL}/api/auth/magic/verify`)
  verifyUrl.searchParams.set('token', token)
  if (redirectTo) verifyUrl.searchParams.set('redirect_to', redirectTo)

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fdf2f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:3px solid #ec268f;">
              <h1 style="margin:0;font-size:22px;font-weight:800;color:#171717;">Impacto Indígena</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;font-size:20px;color:#171717;">Tu enlace de acceso</h2>
              <p style="margin:0 0 24px;font-size:15px;color:#525252;line-height:1.6;">Haz clic en el botón para unirte a esta comunidad. El enlace expira en ${MAGIC_LINK_EXPIRY_MINUTES} minutos.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:6px;background-color:#d41f7f;">
                    <a href="${verifyUrl.toString()}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Unirme a la comunidad</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#a3a3a3;">Si no solicitaste esto, puedes ignorar este correo.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  await brevo.sendTransactional({
    to: email,
    subject: 'Tu enlace de acceso a Impacto Indígena',
    body: html,
  })
}

// POST /api/auth/magic — request magic link
router.post('/magic', magicLinkLimiter, async (req, res) => {
  const { email, redirectTo } = req.body as { email?: string; redirectTo?: string }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'Valid email required' })
    return
  }

  const normalizedEmail = email.toLowerCase().trim()

  try {
    // Graceful email verification (same pattern as subscribe)
    try {
      const result = await brevo.verifyEmail(normalizedEmail)
      if (!result.valid || !result.domainExists || result.isDisposable) {
        res.status(422).json({ error: 'Please enter a valid email address.' })
        return
      }
    } catch (err) {
      log.warn({ err, email: normalizedEmail }, 'email verification failed, proceeding')
    }

    // Rate limit: check if a non-expired token exists (created < 60s ago)
    const recentLink = await prisma.magicLink.findFirst({
      where: {
        email: normalizedEmail,
        createdAt: { gte: new Date(Date.now() - 60 * 1000) },
        usedAt: null,
      },
    })
    if (recentLink) {
      res.status(429).json({ error: 'A magic link was just sent. Please wait 60 seconds before requesting another.' })
      return
    }

    const token = randomUUID()
    await prisma.magicLink.create({
      data: {
        email: normalizedEmail,
        token,
        expiresAt: magicLinkExpiresAt(),
        redirectTo: redirectTo ?? null,
      },
    })

    await sendMagicLinkEmail(normalizedEmail, token, redirectTo)
    log.info({ email: normalizedEmail }, 'magic link sent')

    res.status(204).end()
  } catch (err) {
    log.error({ err, email: normalizedEmail }, 'failed to send magic link')
    res.status(500).json({ error: 'Failed to send magic link' })
  }
})

// GET /api/auth/magic/verify?token=xxx&redirect_to=/comunidad/slug
router.get('/magic/verify', async (req, res) => {
  const { token, redirect_to } = req.query as { token?: string; redirect_to?: string }

  if (!token) {
    const errorUrl = buildErrorUrl(redirect_to)
    res.redirect(303, errorUrl)
    return
  }

  try {
    const link = await prisma.magicLink.findUnique({ where: { token } })

    if (!link || link.usedAt || link.expiresAt < new Date()) {
      log.warn({ tokenPrefix: token?.slice(0, 8) }, 'magic link invalid or expired')
      const errorUrl = buildErrorUrl(redirect_to ?? link?.redirectTo ?? undefined)
      res.redirect(303, errorUrl)
      return
    }

    // Mark as used (one-time use)
    await prisma.magicLink.update({ where: { id: link.id }, data: { usedAt: new Date() } })

    // Upsert user
    const emailPrefix = link.email.split('@')[0]
    const user = await prisma.user.upsert({
      where: { email: link.email },
      update: { updatedAt: new Date() },
      create: {
        email: link.email,
        name: emailPrefix,
        passwordHash: '',
        userType: 'VEEDOR',
        verified: true,
      },
    })

    // Issue long-lived member token as httpOnly cookie (never exposed in URL)
    const memberToken = generateMemberToken(user)
    res.cookie('member_token', memberToken, MEMBER_TOKEN_COOKIE_OPTS)
    // Non-httpOnly indicator so the frontend can detect auth state without an API call
    res.cookie('member_email', user.email, MEMBER_EMAIL_COOKIE_OPTS)

    // Strip header-injection characters (CR, LF, NUL) before building the redirect URL.
    // CLIENT_URL prefix already prevents cross-origin open redirect.
    const rawPath = redirect_to ?? link.redirectTo ?? '/'
    const targetPath = rawPath.replace(/[\r\n\0]/g, '').trim()
    const redirectUrl = `${CLIENT_URL}${targetPath.startsWith('/') ? targetPath : '/' + targetPath}`

    log.info({ userId: user.id, email: user.email }, 'magic link verified, member cookie set')
    res.redirect(303, redirectUrl)
  } catch (err) {
    log.error({ err, tokenPrefix: token?.slice(0, 8) }, 'magic link verification failed')
    res.redirect(303, buildErrorUrl())
  }
})

// POST /api/auth/magic/resend — resend (same rate limit as /magic)
router.post('/magic/resend', magicLinkLimiter, async (req, res) => {
  const { email, redirectTo } = req.body as { email?: string; redirectTo?: string }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'Valid email required' })
    return
  }

  const normalizedEmail = email.toLowerCase().trim()

  try {
    // Graceful email verification (same as /magic)
    try {
      const result = await brevo.verifyEmail(normalizedEmail)
      if (!result.valid || !result.domainExists || result.isDisposable) {
        res.status(422).json({ error: 'Please enter a valid email address.' })
        return
      }
    } catch (err) {
      log.warn({ err, email: normalizedEmail }, 'email verification failed on resend, proceeding')
    }

    const token = randomUUID()
    await prisma.magicLink.create({
      data: {
        email: normalizedEmail,
        token,
        expiresAt: magicLinkExpiresAt(),
        redirectTo: redirectTo ?? null,
      },
    })

    await sendMagicLinkEmail(normalizedEmail, token, redirectTo)
    log.info({ email: normalizedEmail }, 'magic link resent')

    res.status(204).end()
  } catch (err) {
    log.error({ err, email: normalizedEmail }, 'failed to resend magic link')
    res.status(500).json({ error: 'Failed to resend magic link' })
  }
})

// POST /api/auth/magic/logout — clear member cookies
router.post('/magic/logout', (req, res) => {
  res.clearCookie('member_token', { ...MEMBER_TOKEN_COOKIE_OPTS, maxAge: 0 })
  res.clearCookie('member_email', { ...MEMBER_EMAIL_COOKIE_OPTS, maxAge: 0 })
  res.status(204).end()
})

/** Build the error redirect URL, preserving redirect_to so the user can retry */
function buildErrorUrl(redirectTo?: string): string {
  const url = new URL(`${CLIENT_URL}/magic-sent`)
  url.searchParams.set('error', 'expired')
  if (redirectTo) url.searchParams.set('redirect_to', redirectTo)
  return url.toString()
}

export default router
