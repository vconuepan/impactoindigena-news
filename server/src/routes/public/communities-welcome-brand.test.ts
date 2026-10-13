import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

/** El correo de bienvenida con la vitrina de marca (D5, entrega 2). */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))
const mockPrisma = vi.hoisted(() => ({
  community: { findUnique: vi.fn() },
  communityMember: { findUnique: vi.fn(), upsert: vi.fn() },
  story: { findMany: vi.fn() },
  storyBrandAssessment: { findMany: vi.fn() },
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

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.community.findUnique.mockResolvedValue({ id: 'c1', slug: 'wallmapu-araucania', name: 'Araucanía', type: 'TERRITORIO', issueIds: [], keywords: ['temuco'] })
  mockPrisma.communityMember.findUnique.mockResolvedValue(null)
  mockPrisma.communityMember.upsert.mockResolvedValue({})
  mockPrisma.user.findUnique.mockResolvedValue({ email: 'm@example.com', name: 'Ana' })
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
    strings.join('?').includes('community_brand_criteria') ? [{ criterion: 'territorial', mode: 'enforce', rescue_mode: 'off' }] : [],
  )
  mockPrisma.story.findMany.mockResolvedValue([{ title: 'Publicada', slug: 'nota-1', summary: 'R', sourceTitle: 'F', datePublished: new Date('2026-10-10') }])
  mockPrisma.storyBrandAssessment.findMany.mockResolvedValue([
    {
      brandTitle: 'Angol inaugura su CESFAM', brandSummary: 'Resumen.', brandSlug: 'angol-abc', brandDate: new Date('2026-10-12'),
      brandScore: 6, axis: 'region_completa', place: null, sourceSignal: 'term',
      story: { id: 's2', sourceUrl: 'u', sourceTitle: 'Crudo', imageUrl: null, narrativeFrame: null, feedId: 'f', feed: { id: 'f', title: 'Angol Noticias', displayTitle: null, issue: { name: 'T', slug: 't' } } },
    },
  ])
})

async function esperarCorreo() {
  for (let i = 0; i < 50 && sendTransactional.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 5))
}

describe('correo de bienvenida con la vitrina de marca', () => {
  it('trae la nota de marca enlazada a su ficha, mezclada por fecha', async () => {
    expect((await request(app).post('/api/communities/wallmapu-araucania/join').set(memberAuth())).status).toBe(200)
    await esperarCorreo()
    const { body } = sendTransactional.mock.calls[0][0]
    expect(body).toContain('/comunidad/wallmapu-araucania/n/angol-abc')
    expect(body.indexOf('angol-abc')).toBeLessThan(body.indexOf('nota-1'))
    // la vitrina no repite lo que ya sale por el filtro de siempre (revisión del 13-oct)
    expect(mockPrisma.storyBrandAssessment.findMany.mock.calls[0][0].where.story.AND[1]).toEqual({ NOT: mockPrisma.story.findMany.mock.calls[0][0].where })
  })
})
