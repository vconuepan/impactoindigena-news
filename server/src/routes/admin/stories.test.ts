import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, sampleStory, sampleFeed, sampleIssue, TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  issue: {
    findUnique: vi.fn(),
  },
  feed: {
    findUnique: vi.fn(),
  },
  story: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  newsletter: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  podcast: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  storyCluster: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  $disconnect: vi.fn(),
  $transaction: vi.fn((args: any) => Array.isArray(args) ? Promise.all(args) : args(mockPrisma)),
}))

vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

const mockGenerateEmbeddingForContent = vi.hoisted(() => vi.fn().mockResolvedValue(null))
const mockEnsureEmbedding = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockEnsureEmbeddings = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../../services/embedding.js', () => ({
  generateEmbeddingForContent: mockGenerateEmbeddingForContent,
  generateSearchEmbedding: vi.fn(),
  ensureEmbedding: mockEnsureEmbedding,
  ensureEmbeddings: mockEnsureEmbeddings,
}))
const mockFetchStoryForEmbedding = vi.hoisted(() => vi.fn().mockResolvedValue({
  id: 'story-1', title: 'Test', titleLabel: null, summary: null, embeddingContentHash: null, status: 'selected',
}))
vi.mock('../../lib/vectors.js', () => ({
  fetchStoryForEmbedding: mockFetchStoryForEmbedding,
  saveEmbeddingTx: vi.fn(),
  searchByEmbedding: vi.fn().mockResolvedValue([]),
}))

const mockPreAssessStories = vi.hoisted(() => vi.fn())
const mockAssessStory = vi.hoisted(() => vi.fn())
const mockSelectStories = vi.hoisted(() => vi.fn())
const mockBulkPreAssess = vi.hoisted(() => vi.fn())
const mockBulkAssess = vi.hoisted(() => vi.fn())
const mockBulkSelect = vi.hoisted(() => vi.fn())

vi.mock('../../services/analysis.js', () => ({
  preAssessStories: mockPreAssessStories,
  assessStory: mockAssessStory,
  selectStories: mockSelectStories,
  bulkPreAssess: mockBulkPreAssess,
  bulkAssess: mockBulkAssess,
  bulkSelect: mockBulkSelect,
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')
const { taskRegistry } = await import('../../lib/taskRegistry.js')

const storyWithRelations = {
  ...sampleStory(),
  feed: { ...sampleFeed(), issue: sampleIssue() },
}

describe('Admin Stories API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    taskRegistry.clear()
  })

  describe('GET /api/admin/stories', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/admin/stories')
      expect(res.status).toBe(401)
    })

    it('returns paginated stories', async () => {
      mockPrisma.story.findMany.mockResolvedValue([storyWithRelations])
      mockPrisma.story.count.mockResolvedValue(1)

      const res = await request(app)
        .get('/api/admin/stories')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.total).toBe(1)
      expect(res.body.page).toBe(1)
      expect(res.body.totalPages).toBe(1)
    })

    it('excludes trashed stories by default', async () => {
      mockPrisma.story.findMany.mockResolvedValue([storyWithRelations])
      mockPrisma.story.count.mockResolvedValue(1)

      const res = await request(app)
        .get('/api/admin/stories')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { not: 'trashed' } }),
        })
      )
    })

    it('supports status filter', async () => {
      mockPrisma.story.findMany.mockResolvedValue([])
      mockPrisma.story.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/admin/stories?status=fetched')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'fetched' }),
        })
      )
    })

    it('returns all stories including trashed with status=all', async () => {
      mockPrisma.story.findMany.mockResolvedValue([])
      mockPrisma.story.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/admin/stories?status=all')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ status: expect.anything() }),
        })
      )
    })

    it('supports pagination', async () => {
      mockPrisma.story.findMany.mockResolvedValue([])
      mockPrisma.story.count.mockResolvedValue(50)

      const res = await request(app)
        .get('/api/admin/stories?page=2&pageSize=10')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body.page).toBe(2)
      expect(res.body.pageSize).toBe(10)
    })

    it('supports sorting', async () => {
      mockPrisma.story.findMany.mockResolvedValue([])
      mockPrisma.story.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/admin/stories?sort=rating_desc')
        .set(authHeader())
      expect(res.status).toBe(200)
    })

    it('rejects invalid query params', async () => {
      const res = await request(app)
        .get('/api/admin/stories?status=invalid')
        .set(authHeader())
      expect(res.status).toBe(400)
    })

    it('acepta bodyMethod para listar las notas con claves por revisar, y rechaza un método que no existe', async () => {
      mockPrisma.story.findMany.mockResolvedValue([])
      mockPrisma.story.count.mockResolvedValue(0)

      const ok = await request(app)
        .get('/api/admin/stories?bodyMethod=ia_sin_revision')
        .set(authHeader())
      expect(ok.status).toBe(200)
      expect(mockPrisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ body: { is: { method: 'ia_sin_revision' } } }) })
      )

      const mal = await request(app)
        .get('/api/admin/stories?bodyMethod=cualquiera')
        .set(authHeader())
      expect(mal.status).toBe(400)
    })
  })

  describe('GET /api/admin/stories/stats', () => {
    it('returns story counts by status', async () => {
      mockPrisma.story.groupBy.mockResolvedValue([
        { status: 'fetched', _count: { status: 10 } },
        { status: 'published', _count: { status: 5 } },
      ])

      const res = await request(app)
        .get('/api/admin/stories/stats')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body.fetched).toBe(10)
      expect(res.body.published).toBe(5)
    })
  })

  describe('GET /api/admin/stories/:id', () => {
    it('returns a single story with relations', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(storyWithRelations)

      const res = await request(app)
        .get('/api/admin/stories/story-1')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body.sourceTitle).toBe('Test Article')
      expect(res.body.feed).toBeDefined()
    })

    it('returns 404 for unknown story', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get('/api/admin/stories/unknown')
        .set(authHeader())
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/admin/stories', () => {
    it('creates a story', async () => {
      mockPrisma.feed.findUnique.mockResolvedValue(sampleFeed())
      mockPrisma.story.create.mockResolvedValue(sampleStory())

      const res = await request(app)
        .post('/api/admin/stories')
        .set(authHeader())
        .send({
          sourceUrl: 'https://example.com/article',
          sourceTitle: 'Test Article',
          sourceContent: 'Test content',
          feedId: '00000000-0000-0000-0000-000000000001',
        })
      expect(res.status).toBe(201)
    })

    it('returns 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/admin/stories')
        .set(authHeader())
        .send({})
      expect(res.status).toBe(400)
    })

    it('returns 400 when feed not found', async () => {
      mockPrisma.feed.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/admin/stories')
        .set(authHeader())
        .send({
          sourceUrl: 'https://example.com/article',
          sourceTitle: 'Test',
          sourceContent: 'Content',
          feedId: '00000000-0000-0000-0000-000000000000',
        })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Feed not found')
    })

    it('returns 409 for duplicate URL', async () => {
      mockPrisma.feed.findUnique.mockResolvedValue(sampleFeed())
      mockPrisma.story.create.mockRejectedValue({ code: 'P2002' })

      const res = await request(app)
        .post('/api/admin/stories')
        .set(authHeader())
        .send({
          sourceUrl: 'https://example.com/article',
          sourceTitle: 'Test',
          sourceContent: 'Content',
          feedId: '00000000-0000-0000-0000-000000000001',
        })
      expect(res.status).toBe(409)
    })
  })

  describe('PUT /api/admin/stories/:id', () => {
    it('updates a story', async () => {
      mockPrisma.story.update.mockResolvedValue(sampleStory({ title: 'Updated' }))

      const res = await request(app)
        .put('/api/admin/stories/story-1')
        .set(authHeader())
        .send({ title: 'Updated' })
      expect(res.status).toBe(200)
    })

    it('returns 404 for unknown story', async () => {
      mockPrisma.story.update.mockRejectedValue({ code: 'P2025' })

      const res = await request(app)
        .put('/api/admin/stories/unknown')
        .set(authHeader())
        .send({ title: 'Updated' })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/admin/stories/:id/status', () => {
    it('updates story status', async () => {
      // preparePublishData + updateStoryStatus call findUnique
      mockPrisma.story.findUnique.mockResolvedValue(sampleStory({ slug: 'existing-slug', datePublished: new Date() }))
      mockPrisma.story.update.mockResolvedValue(sampleStory({ status: 'published' }))

      const res = await request(app)
        .put('/api/admin/stories/story-1/status')
        .set(authHeader())
        .send({ status: 'published' })
      expect(res.status).toBe(200)
    })

    it('rejects invalid status', async () => {
      const res = await request(app)
        .put('/api/admin/stories/story-1/status')
        .set(authHeader())
        .send({ status: 'invalid' })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/admin/stories/bulk-status', () => {
    it('bulk updates story statuses', async () => {
      // findMany for stories needing slugs
      mockPrisma.story.findMany.mockResolvedValueOnce([])
      mockPrisma.story.updateMany.mockResolvedValueOnce({ count: 1 })
      mockPrisma.story.updateMany.mockResolvedValueOnce({ count: 2 })

      const res = await request(app)
        .post('/api/admin/stories/bulk-status')
        .set(authHeader())
        .send({
          ids: [
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000003',
          ],
          status: 'published',
        })
      expect(res.status).toBe(200)
      expect(res.body.updated).toBe(3)
    })

    it('rejects empty ids array', async () => {
      const res = await request(app)
        .post('/api/admin/stories/bulk-status')
        .set(authHeader())
        .send({ ids: [], status: 'published' })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/admin/stories/preassess', () => {
    it('pre-assesses stories with given IDs', async () => {
      mockPreAssessStories.mockResolvedValue([
        { storyId: '00000000-0000-0000-0000-000000000001', rating: 4, emotionTag: 'calm' },
      ])

      const res = await request(app)
        .post('/api/admin/stories/preassess')
        .set(authHeader())
        .send({ storyIds: ['00000000-0000-0000-0000-000000000001'] })
      expect(res.status).toBe(200)
      expect(res.body.processed).toBe(1)
      expect(res.body.results[0].rating).toBe(4)
    })

    it('pre-assesses all fetched stories when no IDs given', async () => {
      mockPrisma.story.findMany.mockResolvedValue([
        { ...sampleStory({ id: 'story-1' }), feed: { ...sampleFeed(), issue: sampleIssue() } },
      ])
      mockPreAssessStories.mockResolvedValue([
        { storyId: 'story-1', rating: 3, emotionTag: 'calm' },
      ])

      const res = await request(app)
        .post('/api/admin/stories/preassess')
        .set(authHeader())
        .send({})
      expect(res.status).toBe(200)
      expect(res.body.processed).toBe(1)
    })

    it('returns empty results when no fetched stories', async () => {
      mockPrisma.story.findMany.mockResolvedValue([])

      const res = await request(app)
        .post('/api/admin/stories/preassess')
        .set(authHeader())
        .send({})
      expect(res.status).toBe(200)
      expect(res.body.processed).toBe(0)
    })
  })

  describe('POST /api/admin/stories/:id/assess', () => {
    it('assesses a single story', async () => {
      mockAssessStory.mockResolvedValue(undefined)
      mockPrisma.story.findUnique.mockResolvedValue(storyWithRelations)

      const res = await request(app)
        .post('/api/admin/stories/story-1/assess')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(mockAssessStory).toHaveBeenCalledWith('story-1')
    })

    it('returns 404 when story not found', async () => {
      mockAssessStory.mockRejectedValue(new Error('Story not found'))

      const res = await request(app)
        .post('/api/admin/stories/unknown/assess')
        .set(authHeader())
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/admin/stories/select', () => {
    it('selects stories from given IDs', async () => {
      mockSelectStories.mockResolvedValue({
        selected: ['00000000-0000-0000-0000-000000000001'],
        rejected: ['00000000-0000-0000-0000-000000000002'],
      })

      const res = await request(app)
        .post('/api/admin/stories/select')
        .set(authHeader())
        .send({
          storyIds: [
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
          ],
        })
      expect(res.status).toBe(200)
      expect(res.body.selected).toHaveLength(1)
      expect(res.body.rejected).toHaveLength(1)
    })

    it('rejects empty storyIds', async () => {
      const res = await request(app)
        .post('/api/admin/stories/select')
        .set(authHeader())
        .send({ storyIds: [] })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/admin/stories/:id/publish', () => {
    it('publishes a story', async () => {
      // preparePublishData calls findUnique
      mockPrisma.story.findUnique.mockResolvedValue(sampleStory({ slug: 'existing-slug', datePublished: new Date() }))
      mockPrisma.story.update.mockResolvedValue(sampleStory({ status: 'published' }))

      const res = await request(app)
        .post('/api/admin/stories/story-1/publish')
        .set(authHeader())
      expect(res.status).toBe(200)
    })

    it('returns 404 for unknown story', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(null)
      mockPrisma.story.update.mockRejectedValue({ code: 'P2025' })

      const res = await request(app)
        .post('/api/admin/stories/unknown/publish')
        .set(authHeader())
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/admin/stories/:id/reject', () => {
    it('rejects a story', async () => {
      mockPrisma.story.update.mockResolvedValue(sampleStory({ status: 'rejected' }))

      const res = await request(app)
        .post('/api/admin/stories/story-1/reject')
        .set(authHeader())
      expect(res.status).toBe(200)
    })

    it('returns 404 for unknown story', async () => {
      mockPrisma.story.update.mockRejectedValue({ code: 'P2025' })

      const res = await request(app)
        .post('/api/admin/stories/unknown/reject')
        .set(authHeader())
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/admin/stories/:id', () => {
    it('deletes a story', async () => {
      mockPrisma.story.delete.mockResolvedValue(sampleStory())
      mockPrisma.newsletter.findMany.mockResolvedValue([])
      mockPrisma.podcast.findMany.mockResolvedValue([])

      const res = await request(app)
        .delete('/api/admin/stories/story-1')
        .set(authHeader())
      expect(res.status).toBe(204)
    })

    it('returns 404 for unknown story', async () => {
      mockPrisma.story.delete.mockRejectedValue({ code: 'P2025' })

      const res = await request(app)
        .delete('/api/admin/stories/unknown')
        .set(authHeader())
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/admin/stories/bulk-preassess', () => {
    it('returns 202 with taskId', async () => {
      mockBulkPreAssess.mockResolvedValue(undefined)

      const res = await request(app)
        .post('/api/admin/stories/bulk-preassess')
        .set(authHeader())
        .send({ storyIds: ['00000000-0000-0000-0000-000000000001'] })
      expect(res.status).toBe(202)
      expect(res.body.taskId).toBeTruthy()
      expect(typeof res.body.taskId).toBe('string')
    })

    it('calls bulkPreAssess with storyIds and taskId', async () => {
      mockBulkPreAssess.mockResolvedValue(undefined)
      const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002']

      const res = await request(app)
        .post('/api/admin/stories/bulk-preassess')
        .set(authHeader())
        .send({ storyIds: ids })
      expect(res.status).toBe(202)
      expect(mockBulkPreAssess).toHaveBeenCalledWith(ids, res.body.taskId)
    })

    it('rejects empty storyIds', async () => {
      const res = await request(app)
        .post('/api/admin/stories/bulk-preassess')
        .set(authHeader())
        .send({ storyIds: [] })
      expect(res.status).toBe(400)
    })

    it('rejects invalid UUIDs', async () => {
      const res = await request(app)
        .post('/api/admin/stories/bulk-preassess')
        .set(authHeader())
        .send({ storyIds: ['not-a-uuid'] })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/admin/stories/bulk-assess', () => {
    it('returns 202 with taskId', async () => {
      mockBulkAssess.mockResolvedValue(undefined)

      const res = await request(app)
        .post('/api/admin/stories/bulk-assess')
        .set(authHeader())
        .send({ storyIds: ['00000000-0000-0000-0000-000000000001'] })
      expect(res.status).toBe(202)
      expect(res.body.taskId).toBeTruthy()
    })

    it('rejects empty storyIds', async () => {
      const res = await request(app)
        .post('/api/admin/stories/bulk-assess')
        .set(authHeader())
        .send({ storyIds: [] })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/admin/stories/bulk-select', () => {
    it('returns 202 with taskId', async () => {
      mockBulkSelect.mockResolvedValue(undefined)

      const res = await request(app)
        .post('/api/admin/stories/bulk-select')
        .set(authHeader())
        .send({ storyIds: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'] })
      expect(res.status).toBe(202)
      expect(res.body.taskId).toBeTruthy()
    })

    it('rejects empty storyIds', async () => {
      const res = await request(app)
        .post('/api/admin/stories/bulk-select')
        .set(authHeader())
        .send({ storyIds: [] })
      expect(res.status).toBe(400)
    })

    it('rejects single storyId (minimum 2 required)', async () => {
      const res = await request(app)
        .post('/api/admin/stories/bulk-select')
        .set(authHeader())
        .send({ storyIds: ['00000000-0000-0000-0000-000000000001'] })
      expect(res.status).toBe(400)
    })
  })

  describe('bulk endpoint duplicate protection', () => {
    it('returns 409 when all story IDs are already processing', async () => {
      mockBulkPreAssess.mockResolvedValue(undefined)
      const ids = ['00000000-0000-0000-0000-000000000001']

      // First request: creates task
      await request(app)
        .post('/api/admin/stories/bulk-preassess')
        .set(authHeader())
        .send({ storyIds: ids })

      // Second request: same IDs, should be rejected
      const res = await request(app)
        .post('/api/admin/stories/bulk-preassess')
        .set(authHeader())
        .send({ storyIds: ids })
      expect(res.status).toBe(409)
      expect(res.body.error).toContain('already being processed')
      expect(res.body.skipped).toEqual(ids)
    })

    it('filters out processing IDs and proceeds with remaining', async () => {
      mockBulkAssess.mockResolvedValue(undefined)
      const id1 = '00000000-0000-0000-0000-000000000001'
      const id2 = '00000000-0000-0000-0000-000000000002'

      // Create task with id1
      await request(app)
        .post('/api/admin/stories/bulk-assess')
        .set(authHeader())
        .send({ storyIds: [id1] })

      // Submit both — id1 should be skipped, id2 should proceed
      const res = await request(app)
        .post('/api/admin/stories/bulk-assess')
        .set(authHeader())
        .send({ storyIds: [id1, id2] })
      expect(res.status).toBe(202)
      expect(res.body.taskId).toBeTruthy()
      expect(res.body.skipped).toEqual([id1])
      expect(mockBulkAssess).toHaveBeenLastCalledWith([id2], res.body.taskId)
    })
  })

  describe('GET /api/admin/stories/tasks/:taskId', () => {
    it('returns task state for a known task', async () => {
      // Create a task via the bulk endpoint first
      mockBulkAssess.mockResolvedValue(undefined)

      const createRes = await request(app)
        .post('/api/admin/stories/bulk-assess')
        .set(authHeader())
        .send({ storyIds: ['00000000-0000-0000-0000-000000000001'] })
      const taskId = createRes.body.taskId

      const res = await request(app)
        .get(`/api/admin/stories/tasks/${taskId}`)
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(taskId)
      expect(res.body.type).toBe('assess')
      expect(res.body.status).toBe('running')
      expect(res.body.total).toBe(1)
      expect(res.body.storyIds).toEqual(['00000000-0000-0000-0000-000000000001'])
    })

    it('returns 404 for unknown task', async () => {
      const res = await request(app)
        .get('/api/admin/stories/tasks/nonexistent')
        .set(authHeader())
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/admin/stories/processing', () => {
    it('returns processing story IDs', async () => {
      mockBulkAssess.mockResolvedValue(undefined)

      await request(app)
        .post('/api/admin/stories/bulk-assess')
        .set(authHeader())
        .send({ storyIds: ['00000000-0000-0000-0000-000000000001'] })

      const res = await request(app)
        .get('/api/admin/stories/processing')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body.storyIds).toContain('00000000-0000-0000-0000-000000000001')
    })
  })

  describe('POST /api/admin/stories/:id/dissolve-cluster', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/admin/stories/story-1/dissolve-cluster')
      expect(res.status).toBe(401)
    })

    it('returns 400 when story is not in a cluster', async () => {
      mockPrisma.story.findUnique.mockResolvedValue({ clusterId: null })

      const res = await request(app)
        .post('/api/admin/stories/story-1/dissolve-cluster')
        .set(authHeader())
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Story is not in a cluster')
    })

    it('returns 200 and the updated story after dissolution', async () => {
      // dissolveCluster calls: findUnique (for clusterId), updateMany x2, storyCluster.delete
      mockPrisma.story.findUnique
        .mockResolvedValueOnce({ clusterId: 'cluster-1' }) // dissolveCluster lookup
        .mockResolvedValueOnce(storyWithRelations) // getStoryById after dissolution
      mockPrisma.story.updateMany.mockResolvedValue({ count: 2 })
      mockPrisma.storyCluster.delete.mockResolvedValue({})

      const res = await request(app)
        .post('/api/admin/stories/story-1/dissolve-cluster')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body.sourceTitle).toBe('Test Article')
    })
  })
})
