import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

/**
 * Aislamiento por vertical (D4, Tanda B, item 14), consumidor bienvenida: las
 * tres notas del correo de bienvenida salen del MISMO filtro que la pagina.
 * Antes este correo ni exigia relevancia 3 ni respetaba el modo.
 */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

const mockPrisma = vi.hoisted(() => ({
  community: { findUnique: vi.fn() },
  communityMember: { findUnique: vi.fn(), upsert: vi.fn() },
  story: { findMany: vi.fn() },
  issue: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}))
const sendTransactional = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/brevo.js', () => ({ sendTransactional, verifyEmail: vi.fn() }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

const TEST_JWT_SECRET = 'test-jwt-secret-for-helpers-padded-32'
process.env.JWT_SECRET = TEST_JWT_SECRET
const memberAuth = () => ({ Authorization: `Bearer ${jwt.sign({ userId: 'veedor-1', email: 'm@example.com', role: 'veedor' }, TEST_JWT_SECRET, { expiresIn: '1h' })}` })

const { default: app } = await import('../../app.js')

const HELD = { NOT: { communityReviews: { some: { communityId: 'c-mapuche', reviewState: 'held' } } } }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.community.findUnique.mockResolvedValue({ id: 'c-mapuche', slug: 'mapuche', name: 'Pueblo Mapuche', type: 'TERRITORIO', issueIds: ['tema-fantasma'], keywords: ['mapuche'] })
  mockPrisma.communityMember.findUnique.mockResolvedValue(null)
  mockPrisma.communityMember.upsert.mockResolvedValue({ userId: 'veedor-1', communityId: 'c-mapuche' })
  mockPrisma.user.findUnique.mockResolvedValue({ email: 'm@example.com', name: 'Miembro' })
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.story.findMany.mockResolvedValue([])
})

async function esperarCorreo() {
  for (let i = 0; i < 50 && sendTransactional.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 5))
}

describe('correo de bienvenida y la retencion por vertical', () => {
  it('en sombra: relevancia 3, palabras clave y lo retenido excluido', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ mode: 'shadow' }])
    const res = await request(app).post('/api/communities/mapuche/join').set(memberAuth())
    expect(res.status).toBe(200)
    await esperarCorreo()
    expect(sendTransactional).toHaveBeenCalledOnce()
    const where = mockPrisma.story.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ status: 'published', relevance: { gte: 3 } })
    expect(where.AND[1]).toEqual(HELD)
    expect(JSON.stringify(where)).not.toContain('issueId')
  })
})
