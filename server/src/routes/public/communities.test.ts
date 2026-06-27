import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  community: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  communityMember: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  story: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}))

vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/brevo.js', () => ({
  sendTransactional: vi.fn().mockResolvedValue(undefined),
  verifyEmail: vi.fn().mockResolvedValue({ valid: true, domainExists: true, isDisposable: false }),
}))
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

const TEST_JWT_SECRET = 'test-jwt-secret-for-helpers'
process.env.JWT_SECRET = TEST_JWT_SECRET

function memberAuthHeader(userId = 'veedor-1', email = 'member@example.com') {
  const token = jwt.sign({ userId, email, role: 'veedor' }, TEST_JWT_SECRET, { expiresIn: '1h' })
  return { Authorization: `Bearer ${token}` }
}

const { default: app } = await import('../../app.js')

const sampleCommunity = (overrides: Record<string, any> = {}) => ({
  id: 'comm-1',
  slug: 'pueblo-mapuche',
  name: 'Pueblo Mapuche',
  description: 'Comunidad mapuche',
  type: 'INDIGENOUS',
  region: 'La Araucanía',
  active: true,
  issueIds: ['issue-1'],
  keywords: [],
  imageUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('Communities API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/communities', () => {
    it('returns active communities', async () => {
      mockPrisma.community.findMany.mockResolvedValue([sampleCommunity()])

      const res = await request(app).get('/api/communities')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].slug).toBe('pueblo-mapuche')
    })

    it('sets cache headers', async () => {
      mockPrisma.community.findMany.mockResolvedValue([])

      const res = await request(app).get('/api/communities')

      expect(res.headers['cache-control']).toContain('max-age=300')
    })

    it('returns empty array when no communities', async () => {
      mockPrisma.community.findMany.mockResolvedValue([])

      const res = await request(app).get('/api/communities')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })

  describe('GET /api/communities/:slug', () => {
    it('returns community with memberCount', async () => {
      mockPrisma.community.findFirst.mockResolvedValue({
        ...sampleCommunity(),
        _count: { members: 42 },
      })

      const res = await request(app).get('/api/communities/pueblo-mapuche')

      expect(res.status).toBe(200)
      expect(res.body.memberCount).toBe(42)
      expect(res.body._count).toBeUndefined()
    })

    it('returns 404 for unknown slug', async () => {
      mockPrisma.community.findFirst.mockResolvedValue(null)

      const res = await request(app).get('/api/communities/does-not-exist')

      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/communities/:slug/stories', () => {
    beforeEach(() => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'comm-1', issue_ids: ['issue-1'], keywords: [] },
      ])
      mockPrisma.story.count.mockResolvedValue(1)
      mockPrisma.story.findMany.mockResolvedValue([
        {
          id: 'story-1',
          slug: 'test-story',
          title: 'Test Story',
          sourceUrl: 'https://example.com',
          sourceTitle: 'Source',
          titleLabel: null,
          datePublished: new Date('2024-01-15'),
          relevance: 8,
          emotionTag: 'uplifting',
          summary: 'Summary',
          quote: null,
          quoteAttribution: null,
          marketingBlurb: null,
          relevanceSummary: null,
          imageUrl: null,
          clusterId: null,
          issue: { name: 'AI', slug: 'ai' },
          feed: { id: 'f1', title: 'Feed', displayTitle: null, issue: { name: 'AI', slug: 'ai' } },
        },
      ])
    })

    it('returns paginated stories', async () => {
      const res = await request(app).get('/api/communities/pueblo-mapuche/stories')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.totalPages).toBe(1)
      expect(res.body.page).toBe(1)
    })

    it('returns 404 for unknown community', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([])

      const res = await request(app).get('/api/communities/unknown/stories')

      expect(res.status).toBe(404)
    })

    it('sets cache headers', async () => {
      const res = await request(app).get('/api/communities/pueblo-mapuche/stories')

      expect(res.headers['cache-control']).toContain('max-age=60')
    })
  })

  describe('GET /api/communities/:slug/membership', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/communities/pueblo-mapuche/membership')

      expect(res.status).toBe(401)
    })

    it('returns isMember: false when not a member', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(sampleCommunity())
      mockPrisma.communityMember.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get('/api/communities/pueblo-mapuche/membership')
        .set(memberAuthHeader())

      expect(res.status).toBe(200)
      expect(res.body.isMember).toBe(false)
    })

    it('returns isMember: true when member exists', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(sampleCommunity())
      mockPrisma.communityMember.findUnique.mockResolvedValue({ userId: 'veedor-1', communityId: 'comm-1' })

      const res = await request(app)
        .get('/api/communities/pueblo-mapuche/membership')
        .set(memberAuthHeader())

      expect(res.status).toBe(200)
      expect(res.body.isMember).toBe(true)
    })

    it('returns 404 for unknown community', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get('/api/communities/unknown/membership')
        .set(memberAuthHeader())

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/communities/:slug/join', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).post('/api/communities/pueblo-mapuche/join')

      expect(res.status).toBe(401)
    })

    it('joins community and returns isMember: true', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(sampleCommunity())
      mockPrisma.communityMember.findUnique.mockResolvedValue(null) // not yet a member
      mockPrisma.communityMember.upsert.mockResolvedValue({ userId: 'veedor-1', communityId: 'comm-1' })
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'member@example.com', name: 'member' })
      mockPrisma.story.findMany.mockResolvedValue([])

      const res = await request(app)
        .post('/api/communities/pueblo-mapuche/join')
        .set(memberAuthHeader())

      expect(res.status).toBe(200)
      expect(res.body.isMember).toBe(true)
      expect(mockPrisma.communityMember.upsert).toHaveBeenCalledOnce()
    })

    it('requires express consent to join a PUEBLO community', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(sampleCommunity({ type: 'PUEBLO' }))
      mockPrisma.communityMember.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/communities/pueblo-mapuche/join')
        .set(memberAuthHeader())

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('consent_required')
      expect(mockPrisma.communityMember.upsert).not.toHaveBeenCalled()
    })

    it('joins a PUEBLO community with consent and stamps consentedAt', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(sampleCommunity({ type: 'PUEBLO' }))
      mockPrisma.communityMember.findUnique.mockResolvedValue(null)
      mockPrisma.communityMember.upsert.mockResolvedValue({ userId: 'veedor-1', communityId: 'comm-1' })
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'member@example.com', name: 'member' })

      const res = await request(app)
        .post('/api/communities/pueblo-mapuche/join')
        .set(memberAuthHeader())
        .send({ consent: true })

      expect(res.status).toBe(200)
      expect(res.body.isMember).toBe(true)
      const call = mockPrisma.communityMember.upsert.mock.calls[0][0]
      expect(call.create.consentedAt).toBeInstanceOf(Date)
      expect(call.create.consentVersion).toBeTruthy()
    })

    it('returns 404 for unknown community', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/communities/unknown/join')
        .set(memberAuthHeader())

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/communities/:slug/leave', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).delete('/api/communities/pueblo-mapuche/leave')

      expect(res.status).toBe(401)
    })

    it('removes membership and returns isMember: false', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(sampleCommunity())
      mockPrisma.communityMember.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .delete('/api/communities/pueblo-mapuche/leave')
        .set(memberAuthHeader())

      expect(res.status).toBe(200)
      expect(res.body.isMember).toBe(false)
      expect(mockPrisma.communityMember.deleteMany).toHaveBeenCalledOnce()
    })

    it('returns 404 for unknown community', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .delete('/api/communities/unknown/leave')
        .set(memberAuthHeader())

      expect(res.status).toBe(404)
    })
  })
})
