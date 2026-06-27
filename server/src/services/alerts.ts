/**
 * Alert subscription service.
 *
 * Handles double opt-in flow and daily topic-matching email dispatch.
 * Uses the same Brevo transactional email infrastructure as newsletter subscriptions.
 */
import { randomUUID } from 'crypto'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import * as brevo from './brevo.js'
import { publisherFromUrl } from '../lib/publisher.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('alerts')

const CLIENT_URL = process.env.CLIENT_URL || 'https://impactoindigena.news'
// Default points at the Azure SWA domain (the linked-backend proxy serves
// /api/*). The old default was the decommissioned Render backend — emails
// built with it linked to a dead host when API_URL wasn't set.
const API_URL    = process.env.API_URL    || 'https://impactoindigena.news'

// Token expiry: 48 hours
const TOKEN_EXPIRY_HOURS = 48

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

export async function subscribeToAlerts(email: string, topics: string[]): Promise<void> {
  if (topics.length === 0) throw new Error('At least one topic required')

  // Check if already confirmed with same topics
  const existing = await prisma.alertSubscription.findFirst({
    where: { email, confirmedAt: { not: null }, active: true },
  })

  if (existing) {
    // Update topics for existing confirmed subscriber
    await prisma.alertSubscription.update({
      where: { id: existing.id },
      data: { topics },
    })
    log.info({ email }, 'updated alert topics for existing subscriber')
    return
  }

  // Clean up stale unconfirmed entries
  await prisma.alertSubscription.deleteMany({
    where: { email, confirmedAt: null },
  })

  const token     = randomUUID()
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

  await prisma.alertSubscription.create({
    data: { email, topics, token, expiresAt },
  })

  await sendConfirmationEmail(email, token, topics)
  log.info({ email, topics }, 'alert subscription created, confirmation sent')
}

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

export async function confirmAlert(token: string, email: string): Promise<void> {
  const sub = await prisma.alertSubscription.findFirst({ where: { token, email } })
  if (!sub) throw new Error('Invalid confirmation link')
  if (sub.confirmedAt) return // already confirmed

  if (new Date() > sub.expiresAt) throw new Error('Confirmation link has expired')

  await prisma.alertSubscription.update({
    where: { id: sub.id },
    data: { confirmedAt: new Date() },
  })
  log.info({ email }, 'alert subscription confirmed')
}

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------

// Unsubscribe HARD-DELETES the rows: the privacy policy promises subscriber
// data is removed after opt-out (Ley 21.719 audit, B1). The `active` column
// is now dead schema — kept until a future migration drops it.

/** Legacy path — links already delivered in inboxes carry ?unsubscribe=<email>. */
export async function unsubscribeFromAlerts(email: string): Promise<void> {
  const { count } = await prisma.alertSubscription.deleteMany({ where: { email } })
  log.info({ count }, 'alert subscriptions deleted (legacy email link)')
}

/**
 * Token-based unsubscribe — the link embedded in every alert email from now
 * on, so the reader's email never travels in a URL. The token's expiresAt
 * applies only to CONFIRMATION; an unsubscribe link must work forever, so
 * expiry is deliberately ignored here. Deletes every subscription for the
 * reader (opt-out means full removal). Idempotent: an unknown/already-used
 * token is a no-op.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const sub = await prisma.alertSubscription.findUnique({ where: { token } })
  if (!sub) return false
  const { count } = await prisma.alertSubscription.deleteMany({ where: { email: sub.email } })
  log.info({ count }, 'alert subscriptions deleted (token link)')
  return true
}

// ---------------------------------------------------------------------------
// Cleanup — called by the cleanup_subscriptions cron job
// ---------------------------------------------------------------------------

/**
 * Remove abandoned alert double opt-ins: unconfirmed subscriptions whose
 * confirmation token has already expired. They can never be confirmed
 * (confirmAlert rejects expired tokens) yet retain the reader's email and
 * topics. Confirmed subscribers are active data subjects and are kept.
 * Supports the storage-limitation principle of Ley 21.719.
 */
export async function cleanupExpiredAlertSubscriptions(): Promise<number> {
  const { count } = await prisma.alertSubscription.deleteMany({
    where: { confirmedAt: null, expiresAt: { lt: new Date() } },
  })
  if (count > 0) log.info({ count }, 'expired unconfirmed alert subscriptions purged')
  return count
}

// ---------------------------------------------------------------------------
// Daily send — called by the send_alerts cron job
// ---------------------------------------------------------------------------

export async function sendDailyAlerts(): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Published stories from last 24 hours
  const recentStories = await prisma.story.findMany({
    where: {
      status: 'published',
      datePublished: { gte: since },
      slug: { not: null },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      imageUrl: true,
      sourceUrl: true,
      datePublished: true,
      issue: { select: { name: true, slug: true } },
      feed: { select: { title: true, displayTitle: true } },
    },
    orderBy: { relevance: 'desc' },
    take: 100,
  })

  if (recentStories.length === 0) {
    log.info('no new stories in last 24h, skipping alert send')
    return
  }

  // Active confirmed subscribers
  const subscribers = await prisma.alertSubscription.findMany({
    where: { active: true, confirmedAt: { not: null } },
  })

  log.info({ subscriberCount: subscribers.length, storyCount: recentStories.length }, 'starting daily alert send')

  let sent = 0
  let skipped = 0

  for (const sub of subscribers) {
    // Match stories to subscriber's topics
    const matched = recentStories.filter((story) => {
      const haystack = `${story.title ?? ''} ${story.summary ?? ''}`.toLowerCase()
      return sub.topics.some((topic: string) => haystack.includes(topic.toLowerCase()))
    })

    if (matched.length === 0) { skipped++; continue }

    try {
      await sendAlertEmail(sub.email, sub.token, sub.topics, matched)
      sent++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn({ email: sub.email, err: msg }, 'failed to send alert email')
    }
  }

  log.info({ sent, skipped }, 'daily alert send complete')
}

// ---------------------------------------------------------------------------
// Email helpers
// ---------------------------------------------------------------------------

async function sendConfirmationEmail(email: string, token: string, topics: string[]): Promise<void> {
  const confirmUrl = `${API_URL}/api/alerts/confirm?token=${token}&email=${encodeURIComponent(email)}`
  const topicList  = topics.map((t) => `<li style="margin:4px 0;">${t}</li>`).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f8;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:32px 32px 24px;border-bottom:3px solid #ec268f;">
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#171717;">Impacto Indígena</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#171717;">Confirma tus alertas de territorio</h2>
          <p style="margin:0 0 12px;font-size:15px;color:#525252;line-height:1.6;">Recibirás alertas diarias cuando haya nuevas noticias sobre:</p>
          <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#374151;">${topicList}</ul>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr><td style="border-radius:6px;background:#d41f7f;">
              <a href="${confirmUrl}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Confirmar alertas</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#a3a3a3;">Este enlace expira en ${TOKEN_EXPIRY_HOURS} horas. Puedes desactivar las alertas en cualquier momento haciendo clic en el enlace al pie de cada email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await brevo.sendTransactional({
    to:      email,
    subject: 'Confirma tus alertas — Impacto Indígena',
    body:    html,
  })
}

type StorySnippet = {
  title: string | null
  slug:  string | null
  imageUrl: string | null
  sourceUrl: string
  datePublished: Date | null
  issue: { name: string; slug: string } | null
  feed: { title: string; displayTitle: string | null } | null
}

async function sendAlertEmail(email: string, token: string, topics: string[], stories: StorySnippet[]): Promise<void> {
  // Token-based link: the reader's email must not travel in URLs (it leaks
  // into logs and referrers). The legacy ?unsubscribe=<email> path stays
  // supported server-side for links already delivered.
  const unsubUrl  = `${CLIENT_URL}/alertas?unsubscribe_token=${token}`
  const topicList = topics.join(', ')

  const storyItems = stories.map((s) => {
    const url   = `${CLIENT_URL}/stories/${s.slug}`
    const date  = s.datePublished ? new Date(s.datePublished).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : ''
    const src   = publisherFromUrl(s.sourceUrl, s.feed?.displayTitle ?? s.feed?.title)
    return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #f5f5f5;">
        <a href="${url}" style="font-size:14px;font-weight:600;color:#171717;text-decoration:none;display:block;margin-bottom:4px;">${s.title ?? ''}</a>
        <span style="font-size:12px;color:#737373;">${src}${date ? ' · ' + date : ''}</span>
      </td></tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f8;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:24px 32px;border-bottom:3px solid #ec268f;">
          <h1 style="margin:0;font-size:18px;font-weight:800;color:#171717;">Impacto Indígena</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#737373;">Alertas sobre: <strong>${topicList}</strong></p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 16px;font-size:14px;color:#525252;">Nuevas noticias del día que coinciden con tus temas de alerta:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${storyItems}</table>
          <p style="margin:20px 0 0;font-size:12px;color:#a3a3a3;">
            <a href="${unsubUrl}" style="color:#a3a3a3;">Desactivar estas alertas</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await brevo.sendTransactional({
    to:      email,
    subject: `Alertas Impacto Indígena — ${stories.length} nueva${stories.length === 1 ? '' : 's'} noticia${stories.length === 1 ? '' : 's'}`,
    body:    html,
  })
}
