import { Router } from 'express'
import prisma from '../../lib/prisma.js'
import { createLogger } from '../../lib/logger.js'
import * as brevo from '../../services/brevo.js'
import { writeAuditLog } from '../../services/audit.js'

const router = Router()
const log = createLogger('admin:subscribers')

/**
 * GET /api/admin/subscribers?status=confirmed|pending|expired|all&page=1&pageSize=50
 */
router.get('/', async (req, res) => {
  const status = (req.query.status as string) || 'all'
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10) || 50))

  const now = new Date()
  const where =
    status === 'confirmed'
      ? { confirmedAt: { not: null } }
      : status === 'pending'
      ? { confirmedAt: null, expiresAt: { gt: now } }
      : status === 'expired'
      ? { confirmedAt: null, expiresAt: { lte: now } }
      : {}

  const [total, subscribers] = await Promise.all([
    prisma.pendingSubscription.count({ where }),
    prisma.pendingSubscription.findMany({
      where,
      select: { id: true, email: true, confirmedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  res.json({ data: subscribers, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
})

/**
 * GET /api/admin/subscribers/stats
 */
router.get('/stats', async (_req, res) => {
  const now = new Date()
  const [confirmed, pending, expired] = await Promise.all([
    prisma.pendingSubscription.count({ where: { confirmedAt: { not: null } } }),
    prisma.pendingSubscription.count({ where: { confirmedAt: null, expiresAt: { gt: now } } }),
    prisma.pendingSubscription.count({ where: { confirmedAt: null, expiresAt: { lte: now } } }),
  ])
  res.json({ confirmed, pending, expired, total: confirmed + pending + expired })
})

/**
 * GET /api/admin/subscribers/engagement
 * Fetches Brevo open/click stats for all confirmed subscribers.
 * Returns { email: ContactEngagement | null } map.
 * Capped at 100 concurrent requests with concurrency limiting.
 */
router.get('/engagement', async (_req, res) => {
  try {
    const confirmed = await prisma.pendingSubscription.findMany({
      where: { confirmedAt: { not: null } },
      select: { id: true, email: true },
    })

    // Fetch Brevo stats with concurrency limit.
    // Batch of 15 concurrent requests — each has a 6s timeout, so worst-case
    // per batch is ~6s. 100 subscribers ÷ 15 = ~7 batches × 6s = ~42s max, but
    // typical latency is ~300ms per call so realistic time is <5s for 100 subs.
    const BATCH_SIZE = 15
    const results: Array<{ id: string; email: string; engagement: brevo.ContactEngagement | null }> = []

    for (let i = 0; i < confirmed.length; i += BATCH_SIZE) {
      const batch = confirmed.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(
        batch.map(async (sub) => ({
          id: sub.id,
          email: sub.email,
          engagement: await brevo.getContactEngagement(sub.email),
        }))
      )
      results.push(...batchResults)
    }

    res.json(results)
  } catch (err) {
    log.error({ err }, 'failed to fetch subscriber engagement')
    res.status(500).json({ error: 'Failed to fetch engagement' })
  }
})

/**
 * DELETE /api/admin/subscribers/:id
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  try {
    await prisma.pendingSubscription.delete({ where: { id } })
    log.info({ id }, 'subscriber deleted by admin')
    await writeAuditLog({ actor: req.user, action: 'subscriber.delete', targetType: 'pending_subscription', targetId: id })
    res.json({ ok: true })
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') {
      res.status(404).json({ error: 'Subscriber not found' })
      return
    }
    log.error({ err }, 'failed to delete subscriber')
    res.status(500).json({ error: 'Failed to delete subscriber' })
  }
})

export default router
