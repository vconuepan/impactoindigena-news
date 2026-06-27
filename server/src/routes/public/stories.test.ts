import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  story: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))
// Avoid network (embedding API) and raw SQL (pgvector) in the semantic search leg
const mockEmbedding = vi.hoisted(() => ({
  generateSearchEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}))
vi.mock('../../services/embedding.js', () => ({
  generateSearchEmbedding: mockEmbedding.generateSearchEmbedding,
  generateEmbeddingForContent: vi.fn(),
  ensureEmbedding: vi.fn(),
  ensureEmbeddings: vi.fn(),
}))
const mockVectors = vi.hoisted(() => ({ searchByEmbedding: vi.fn().mockResolvedValue([{ id: 'story-1' }]) }))
vi.mock('../../lib/vectors.js', () => ({
  searchByEmbedding: mockVectors.searchByEmbedding,
  fetchStoryForEmbedding: vi.fn(),
  saveEmbeddingTx: vi.fn(),
}))
const mockNotify = vi.hoisted(() => ({ notifyJobFailure: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../lib/notify.js', () => ({ notifyJobFailure: mockNotify.notifyJobFailure }))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

const publicStory = {
  id: 'story-1',
  sourceUrl: 'https://example.com/article',
  title: 'Published Article',
  datePublished: new Date('2024-01-15'),
  dateCrawled: new Date('2024-01-14'),
  status: 'published',
  relevancePre: 7,
  relevance: 9,
  emotionTag: 'uplifting',
  summary: 'A test summary',
  quote: 'A notable quote',
  marketingBlurb: 'Read this article',
  relevanceReasons: 'Very relevant',
  antifactors: 'None',
  feed: {
    title: 'Test Feed',
    issue: { name: 'AI & Technology', slug: 'ai-technology' },
  },
}

describe('Public Stories API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/stories', () => {
    it('returns published stories without auth', async () => {
      mockPrisma.story.findMany.mockResolvedValue([publicStory])
      mockPrisma.story.count.mockResolvedValue(1)

      const res = await request(app).get('/api/stories')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].title).toBe('Published Article')
      expect(res.body.total).toBe(1)
      expect(res.body.page).toBe(1)
    })

    it('supports issueSlug filter', async () => {
      mockPrisma.story.findMany.mockResolvedValue([])
      mockPrisma.story.count.mockResolvedValue(0)

      const res = await request(app).get('/api/stories?issueSlug=ai-technology')
      expect(res.status).toBe(200)
    })

    it('supports search filter', async () => {
      mockPrisma.story.findMany.mockResolvedValue([publicStory])
      mockPrisma.story.count.mockResolvedValue(1)

      const res = await request(app).get('/api/stories?search=Published')
      expect(res.status).toBe(200)
    })

    it('searches sourceTitle in the text leg of hybrid search', async () => {
      mockPrisma.story.findMany.mockResolvedValue([publicStory])

      const res = await request(app).get('/api/stories?search=mapuche')
      expect(res.status).toBe(200)
      expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({ sourceTitle: { contains: 'mapuche', mode: 'insensitive' } }),
                ]),
              }),
            ]),
          }),
        }),
      )
    })

    it('alerts and falls back to text-only when semantic search fails', async () => {
      mockEmbedding.generateSearchEmbedding.mockRejectedValueOnce(new Error('Azure 401 Unauthorized'))
      mockPrisma.story.findMany.mockResolvedValue([publicStory])

      // Unique query to avoid the module-level RRF cache from earlier tests
      const res = await request(app).get('/api/stories?search=wallmapu')
      expect(res.status).toBe(200) // text leg still serves results
      expect(mockNotify.notifyJobFailure).toHaveBeenCalledWith('semantic_search', expect.stringContaining('Azure 401'))
    })

    it('rejects search queries longer than 200 characters', async () => {
      const longQuery = 'a'.repeat(201)
      const res = await request(app).get(`/api/stories?search=${longQuery}`)
      expect(res.status).toBe(400)
    })

    it('filters by date range without a search term (dateTo inclusive)', async () => {
      mockPrisma.story.findMany.mockResolvedValue([publicStory])
      mockPrisma.story.count.mockResolvedValue(1)

      const res = await request(app).get('/api/stories?dateFrom=2026-06-13&dateTo=2026-06-13')
      expect(res.status).toBe(200)
      expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'published',
            AND: expect.arrayContaining([
              expect.objectContaining({
                datePublished: {
                  gte: new Date('2026-06-13T00:00:00.000Z'),
                  lt: new Date('2026-06-14T00:00:00.000Z'),
                },
              }),
            ]),
          }),
        }),
      )
    })

    it('applies the date range to the text leg of hybrid search', async () => {
      mockPrisma.story.findMany.mockResolvedValue([publicStory])

      const res = await request(app).get('/api/stories?search=mapuche&dateFrom=2026-06-13&dateTo=2026-06-13')
      expect(res.status).toBe(200)
      // The text-search leg must constrain by datePublished too
      expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'published',
            AND: expect.arrayContaining([
              expect.objectContaining({
                datePublished: {
                  gte: new Date('2026-06-13T00:00:00.000Z'),
                  lt: new Date('2026-06-14T00:00:00.000Z'),
                },
              }),
            ]),
          }),
        }),
      )
      // And the semantic leg receives a non-empty dateFilter
      expect(mockVectors.searchByEmbedding).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dateFilter: expect.anything() }),
      )
    })

    it('rejects invalid date format', async () => {
      const res = await request(app).get('/api/stories?dateFrom=13-06-2026')
      expect(res.status).toBe(400)
    })

    it('supports pagination', async () => {
      mockPrisma.story.findMany.mockResolvedValue([])
      mockPrisma.story.count.mockResolvedValue(50)

      const res = await request(app).get('/api/stories?page=2&pageSize=10')
      expect(res.status).toBe(200)
      expect(res.body.page).toBe(2)
      expect(res.body.pageSize).toBe(10)
    })

    it('ignores positivity param (filtering is client-side)', async () => {
      mockPrisma.story.findMany.mockResolvedValue([publicStory])
      mockPrisma.story.count.mockResolvedValue(1)

      const res = await request(app).get('/api/stories?positivity=100')
      // Should still return all stories, positivity is not a server concern
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
    })

    it('does not expose internal AI fields', async () => {
      mockPrisma.story.findMany.mockResolvedValue([publicStory])
      mockPrisma.story.count.mockResolvedValue(1)

      const res = await request(app).get('/api/stories')
      expect(res.status).toBe(200)
      // These internal fields should not be present
      expect(res.body.data[0].relevanceCalculation).toBeUndefined()
      expect(res.body.data[0].sourceContent).toBeUndefined()
    })
  })

  describe('GET /api/stories/:id', () => {
    it('returns a single published story', async () => {
      mockPrisma.story.findFirst.mockResolvedValue(publicStory)

      const res = await request(app).get('/api/stories/story-1')
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Published Article')
      expect(res.body.feed).toBeDefined()
    })

    it('returns 404 for non-published story', async () => {
      mockPrisma.story.findFirst.mockResolvedValue(null)

      const res = await request(app).get('/api/stories/not-published')
      expect(res.status).toBe(404)
    })
  })
})
