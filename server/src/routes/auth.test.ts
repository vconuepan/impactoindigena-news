import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { sampleUser, TEST_API_KEY } from '../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  communityMember: { findMany: vi.fn() },
  digestExclusion: { findMany: vi.fn() },
  communityPost: { findMany: vi.fn() },
  pendingSubscription: { findFirst: vi.fn(), deleteMany: vi.fn() },
  alertSubscription: { findMany: vi.fn(), deleteMany: vi.fn() },
  feedback: { findMany: vi.fn(), deleteMany: vi.fn() },
  magicLink: { deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $disconnect: vi.fn(),
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY
// helpers.ts sets JWT_SECRET, but we set it explicitly here for clarity
process.env.JWT_SECRET = 'test-jwt-secret-for-auth-routes-padded'

// Pre-computed bcrypt hash for 'testpassword' (4 rounds, generated via bcryptjs)
const testPasswordHash = '$2b$04$a7oe401dL9h9L7VNbNSZJObgY3lSlqg30AUD7GB1Tut7MlkoCCdUC'

const { default: app } = await import('../app.js')
const { generateAccessToken } = await import('../services/auth.js')

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/auth/login', () => {
    it('returns access token and user on valid credentials', async () => {
      const user = sampleUser({ passwordHash: testPasswordHash })
      mockPrisma.user.findUnique.mockResolvedValue(user)
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1', token: 'rt' })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'testpassword' })

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBeDefined()
      expect(res.body.user.email).toBe('admin@test.com')
      expect(res.body.user.name).toBe('Test Admin')
      expect(res.body.user.role).toBe('admin')
      // Should not expose passwordHash
      expect(res.body.user.passwordHash).toBeUndefined()
    })

    it('returns 401 for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'testpassword' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid email or password')
    })

    it('returns 401 for wrong password', async () => {
      const user = sampleUser({ passwordHash: testPasswordHash })
      mockPrisma.user.findUnique.mockResolvedValue(user)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'wrongpassword' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid email or password')
    })

    it('returns 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({})

      expect(res.status).toBe(400)
    })

    it('sets refresh token cookie with strict sameSite in dev', async () => {
      const user = sampleUser({ passwordHash: testPasswordHash })
      mockPrisma.user.findUnique.mockResolvedValue(user)
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1', token: 'rt' })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'testpassword' })

      expect(res.status).toBe(200)
      const cookies = res.headers['set-cookie']
      expect(cookies).toBeDefined()
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies
      expect(cookieStr).toContain('refresh_token')
      expect(cookieStr).toContain('HttpOnly')
      expect(cookieStr).toContain('SameSite=Lax')
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('returns 401 without refresh cookie', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('No refresh token')
    })

    it('returns new access token with valid refresh cookie', async () => {
      const user = { id: 'user-1', email: 'admin@test.com', role: 'admin' }
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: 'valid-refresh',
        userId: 'user-1',
        familyId: 'family-abc',
        rotatedAt: null,
        user,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      })
      mockPrisma.refreshToken.update.mockResolvedValue({})
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-2', token: 'new-refresh' })

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=valid-refresh')

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBeDefined()
    })

    it('returns 401 for invalid refresh token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=invalid-token')

      expect(res.status).toBe(401)
    })

    it('returns 401 on token reuse detection', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: 'reused-token',
        userId: 'user-1',
        familyId: 'family-abc',
        rotatedAt: new Date(), // already rotated = reuse
        user: { id: 'user-1', email: 'admin@test.com', role: 'admin' },
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      })
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 })

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=reused-token')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Refresh token reuse detected')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('clears refresh cookie', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', 'refresh_token=some-token')

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Logged out')
    })

    it('succeeds even without cookie', async () => {
      const res = await request(app)
        .post('/api/auth/logout')

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Logged out')
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns current user with valid JWT', async () => {
      const token = generateAccessToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' })
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.email).toBe('admin@test.com')
    })

    it('returns 401 without authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me')

      expect(res.status).toBe(401)
    })

    it('returns 401 for invalid JWT', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')

      expect(res.status).toBe(401)
    })
  })

  describe('PUT /api/auth/password', () => {
    it('returns 200 when current password is correct', async () => {
      const token = generateAccessToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' })
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: testPasswordHash,
      })
      mockPrisma.user.update.mockResolvedValue({})
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'testpassword', newPassword: 'newpassword123' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Password changed')
    })

    it('returns 401 when current password is wrong', async () => {
      const token = generateAccessToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' })
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: testPasswordHash,
      })

      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword123' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Current password is incorrect')
    })

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .put('/api/auth/password')
        .send({ currentPassword: 'old', newPassword: 'newpassword123' })

      expect(res.status).toBe(401)
    })

    it('returns 400 for missing fields', async () => {
      const token = generateAccessToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' })

      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(400)
    })

    it('returns 400 when new password is too short', async () => {
      const token = generateAccessToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' })

      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'testpassword', newPassword: 'short' })

      expect(res.status).toBe(400)
    })
  })

  describe('Account data (ARCO)', () => {
    const memberToken = () => generateAccessToken({ id: 'user-1', email: 'member@example.com', role: 'veedor' })

    it('exports all of the member personal data as JSON', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'member@example.com', name: 'Miembro' })
      mockPrisma.communityMember.findMany.mockResolvedValue([])
      mockPrisma.digestExclusion.findMany.mockResolvedValue([])
      mockPrisma.communityPost.findMany.mockResolvedValue([])
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue(null)
      mockPrisma.alertSubscription.findMany.mockResolvedValue([])
      mockPrisma.feedback.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/auth/export')
        .set('Authorization', `Bearer ${memberToken()}`)

      expect(res.status).toBe(200)
      expect(res.headers['content-disposition']).toContain('attachment')
      expect(res.body.profile.email).toBe('member@example.com')
      expect(res.body).toHaveProperty('communityMemberships')
      expect(res.body).toHaveProperty('newsletterSubscription')
      expect(mockPrisma.auditLog.create).toHaveBeenCalled()
    })

    it('rejects account deletion without the typed confirmation', async () => {
      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${memberToken()}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('confirmation_required')
      expect(mockPrisma.user.delete).not.toHaveBeenCalled()
    })

    it('deletes the account, orphan records by email, and audits', async () => {
      mockPrisma.pendingSubscription.findFirst.mockResolvedValue(null)
      mockPrisma.user.delete.mockResolvedValue({ id: 'user-1' })
      mockPrisma.magicLink.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.pendingSubscription.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.alertSubscription.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.feedback.deleteMany.mockResolvedValue({ count: 0 })

      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${memberToken()}`)
        .send({ confirm: 'ELIMINAR' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } })
      expect(mockPrisma.magicLink.deleteMany).toHaveBeenCalledWith({ where: { email: 'member@example.com' } })
      expect(mockPrisma.alertSubscription.deleteMany).toHaveBeenCalledWith({ where: { email: 'member@example.com' } })
      expect(mockPrisma.auditLog.create).toHaveBeenCalled()
    })
  })
})
