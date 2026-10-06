import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, TEST_API_KEY } from '../../test/helpers.js'

/**
 * PATCH de palabras clave de una comunidad (D4, Tanda B, item 15): validado,
 * auditado con antes y despues, y con conciliacion inmediata si la vertical
 * esta en revision. Hasta el 4-oct-2026 solo se cambiaban por SQL.
 */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

const mockPrisma = vi.hoisted(() => ({
  community: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}))
const reconcile = vi.hoisted(() => vi.fn().mockResolvedValue([]))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/communityReview.js', () => ({ reconcileCommunityReviews: reconcile, communitiesUnderReview: vi.fn(), communityReviewStats: vi.fn() }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

process.env.PUBLIC_API_KEY = TEST_API_KEY
const { default: app } = await import('../../app.js')

const esperar = () => new Promise((r) => setTimeout(r, 10))

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.community.findUnique.mockResolvedValue({ slug: 'mapuche', keywords: ['mapuche'] })
  mockPrisma.community.update.mockImplementation(async ({ data }: any) => ({ id: 'c1', slug: 'mapuche', ...data }))
  mockPrisma.auditLog.create.mockResolvedValue({})
})

describe('PATCH /api/admin/communities/:id con keywords', () => {
  it('400 si no es lista, si hay vacias o si supera 40', async () => {
    for (const keywords of ['mapuche', [], ['a'], Array.from({ length: 41 }, (_, i) => `k${i}`)]) {
      const res = await request(app).patch('/api/admin/communities/c1').set(authHeader()).send({ keywords })
      expect(res.status, JSON.stringify(keywords).slice(0, 40)).toBe(400)
    }
    expect(mockPrisma.community.update).not.toHaveBeenCalled()
  })

  it('limpia, deduplica sin distinguir mayusculas, audita antes/despues y concilia si esta en revision', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ mode: 'shadow' }])
    const res = await request(app)
      .patch('/api/admin/communities/c1')
      .set(authHeader())
      .send({ keywords: [' Mapuche ', 'mapuche', 'Wallmapu', 'Puelmapu'] })
    expect(res.status).toBe(200)
    expect(mockPrisma.community.update.mock.calls[0][0].data.keywords).toEqual(['Mapuche', 'Wallmapu', 'Puelmapu'])
    const audit = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({ action: 'community.keywords', targetId: 'c1', actorId: 'test-admin-id' })
    expect(audit.metadata).toEqual({ slug: 'mapuche', from: ['mapuche'], to: ['Mapuche', 'Wallmapu', 'Puelmapu'] })
    await esperar()
    expect(reconcile).toHaveBeenCalledWith({ slugs: ['mapuche'], force: true })
  })

  it('en off no concilia, pero audita igual', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    const res = await request(app).patch('/api/admin/communities/c1').set(authHeader()).send({ keywords: ['mapuche'] })
    expect(res.status).toBe(200)
    await esperar()
    expect(reconcile).not.toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce()
  })

  it('cambiar solo active no audita ni concilia', async () => {
    const res = await request(app).patch('/api/admin/communities/c1').set(authHeader()).send({ active: false })
    expect(res.status).toBe(200)
    expect(mockPrisma.community.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
  })
})
