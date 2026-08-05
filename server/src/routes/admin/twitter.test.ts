import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockTwitterService = vi.hoisted(() => ({
  listPosts: vi.fn(),
  getPostById: vi.fn(),
  generateDraft: vi.fn(),
  updateDraft: vi.fn(),
  publishPost: vi.fn(),
  deletePostRecord: vi.fn(),
  updateMetrics: vi.fn(),
}))

vi.mock('../../services/twitter.js', () => mockTwitterService)

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

const STORY_ID = '11111111-1111-4111-8111-111111111111'

describe('Admin Twitter API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('auth', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/admin/twitter/posts')
      expect(res.status).toBe(401)
    })

    it('returns 401 on publish without auth', async () => {
      const res = await request(app).post('/api/admin/twitter/posts/abc/publish')
      expect(res.status).toBe(401)
    })
  })

  describe('GET /posts', () => {
    it('lists posts', async () => {
      mockTwitterService.listPosts.mockResolvedValue({ posts: [{ id: 'p1' }], total: 1, page: 1, limit: 20 })

      const res = await request(app).get('/api/admin/twitter/posts').set(authHeader())

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
    })

    it('rejects an unknown status filter', async () => {
      const res = await request(app).get('/api/admin/twitter/posts?status=bogus').set(authHeader())

      expect(res.status).toBe(400)
      expect(mockTwitterService.listPosts).not.toHaveBeenCalled()
    })
  })

  describe('GET /posts/:id', () => {
    it('returns 404 for a missing post', async () => {
      mockTwitterService.getPostById.mockResolvedValue(null)

      const res = await request(app).get('/api/admin/twitter/posts/p1').set(authHeader())

      expect(res.status).toBe(404)
    })
  })

  describe('POST /posts/generate', () => {
    it('creates a draft', async () => {
      mockTwitterService.generateDraft.mockResolvedValue({ id: 'p1', status: 'draft' })

      const res = await request(app)
        .post('/api/admin/twitter/posts/generate')
        .set(authHeader())
        .send({ storyId: STORY_ID })

      expect(res.status).toBe(201)
      expect(mockTwitterService.generateDraft).toHaveBeenCalledWith(STORY_ID)
    })

    it('rejects a non-uuid storyId', async () => {
      const res = await request(app)
        .post('/api/admin/twitter/posts/generate')
        .set(authHeader())
        .send({ storyId: 'not-a-uuid' })

      expect(res.status).toBe(400)
      expect(mockTwitterService.generateDraft).not.toHaveBeenCalled()
    })

    it('maps a duplicate post to 400', async () => {
      mockTwitterService.generateDraft.mockRejectedValue(new Error('Story already has a Twitter post'))

      const res = await request(app)
        .post('/api/admin/twitter/posts/generate')
        .set(authHeader())
        .send({ storyId: STORY_ID })

      expect(res.status).toBe(400)
    })
  })

  describe('PUT /posts/:id', () => {
    it('updates the draft text', async () => {
      mockTwitterService.updateDraft.mockResolvedValue({ id: 'p1', postText: 'edited' })

      const res = await request(app)
        .put('/api/admin/twitter/posts/p1')
        .set(authHeader())
        .send({ postText: 'edited' })

      expect(res.status).toBe(200)
      expect(mockTwitterService.updateDraft).toHaveBeenCalledWith('p1', 'edited')
    })

    it('rejects empty text', async () => {
      const res = await request(app)
        .put('/api/admin/twitter/posts/p1')
        .set(authHeader())
        .send({ postText: '' })

      expect(res.status).toBe(400)
      expect(mockTwitterService.updateDraft).not.toHaveBeenCalled()
    })

    // Twitter only publishes from `draft`, so editing must refuse the same
    // statuses publish refuses. Surfacing it as 400 keeps the panel honest.
    it('maps a non-draft edit to 400', async () => {
      mockTwitterService.updateDraft.mockRejectedValue(new Error('Can only edit draft posts'))

      const res = await request(app)
        .put('/api/admin/twitter/posts/p1')
        .set(authHeader())
        .send({ postText: 'edited' })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /posts/:id/publish', () => {
    it('publishes a draft', async () => {
      mockTwitterService.publishPost.mockResolvedValue({ id: 'p1', status: 'published' })

      const res = await request(app).post('/api/admin/twitter/posts/p1/publish').set(authHeader())

      expect(res.status).toBe(200)
      expect(mockTwitterService.publishPost).toHaveBeenCalledWith('p1')
    })

    it('maps missing credentials to 400', async () => {
      mockTwitterService.publishPost.mockRejectedValue(new Error('Twitter credentials not configured'))

      const res = await request(app).post('/api/admin/twitter/posts/p1/publish').set(authHeader())

      expect(res.status).toBe(400)
    })

    it('maps an unknown failure to 500', async () => {
      mockTwitterService.publishPost.mockRejectedValue(new Error('boom'))

      const res = await request(app).post('/api/admin/twitter/posts/p1/publish').set(authHeader())

      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /posts/:id', () => {
    it('deletes the record', async () => {
      mockTwitterService.deletePostRecord.mockResolvedValue(undefined)

      const res = await request(app).delete('/api/admin/twitter/posts/p1').set(authHeader())

      expect(res.status).toBe(204)
    })

    it('returns 404 for a missing post', async () => {
      mockTwitterService.deletePostRecord.mockRejectedValue(new Error('Post not found'))

      const res = await request(app).delete('/api/admin/twitter/posts/p1').set(authHeader())

      expect(res.status).toBe(404)
    })
  })

  describe('POST /metrics/refresh', () => {
    it('triggers a refresh', async () => {
      mockTwitterService.updateMetrics.mockResolvedValue(undefined)

      const res = await request(app).post('/api/admin/twitter/metrics/refresh').set(authHeader())

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })
})
