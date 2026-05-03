import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  magicLink: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: {
    upsert: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

const mockBrevo = {
  verifyEmail: vi.fn(),
  sendTransactional: vi.fn(),
}

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../services/brevo.js', () => mockBrevo)
vi.mock('../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

process.env.JWT_SECRET = 'test-jwt-secret-for-magic-link-tests'
process.env.CLIENT_URL = 'https://test.example.com'
process.env.API_URL = 'https://api.test.example.com'

const { default: app } = await import('../app.js')

const sampleMagicLink = (overrides: Record<string, any> = {}) => ({
  id: 'ml-1',
  email: 'user@example.com',
  token: 'test-uuid-token-1234',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  usedAt: null,
  redirectTo: null,
  createdAt: new Date(),
  ...overrides,
})

const sampleVeedorUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-veedor-1',
  email: 'user@example.com',
  name: 'user',
  userType: 'VEEDOR',
  passwordHash: '',
  verified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('Magic Link Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBrevo.verifyEmail.mockResolvedValue({ valid: true, domainExists: true, isDisposable: false })
    mockBrevo.sendTransactional.mockResolvedValue(undefined)
    mockPrisma.magicLink.findFirst.mockResolvedValue(null) // no recent link
    mockPrisma.magicLink.create.mockResolvedValue(sampleMagicLink())
    mockPrisma.magicLink.update.mockResolvedValue(sampleMagicLink({ usedAt: new Date() }))
    mockPrisma.user.upsert.mockResolvedValue(sampleVeedorUser())
  })

  describe('POST /api/auth/magic', () => {
    it('returns 204 on valid email', async () => {
      const res = await request(app)
        .post('/api/auth/magic')
        .send({ email: 'user@example.com' })

      expect(res.status).toBe(204)
      expect(mockPrisma.magicLink.create).toHaveBeenCalledOnce()
      expect(mockBrevo.sendTransactional).toHaveBeenCalledOnce()
    })

    it('validates email format', async () => {
      const res = await request(app)
        .post('/api/auth/magic')
        .send({ email: 'notanemail' })

      expect(res.status).toBe(400)
      expect(mockBrevo.sendTransactional).not.toHaveBeenCalled()
    })

    it('rejects disposable emails', async () => {
      mockBrevo.verifyEmail.mockResolvedValue({ valid: true, domainExists: true, isDisposable: true })

      const res = await request(app)
        .post('/api/auth/magic')
        .send({ email: 'temp@mailinator.com' })

      expect(res.status).toBe(422)
      expect(mockBrevo.sendTransactional).not.toHaveBeenCalled()
    })

    it('returns 429 if a link was sent in the last 60 seconds', async () => {
      mockPrisma.magicLink.findFirst.mockResolvedValue(sampleMagicLink())

      const res = await request(app)
        .post('/api/auth/magic')
        .send({ email: 'user@example.com' })

      expect(res.status).toBe(429)
      expect(mockBrevo.sendTransactional).not.toHaveBeenCalled()
    })

    it('proceeds gracefully if brevo.verifyEmail throws', async () => {
      mockBrevo.verifyEmail.mockRejectedValue(new Error('Brevo down'))

      const res = await request(app)
        .post('/api/auth/magic')
        .send({ email: 'user@example.com' })

      expect(res.status).toBe(204)
      expect(mockBrevo.sendTransactional).toHaveBeenCalledOnce()
    })

    it('normalizes email to lowercase', async () => {
      await request(app)
        .post('/api/auth/magic')
        .send({ email: 'User@EXAMPLE.COM' })

      expect(mockPrisma.magicLink.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'user@example.com' }) })
      )
    })
  })

  describe('GET /api/auth/magic/verify', () => {
    it('sets httpOnly cookie and redirects on valid token', async () => {
      mockPrisma.magicLink.findUnique.mockResolvedValue(sampleMagicLink())

      const res = await request(app)
        .get('/api/auth/magic/verify?token=test-uuid-token-1234')

      expect(res.status).toBe(303)
      const cookies = res.headers['set-cookie'] as string[]
      expect(cookies).toBeDefined()
      const tokenCookie = cookies.find((c: string) => c.startsWith('member_token='))
      expect(tokenCookie).toBeTruthy()
      expect(tokenCookie).toContain('HttpOnly')
      // member_email indicator cookie should also be set
      const emailCookie = cookies.find((c: string) => c.startsWith('member_email='))
      expect(emailCookie).toBeTruthy()
      expect(emailCookie).not.toContain('HttpOnly')
    })

    it('marks magic link as used', async () => {
      mockPrisma.magicLink.findUnique.mockResolvedValue(sampleMagicLink())

      await request(app).get('/api/auth/magic/verify?token=test-uuid-token-1234')

      expect(mockPrisma.magicLink.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) })
      )
    })

    it('redirects to error page for expired token', async () => {
      mockPrisma.magicLink.findUnique.mockResolvedValue(
        sampleMagicLink({ expiresAt: new Date(Date.now() - 1000) })
      )

      const res = await request(app)
        .get('/api/auth/magic/verify?token=expired-token')

      expect(res.status).toBe(303)
      expect(res.headers.location).toContain('error=expired')
      expect(res.headers['set-cookie']).toBeUndefined()
    })

    it('preserves redirect_to in error URL when token expired', async () => {
      mockPrisma.magicLink.findUnique.mockResolvedValue(
        sampleMagicLink({ expiresAt: new Date(Date.now() - 1000), redirectTo: '/comunidad/xyz' })
      )

      const res = await request(app)
        .get('/api/auth/magic/verify?token=expired-token&redirect_to=/comunidad/xyz')

      expect(res.headers.location).toContain('redirect_to=')
    })

    it('redirects to error page for already-used token', async () => {
      mockPrisma.magicLink.findUnique.mockResolvedValue(
        sampleMagicLink({ usedAt: new Date() })
      )

      const res = await request(app).get('/api/auth/magic/verify?token=used-token')

      expect(res.status).toBe(303)
      expect(res.headers.location).toContain('error=expired')
    })

    it('redirects to error page with no token param', async () => {
      const res = await request(app).get('/api/auth/magic/verify')

      expect(res.status).toBe(303)
      expect(res.headers.location).toContain('error=expired')
    })

    it('upserts user on valid token', async () => {
      mockPrisma.magicLink.findUnique.mockResolvedValue(sampleMagicLink())

      await request(app).get('/api/auth/magic/verify?token=test-uuid-token-1234')

      expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'user@example.com' },
          create: expect.objectContaining({ userType: 'VEEDOR', passwordHash: '' }),
        })
      )
    })

    it('respects redirect_to query param in success redirect', async () => {
      mockPrisma.magicLink.findUnique.mockResolvedValue(sampleMagicLink())

      const res = await request(app)
        .get('/api/auth/magic/verify?token=test-uuid-token-1234&redirect_to=/comunidad/mapuche')

      expect(res.status).toBe(303)
      expect(res.headers.location).toContain('/comunidad/mapuche')
      expect(res.headers.location).not.toContain('member_token')
    })
  })

  describe('POST /api/auth/magic/resend', () => {
    it('returns 204 and sends email', async () => {
      const res = await request(app)
        .post('/api/auth/magic/resend')
        .send({ email: 'user@example.com' })

      expect(res.status).toBe(204)
      expect(mockBrevo.sendTransactional).toHaveBeenCalledOnce()
    })

    it('validates email format', async () => {
      const res = await request(app)
        .post('/api/auth/magic/resend')
        .send({ email: 'invalid' })

      expect(res.status).toBe(400)
    })

    it('rejects disposable emails (same validation as /magic)', async () => {
      mockBrevo.verifyEmail.mockResolvedValue({ valid: true, domainExists: true, isDisposable: true })

      const res = await request(app)
        .post('/api/auth/magic/resend')
        .send({ email: 'temp@mailinator.com' })

      expect(res.status).toBe(422)
      expect(mockBrevo.sendTransactional).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/auth/magic/logout', () => {
    it('returns 204 and clears cookies', async () => {
      const res = await request(app).post('/api/auth/magic/logout')

      expect(res.status).toBe(204)
      const cookies = res.headers['set-cookie'] as string[] | undefined
      if (cookies) {
        const tokenCookie = cookies.find((c: string) => c.startsWith('member_token='))
        if (tokenCookie) {
          // Cookie should have Max-Age=0 to clear it
          expect(tokenCookie).toContain('Max-Age=0')
        }
      }
    })
  })
})
