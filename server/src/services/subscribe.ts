import { randomUUID } from 'crypto'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import * as brevo from './brevo.js'
import { createLogger, maskEmail } from '../lib/logger.js'

const log = createLogger('subscribe')

const CLIENT_URL = process.env.CLIENT_URL || 'https://impactoindigena.news'
const API_URL = process.env.API_URL || 'https://impactoindigena.news'

export class EmailValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailValidationError'
  }
}

interface SubscribeParams {
  email: string
  firstName?: string
  language?: 'es' | 'en'
}

export async function subscribe({ email, firstName, language = 'es' }: SubscribeParams) {
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + config.subscribe.confirmTokenExpiryHours * 60 * 60 * 1000)

  // Check if already confirmed
  const existing = await prisma.pendingSubscription.findFirst({
    where: { email, confirmedAt: { not: null } },
  })
  if (existing) {
    log.info({ email: maskEmail(email) }, 'already subscribed, returning success without action')
    return
  }

  // Verify email via Brevo (graceful degradation — skip if API fails)
  try {
    const result = await brevo.verifyEmail(email)
    if (!result.valid) {
      throw new EmailValidationError('Please enter a valid email address.')
    }
    if (!result.domainExists) {
      throw new EmailValidationError('Please enter a valid email address.')
    }
    if (result.isDisposable) {
      throw new EmailValidationError('Disposable email addresses are not allowed. Please use a permanent email.')
    }
  } catch (err) {
    if (err instanceof EmailValidationError) throw err
    log.warn({ err, email: maskEmail(email) }, 'email verification failed, skipping check')
  }

  // Delete any existing unconfirmed pending subscriptions for this email.
  // This handles the re-subscribe case: user gets a fresh token and a new
  // confirmation email instead of accumulating stale entries.
  await prisma.pendingSubscription.deleteMany({
    where: { email, confirmedAt: null },
  })

  // Create contact in Brevo (subscribed: false until confirmed)
  let plunkContactId: string | null = null
  try {
    const contact = await brevo.createContact({
      email,
      subscribed: false,
      data: { ...(firstName ? { NOMBRE: firstName } : {}) },
    })
    plunkContactId = contact.id
  } catch (err) {
    log.warn({ err, email: maskEmail(email) }, 'failed to create Brevo contact, proceeding with subscription')
  }

  // Store pending subscription
  await prisma.pendingSubscription.create({
    data: {
      email,
      token,
      plunkContactId,
      expiresAt,
    },
  })

  // Send confirmation email
  const confirmUrl = `${API_URL}/api/subscribe/confirm?token=${token}&email=${encodeURIComponent(email)}`
  const safeFirstName = firstName
    ? firstName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    : undefined

  const isEn = language === 'en'
  const subject = isEn
    ? 'Confirm your subscription to Impacto Indígena'
    : 'Confirma tu suscripción a Impacto Indígena'
  const greeting = isEn
    ? (safeFirstName ? `Hi ${safeFirstName},` : 'Hi,')
    : (safeFirstName ? `Hola ${safeFirstName},` : 'Hola,')
  const headingText = isEn ? 'Confirm your subscription' : 'Confirma tu suscripción'
  const bodyText = isEn
    ? `${greeting} Click the button below to confirm your subscription.`
    : `${greeting} Haz clic en el botón para confirmar tu suscripción.`
  const tagline = isEn
    ? 'News that matters to indigenous peoples. Weekly to your inbox. Curated with care by AI.'
    : 'Noticias que importan a los pueblos indígenas. Semanal en tu correo. Curado con cuidado por IA.'
  const buttonText = isEn ? 'Confirm Subscription' : 'Confirmar suscripción'
  const expiryText = isEn
    ? `This link expires in ${config.subscribe.confirmTokenExpiryHours} hours. If you didn't request this, you can safely ignore this email.`
    : `Este enlace expira en ${config.subscribe.confirmTokenExpiryHours} horas. Si no solicitaste esto, puedes ignorar este correo.`

  const html = `<!DOCTYPE html>
<html lang="${language ?? 'es'}">
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
              <h2 style="margin:0 0 16px;font-size:20px;color:#171717;">${headingText}</h2>
              <p style="margin:0 0 8px;font-size:15px;color:#525252;line-height:1.6;">${bodyText}</p>
              <p style="margin:0 0 24px;font-size:14px;color:#737373;line-height:1.5;font-style:italic;">${tagline}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:6px;background-color:#d41f7f;">
                    <a href="${confirmUrl}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">${buttonText}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#a3a3a3;">${expiryText}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  try {
    await brevo.sendTransactional({
      to: email,
      subject,
      body: html,
    })
    log.info({ email: maskEmail(email) }, 'confirmation email sent')
  } catch (err) {
    log.error({ err, email: maskEmail(email) }, 'failed to send confirmation email')
    throw new Error('Failed to send confirmation email')
  }
}

export async function confirmSubscription(token: string, email: string) {
  const pending = await prisma.pendingSubscription.findFirst({
    where: { token, email },
  })

  if (!pending) {
    throw new Error('Invalid confirmation link')
  }

  if (pending.confirmedAt) {
    return // Already confirmed
  }

  if (new Date() > pending.expiresAt) {
    throw new Error('Confirmation link has expired')
  }

  // Update Brevo contact to subscribed
  if (pending.plunkContactId) {
    try {
      await brevo.updateContact(pending.plunkContactId, {
        subscribed: true,
      })
    } catch (err) {
      log.warn({ err, email: maskEmail(email) }, 'failed to update Brevo contact, marking as confirmed anyway')
    }
  }

  // Mark as confirmed
  await prisma.pendingSubscription.update({
    where: { id: pending.id },
    data: { confirmedAt: new Date() },
  })

  log.info({ email: maskEmail(email) }, 'subscription confirmed')
}

/**
 * Remove abandoned double opt-in records: unconfirmed pending subscriptions
 * whose confirmation token has already expired. These can never be confirmed
 * (confirmSubscription rejects expired tokens) and serve no further purpose,
 * yet they retain the visitor's email. Confirmed subscriptions are kept — they
 * back the "already subscribed" idempotency check in subscribe(). Supports the
 * storage-limitation principle of Ley 21.719 (conservación limitada).
 */
export async function cleanupExpiredPendingSubscriptions(): Promise<number> {
  const result = await prisma.pendingSubscription.deleteMany({
    where: { confirmedAt: null, expiresAt: { lt: new Date() } },
  })
  return result.count
}
