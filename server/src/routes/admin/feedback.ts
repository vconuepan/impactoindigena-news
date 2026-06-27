import { Router } from 'express'
import { z } from 'zod'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import prisma from '../../lib/prisma.js'
import { createLogger } from '../../lib/logger.js'
import { writeAuditLog } from '../../services/audit.js'

const router = Router()
const log = createLogger('admin:feedback')

const listQuerySchema = z.object({
  status: z.enum(['unread', 'read', 'archived']).optional(),
  category: z.enum(['general', 'bug', 'suggestion', 'other']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

// List feedback with filters and pagination
router.get('/', validateQuery(listQuerySchema), async (req, res) => {
  try {
    const { status, category, page, limit } = req.parsedQuery!

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (category) where.category = category

    const feedbackSelect = {
      id: true, category: true, message: true, email: true,
      status: true, createdAt: true, updatedAt: true,
    } as const

    const [items, total, unreadCount] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: feedbackSelect,
      }),
      prisma.feedback.count({ where }),
      prisma.feedback.count({ where: { status: 'unread' } }),
    ])

    res.json({ items, total, page, limit, unreadCount })
  } catch (err) {
    log.error({ err }, 'failed to list feedback')
    res.status(500).json({ error: 'Failed to list feedback' })
  }
})

// Get unread count (for sidebar badge)
router.get('/count', async (_req, res) => {
  try {
    const unreadCount = await prisma.feedback.count({ where: { status: 'unread' } })
    res.json({ unreadCount })
  } catch (err) {
    log.error({ err }, 'failed to get feedback count')
    res.status(500).json({ error: 'Failed to get feedback count' })
  }
})

const updateStatusSchema = z.object({
  status: z.enum(['unread', 'read', 'archived']),
})

// Update feedback status
router.patch('/:id', validateBody(updateStatusSchema), async (req, res) => {
  try {
    const feedback = await prisma.feedback.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
      select: {
        id: true, category: true, message: true, email: true,
        status: true, createdAt: true, updatedAt: true,
      },
    })
    res.json(feedback)
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Feedback not found' })
      return
    }
    log.error({ err }, 'failed to update feedback')
    res.status(500).json({ error: 'Failed to update feedback' })
  }
})

// Delete feedback
router.delete('/:id', async (req, res) => {
  try {
    await prisma.feedback.delete({ where: { id: req.params.id } })
    await writeAuditLog({ actor: req.user, action: 'feedback.delete', targetType: 'feedback', targetId: req.params.id })
    res.status(204).send()
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Feedback not found' })
      return
    }
    log.error({ err }, 'failed to delete feedback')
    res.status(500).json({ error: 'Failed to delete feedback' })
  }
})

const bulkActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['read', 'archived', 'delete']),
})

// Bulk actions
router.post('/bulk', validateBody(bulkActionSchema), async (req, res) => {
  try {
    const { ids, action } = req.body

    if (action === 'delete') {
      const result = await prisma.feedback.deleteMany({ where: { id: { in: ids } } })
      await writeAuditLog({ actor: req.user, action: 'feedback.bulk_delete', targetType: 'feedback', metadata: { ids, count: result.count } })
      res.json({ affected: result.count })
    } else {
      const result = await prisma.feedback.updateMany({
        where: { id: { in: ids } },
        data: { status: action },
      })
      res.json({ affected: result.count })
    }
  } catch (err) {
    log.error({ err }, 'failed to perform bulk feedback action')
    res.status(500).json({ error: 'Failed to perform bulk action' })
  }
})

export default router
