import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockService = vi.hoisted(() => ({
  listPosts: vi.fn(),
  getPostById: vi.fn(),
  generateDraft: vi.fn(),
  updateDraft: vi.fn(),
  publishPost: vi.fn(),
  deletePostRecord: vi.fn(),
  updateMetrics: vi.fn(),
}))

const mockLib = vi.hoisted(() => ({
  introspectToken: vi.fn(),
  isFacebookConfigured: vi.fn(() => true),
  isFacebookAppConfigured: vi.fn(() => true),
}))

vi.mock('../../services/facebook.js', () => mockService)
vi.mock('../../lib/facebook.js', () => mockLib)

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

const STORY_ID = '22222222-2222-4222-8222-222222222222'

describe('Admin Facebook API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isFacebookConfigured.mockReturnValue(true)
    mockLib.isFacebookAppConfigured.mockReturnValue(true)
  })

  describe('auth', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/admin/facebook/posts')
      expect(res.status).toBe(401)
    })
  })

  describe('GET /token/status', () => {
    it('reports a healthy token', async () => {
      mockLib.introspectToken.mockResolvedValue({
        isValid: true,
        expiresAt: new Date('2026-10-01T00:00:00Z'),
        daysLeft: 40,
        scopes: ['pages_manage_posts'],
        source: 'db',
      })

      const res = await request(app).get('/api/admin/facebook/token/status').set(authHeader())

      expect(res.status).toBe(200)
      expect(res.body.isValid).toBe(true)
      expect(res.body.daysLeft).toBe(40)
      expect(res.body.neverExpires).toBe(false)
    })

    it('flags a token with no expiry as never-expiring', async () => {
      mockLib.introspectToken.mockResolvedValue({
        isValid: true,
        expiresAt: null,
        daysLeft: null,
        scopes: [],
        source: 'env',
      })

      const res = await request(app).get('/api/admin/facebook/token/status').set(authHeader())

      expect(res.body.neverExpires).toBe(true)
    })

    // La tarjeta tiene que poder renderizar justo cuando el token está roto, así
    // que una introspección que falla se responde 200 con isValid=false.
    it('still answers 200 when introspection fails', async () => {
      mockLib.introspectToken.mockRejectedValue(new Error('app secret rotated'))

      const res = await request(app).get('/api/admin/facebook/token/status').set(authHeader())

      expect(res.status).toBe(200)
      expect(res.body.isValid).toBe(false)
      expect(res.body.error).toMatch(/app secret rotated/)
    })

    it('reports missing app credentials without introspecting', async () => {
      mockLib.isFacebookAppConfigured.mockReturnValue(false)

      const res = await request(app).get('/api/admin/facebook/token/status').set(authHeader())

      expect(res.body.appConfigured).toBe(false)
      expect(mockLib.introspectToken).not.toHaveBeenCalled()
    })
  })

  describe('GET /posts', () => {
    it('lists posts', async () => {
      mockService.listPosts.mockResolvedValue({ posts: [{ id: 'p1' }], total: 1, page: 1, limit: 20 })

      const res = await request(app).get('/api/admin/facebook/posts').set(authHeader())

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
    })

    it('rejects an unknown status filter', async () => {
      const res = await request(app).get('/api/admin/facebook/posts?status=bogus').set(authHeader())

      expect(res.status).toBe(400)
      expect(mockService.listPosts).not.toHaveBeenCalled()
    })
  })

  describe('POST /posts/generate', () => {
    it('creates a draft', async () => {
      mockService.generateDraft.mockResolvedValue({ id: 'p1', status: 'draft' })

      const res = await request(app)
        .post('/api/admin/facebook/posts/generate')
        .set(authHeader())
        .send({ storyId: STORY_ID })

      expect(res.status).toBe(201)
      expect(mockService.generateDraft).toHaveBeenCalledWith(STORY_ID)
    })

    it('rejects a non-uuid storyId', async () => {
      const res = await request(app)
        .post('/api/admin/facebook/posts/generate')
        .set(authHeader())
        .send({ storyId: 'nope' })

      expect(res.status).toBe(400)
      expect(mockService.generateDraft).not.toHaveBeenCalled()
    })

    it('maps a duplicate post to 400', async () => {
      mockService.generateDraft.mockRejectedValue(new Error('Story already has a Facebook post'))

      const res = await request(app)
        .post('/api/admin/facebook/posts/generate')
        .set(authHeader())
        .send({ storyId: STORY_ID })

      expect(res.status).toBe(400)
    })
  })

  describe('PUT /posts/:id', () => {
    it('updates the draft text', async () => {
      mockService.updateDraft.mockResolvedValue({ id: 'p1', postText: 'editado' })

      const res = await request(app)
        .put('/api/admin/facebook/posts/p1')
        .set(authHeader())
        .send({ postText: 'editado' })

      expect(res.status).toBe(200)
      expect(mockService.updateDraft).toHaveBeenCalledWith('p1', 'editado')
    })

    it('rejects empty text', async () => {
      const res = await request(app)
        .put('/api/admin/facebook/posts/p1')
        .set(authHeader())
        .send({ postText: '' })

      expect(res.status).toBe(400)
      expect(mockService.updateDraft).not.toHaveBeenCalled()
    })
  })

  describe('POST /posts/:id/publish', () => {
    it('publishes a draft', async () => {
      mockService.publishPost.mockResolvedValue({ id: 'p1', status: 'published' })

      const res = await request(app).post('/api/admin/facebook/posts/p1/publish').set(authHeader())

      expect(res.status).toBe(200)
      expect(mockService.publishPost).toHaveBeenCalledWith('p1')
    })

    it('maps missing credentials to 400', async () => {
      mockService.publishPost.mockRejectedValue(new Error('Facebook credentials not configured'))

      const res = await request(app).post('/api/admin/facebook/posts/p1/publish').set(authHeader())

      expect(res.status).toBe(400)
    })

    it('maps an unknown failure to 500', async () => {
      mockService.publishPost.mockRejectedValue(new Error('boom'))

      const res = await request(app).post('/api/admin/facebook/posts/p1/publish').set(authHeader())

      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /posts/:id', () => {
    it('deletes the record', async () => {
      mockService.deletePostRecord.mockResolvedValue(undefined)

      const res = await request(app).delete('/api/admin/facebook/posts/p1').set(authHeader())

      expect(res.status).toBe(204)
    })

    it('returns 404 for a missing post', async () => {
      mockService.deletePostRecord.mockRejectedValue(new Error('Post not found'))

      const res = await request(app).delete('/api/admin/facebook/posts/p1').set(authHeader())

      expect(res.status).toBe(404)
    })
  })
})
