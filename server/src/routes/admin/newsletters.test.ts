import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, sampleNewsletter, sampleStory, TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  newsletter: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  story: {
    findMany: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
// Regla 2: por defecto ninguna nota menciona a un cliente (se prueba en services/newsletter.test.ts).
vi.mock('../../services/avisoClientes.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/avisoClientes.js')>()),
  lineaDeAvisoParaPublicar: vi.fn(async () => null),
}))
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))
vi.mock('../../services/llm.js', () => ({
  getLLMByTier: vi.fn(() => ({
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue({ intro: 'Editorial intro.' }),
    })),
  })),
  rateLimitDelay: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/retry.js', () => ({
  withRetry: vi.fn((fn: () => Promise<any>) => fn()),
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

describe('Admin Newsletters API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/admin/newsletters', () => {
    it('returns 401 without auth header', async () => {
      const res = await request(app).get('/api/admin/newsletters')
      expect(res.status).toBe(401)
    })

    it('returns paginated newsletters', async () => {
      const newsletters = [sampleNewsletter(), sampleNewsletter({ id: 'newsletter-2', title: 'Week 2' })]
      mockPrisma.newsletter.findMany.mockResolvedValue(newsletters)
      mockPrisma.newsletter.count.mockResolvedValue(2)

      const res = await request(app)
        .get('/api/admin/newsletters')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.total).toBe(2)
    })

    it('filters by status', async () => {
      mockPrisma.newsletter.findMany.mockResolvedValue([])
      mockPrisma.newsletter.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/admin/newsletters?status=published')
        .set(authHeader())
      expect(res.status).toBe(200)
    })
  })

  describe('GET /api/admin/newsletters/:id', () => {
    it('returns a single newsletter', async () => {
      mockPrisma.newsletter.findUnique.mockResolvedValue(sampleNewsletter())

      const res = await request(app)
        .get('/api/admin/newsletters/newsletter-1')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Weekly Roundup #1')
    })

    it('returns 404 for unknown newsletter', async () => {
      mockPrisma.newsletter.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get('/api/admin/newsletters/unknown')
        .set(authHeader())
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/admin/newsletters', () => {
    it('creates a new newsletter', async () => {
      mockPrisma.newsletter.create.mockResolvedValue(sampleNewsletter())

      const res = await request(app)
        .post('/api/admin/newsletters')
        .set(authHeader())
        .send({ title: 'Weekly Roundup #1' })
      expect(res.status).toBe(201)
      expect(res.body.title).toBe('Weekly Roundup #1')
    })

    it('returns 400 for missing title', async () => {
      const res = await request(app)
        .post('/api/admin/newsletters')
        .set(authHeader())
        .send({})
      expect(res.status).toBe(400)
    })
  })

  describe('PUT /api/admin/newsletters/:id', () => {
    it('updates a newsletter', async () => {
      const updated = sampleNewsletter({ title: 'Updated' })
      mockPrisma.newsletter.update.mockResolvedValue(updated)

      const res = await request(app)
        .put('/api/admin/newsletters/newsletter-1')
        .set(authHeader())
        .send({ title: 'Updated' })
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Updated')
    })

    it('returns 404 for unknown newsletter', async () => {
      mockPrisma.newsletter.update.mockRejectedValue({ code: 'P2025' })

      const res = await request(app)
        .put('/api/admin/newsletters/unknown')
        .set(authHeader())
        .send({ title: 'Test' })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/admin/newsletters/:id', () => {
    it('deletes a newsletter', async () => {
      mockPrisma.newsletter.delete.mockResolvedValue(sampleNewsletter())

      const res = await request(app)
        .delete('/api/admin/newsletters/newsletter-1')
        .set(authHeader())
      expect(res.status).toBe(204)
    })

    it('returns 404 for unknown newsletter', async () => {
      mockPrisma.newsletter.delete.mockRejectedValue({ code: 'P2025' })

      const res = await request(app)
        .delete('/api/admin/newsletters/unknown')
        .set(authHeader())
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/admin/newsletters/:id/assign', () => {
    it('assigns stories to newsletter', async () => {
      const newsletter = sampleNewsletter()
      const stories = [
        { id: 'story-1' },
        { id: 'story-2' },
      ]
      mockPrisma.newsletter.findUnique.mockResolvedValue(newsletter)
      mockPrisma.story.findMany.mockResolvedValue(stories)
      mockPrisma.newsletter.update.mockResolvedValue(
        sampleNewsletter({ storyIds: ['story-1', 'story-2'] }),
      )

      const res = await request(app)
        .post('/api/admin/newsletters/newsletter-1/assign')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body.storyIds).toEqual(['story-1', 'story-2'])
    })

    it('returns 404 for unknown newsletter', async () => {
      mockPrisma.newsletter.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/admin/newsletters/unknown/assign')
        .set(authHeader())
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/admin/newsletters/:id/generate', () => {
    it('generates newsletter content', async () => {
      const newsletter = sampleNewsletter({ selectedStoryIds: ['story-1'] })
      const story = sampleStory({
        status: 'published',
        summary: 'Test summary',
        marketingBlurb: 'Test blurb',
        relevanceReasons: 'Test reasons',
        feed: { title: 'BBC', displayTitle: 'BBC News', issue: { name: 'Science & Technology', slug: 'science-technology', parentId: null, parent: null } },
        issue: null,
      })
      mockPrisma.newsletter.findUnique.mockResolvedValue(newsletter)
      mockPrisma.story.findMany.mockResolvedValue([story])
      mockPrisma.newsletter.update.mockResolvedValue(
        sampleNewsletter({ content: 'Generated content' }),
      )

      const res = await request(app)
        .post('/api/admin/newsletters/newsletter-1/generate')
        .set(authHeader())
      expect(res.status).toBe(200)
    })

    it('returns 404 for unknown newsletter', async () => {
      mockPrisma.newsletter.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/admin/newsletters/unknown/generate')
        .set(authHeader())
      expect(res.status).toBe(404)
    })

    it('returns 400 when no stories selected', async () => {
      mockPrisma.newsletter.findUnique.mockResolvedValue(sampleNewsletter({ selectedStoryIds: [] }))

      const res = await request(app)
        .post('/api/admin/newsletters/newsletter-1/generate')
        .set(authHeader())
      expect(res.status).toBe(400)
    })
  })
})
