import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader } from '../../test/helpers.js'

/**
 * El republicar de mantenimiento hace un update directo a published. Es el
 * camino que vuelve a publicar justo la clase de nota que alguien habia
 * despublicado: tiene que registrar lo que dice el gate en las verticales (D4).
 */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))
const mockPrisma = vi.hoisted(() => ({
  story: { findUnique: vi.fn(), update: vi.fn() },
  $disconnect: vi.fn(),
}))
const register = vi.hoisted(() => vi.fn())
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/communityReview.js', () => ({ registerCommunityReviews: register }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

const { default: app } = await import('../../app.js')

describe('POST /api/admin/maintenance/republish-slug', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registra la nota republicada en las verticales', async () => {
    mockPrisma.story.findUnique.mockResolvedValue({ id: 'id-1', slug: 'una-nota', status: 'rejected', title: 'Una nota' })
    mockPrisma.story.update.mockResolvedValue({})
    const res = await request(app).post('/api/admin/maintenance/republish-slug').set(authHeader()).send({ slug: 'una-nota' })
    expect(res.status).toBe(200)
    expect(register).toHaveBeenCalledWith(['id-1'])
  })
})
