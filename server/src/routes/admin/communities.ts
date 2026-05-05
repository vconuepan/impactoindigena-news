import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import prisma from '../../lib/prisma.js'

const router = Router()
const log = createLogger('admin:communities')

/**
 * GET /api/admin/communities
 * Lists all communities (active and inactive) with member counts.
 */
router.get('/', async (_req, res) => {
  try {
    const communities = await prisma.community.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { members: true } },
      },
    })
    res.json(communities)
  } catch (err) {
    log.error({ err }, 'failed to list communities')
    res.status(500).json({ error: 'Failed to list communities' })
  }
})

/**
 * PATCH /api/admin/communities/:id
 * Toggles the active field (or updates any allowed fields).
 * Body: { active: boolean }
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { active, lat, lng } = req.body as { active?: boolean; lat?: number | null; lng?: number | null }

    const data: Record<string, unknown> = {}

    if (typeof active === 'boolean') data.active = active
    if ('lat' in req.body) data.lat = lat ?? null
    if ('lng' in req.body) data.lng = lng ?? null

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' })
      return
    }

    const community = await prisma.community.update({ where: { id }, data })

    log.info({ id, ...data }, 'community updated')
    res.json(community)
  } catch (err) {
    log.error({ err }, 'failed to update community')
    res.status(500).json({ error: 'Failed to update community' })
  }
})

export default router
