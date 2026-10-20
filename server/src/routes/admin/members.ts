import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import prisma from '../../lib/prisma.js'
import { writeAuditLog } from '../../services/audit.js'

const router = Router()
const log = createLogger('admin:members')

/**
 * GET /api/admin/members
 *
 * Returns all users (VEEDOR, EMPRESA, COMUNIDAD_LIDER, ADMIN) with
 * their community memberships. Supports filtering by userType and
 * communitySlug, and pagination.
 *
 * Query params:
 *   userType    — VEEDOR | EMPRESA | COMUNIDAD_LIDER | ADMIN
 *   communitySlug — slug of a specific community
 *   page        — 1-based page number (default 1)
 *   pageSize    — results per page (default 50, max 200)
 */
router.get('/', async (req, res) => {
  try {
    const userType = req.query.userType as string | undefined
    const communitySlug = req.query.communitySlug as string | undefined
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10) || 50))

    // If filtering by community, resolve its id first
    let communityId: string | undefined
    if (communitySlug) {
      const community = await prisma.community.findUnique({
        where: { slug: communitySlug },
        select: { id: true },
      })
      if (!community) {
        res.status(404).json({ error: 'Community not found' })
        return
      }
      communityId = community.id
    }

    const userWhere = userType
      ? { userType: userType as import('@prisma/client').UserType }
      : {}

    const membershipWhere = communityId ? { communityId } : {}

    // Fetch users with their community memberships
    const [total, users] = await Promise.all([
      prisma.user.count({ where: userWhere }),
      prisma.user.findMany({
        where: {
          ...userWhere,
          // If filtering by community, only return users in that community
          ...(communityId
            ? { memberships: { some: { communityId } } }
            : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          userType: true,
          createdAt: true,
          memberships: {
            where: membershipWhere,
            select: {
              joinedAt: true,
              community: {
                select: { id: true, slug: true, name: true, type: true },
              },
            },
            orderBy: { joinedAt: 'asc' },
          },
        },
        orderBy: [{ userType: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    res.json({
      data: users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (err) {
    log.error({ err }, 'failed to list members')
    res.status(500).json({ error: 'Failed to list members' })
  }
})

/**
 * GET /api/admin/members/summary
 *
 * Returns counts grouped by userType and by community — useful for
 * the dashboard overview.
 */
router.get('/summary', async (_req, res) => {
  try {
    const [byType, byCommunity] = await Promise.all([
      prisma.user.groupBy({
        by: ['userType'],
        _count: { _all: true },
        orderBy: { userType: 'asc' },
      }),
      prisma.communityMember.groupBy({
        by: ['communityId'],
        _count: { _all: true },
        orderBy: { _count: { communityId: 'desc' } },
      }),
    ])

    // Enrich byCommunity with community names
    const communityIds = byCommunity.map((r) => r.communityId)
    const communities = await prisma.community.findMany({
      where: { id: { in: communityIds } },
      select: { id: true, name: true, slug: true, type: true },
    })
    const communityMap = new Map(communities.map((c) => [c.id, c]))

    res.json({
      byType: byType.map((r) => ({ userType: r.userType, count: r._count._all })),
      byCommunity: byCommunity.map((r) => ({
        community: communityMap.get(r.communityId),
        count: r._count._all,
      })),
      totalUsers: byType.reduce((sum, r) => sum + r._count._all, 0),
      totalMemberships: byCommunity.reduce((sum, r) => sum + r._count._all, 0),
    })
  } catch (err) {
    log.error({ err }, 'failed to fetch members summary')
    res.status(500).json({ error: 'Failed to fetch members summary' })
  }
})

/**
 * DELETE /api/admin/members/:userId/community/:communityId
 *
 * Removes a user from a community. Used from the admin members table.
 */
router.delete('/:userId/community/:communityId', async (req, res) => {
  try {
    const { userId, communityId } = req.params

    await prisma.communityMember.delete({
      where: { userId_communityId: { userId, communityId } },
    })
    // Misma limpieza que /leave (routes/public/communities.ts): la exclusión
    // del digest pertenece a una membresía que ya no existe. Si quedaba, la
    // persona que volvía a unirse seguía sin recibir el digest de esa comunidad
    // sin que nada se lo dijera. Hasta el 20-oct-2026 este camino no la borraba.
    await prisma.digestExclusion.deleteMany({ where: { userId, communityId } })

    log.info({ userId, communityId }, 'admin removed user from community')
    // Un administrador borrando datos ajenos: su correo es trazabilidad del
    // operador y se conserva (al revés que en los caminos de autoservicio).
    // En metadata va solo el id de la comunidad, no su nombre ni su slug.
    await writeAuditLog({
      actor: req.user,
      action: 'membership.delete',
      targetType: 'community_member',
      targetId: userId,
      metadata: { communityId },
    })
    res.json({ success: true })
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') {
      res.status(404).json({ error: 'Membership not found' })
      return
    }
    log.error({ err }, 'failed to remove community membership')
    res.status(500).json({ error: 'Failed to remove membership' })
  }
})

export default router
