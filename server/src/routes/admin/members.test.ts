import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  communityMember: {
    delete: vi.fn(),
  },
  digestExclusion: {
    deleteMany: vi.fn(),
  },
  // writeAuditLog no se simula: corre el servicio real contra este mock, así
  // que el test ve la fila tal como llegaría a audit_log.
  auditLog: {
    create: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

describe('DELETE /api/admin/members/:userId/community/:communityId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.digestExclusion.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.auditLog.create.mockResolvedValue({})
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/admin/members/u1/community/c1')
    expect(res.status).toBe(401)
    expect(mockPrisma.communityMember.delete).not.toHaveBeenCalled()
  })

  it('borra la membresía y, con ella, la exclusión del digest de esa comunidad', async () => {
    // Hasta el 20-oct-2026 este camino borraba solo la membresía. La exclusión
    // sobrevivía y, si la persona volvía a unirse, seguía sin recibir el digest
    // sin que nada se lo dijera. /leave ya la borraba; este camino no.
    mockPrisma.communityMember.delete.mockResolvedValue({})

    const res = await request(app)
      .delete('/api/admin/members/u1/community/c1')
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(mockPrisma.communityMember.delete).toHaveBeenCalledWith({
      where: { userId_communityId: { userId: 'u1', communityId: 'c1' } },
    })
    // Misma forma que /leave en routes/public/communities.ts
    expect(mockPrisma.digestExclusion.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', communityId: 'c1' },
    })
  })

  it('deja rastro en audit_log: quién borró qué membresía', async () => {
    mockPrisma.communityMember.delete.mockResolvedValue({})

    await request(app)
      .delete('/api/admin/members/u1/community/c1')
      .set(authHeader())

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
    const row = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(row).toMatchObject({
      // authHeader() firma un JWT con userId 'test-admin-id' y role 'admin'
      actorId: 'test-admin-id',
      actorRole: 'admin',
      action: 'membership.delete',
      targetType: 'community_member',
      targetId: 'u1',
      metadata: { communityId: 'c1' },
    })
    // El actor es un administrador borrando datos ajenos: su correo es
    // trazabilidad del operador y se conserva.
    expect(row.actorEmail).toBe('admin@test.com')
  })

  it('returns 404 when the membership does not exist, and then touches nothing else', async () => {
    mockPrisma.communityMember.delete.mockRejectedValue({ code: 'P2025' })

    const res = await request(app)
      .delete('/api/admin/members/u1/community/c1')
      .set(authHeader())

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Membership not found')
    expect(mockPrisma.digestExclusion.deleteMany).not.toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('returns 500 on any other database error, without auditing', async () => {
    mockPrisma.communityMember.delete.mockRejectedValue(new Error('boom'))

    const res = await request(app)
      .delete('/api/admin/members/u1/community/c1')
      .set(authHeader())

    expect(res.status).toBe(500)
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
  })
})
