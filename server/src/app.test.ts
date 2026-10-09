import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { TEST_API_KEY } from './test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

// Mock prisma to avoid DB connections
const mockPrisma = vi.hoisted(() => ({
  story: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    groupBy: vi.fn(),
  },
  issue: { findMany: vi.fn(), findUnique: vi.fn() },
  feed: { findMany: vi.fn(), findUnique: vi.fn() },
  newsletter: { findMany: vi.fn(), findUnique: vi.fn() },
  podcast: { findMany: vi.fn(), findUnique: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  jobRun: { findMany: vi.fn(), findUnique: vi.fn() },
  refreshToken: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  $disconnect: vi.fn(),
  $transaction: vi.fn((args: any) => Array.isArray(args) ? Promise.all(args) : args()),
}))

vi.mock('./lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))
vi.mock('./services/analysis.js', () => ({
  preAssessStories: vi.fn(),
  assessStory: vi.fn(),
  selectStories: vi.fn(),
  bulkPreAssess: vi.fn(),
  bulkAssess: vi.fn(),
  bulkSelect: vi.fn(),
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app, redactSensitiveQuery } = await import('./app.js')

describe('redactSensitiveQuery', () => {
  /**
   * Los logs se descargan para depurar (así se encontró la caída de LinkedIn),
   * así que una credencial en la query sale de la máquina. El código de OAuth
   * dura segundos, pero mientras vive alcanza para canjear un token de
   * publicación en la cuenta.
   */
  it('hides the OAuth code and state on a callback URL', () => {
    const out = redactSensitiveQuery(
      '/api/linkedin/oauth/callback?code=AQTsecret123&state=SIGNEDstate456',
    )

    expect(out).not.toMatch(/AQTsecret123/)
    expect(out).not.toMatch(/SIGNEDstate456/)
    expect(out).toBe('/api/linkedin/oauth/callback?code=[REDACTED]&state=[REDACTED]')
  })

  it('keeps the non-sensitive params readable', () => {
    const out = redactSensitiveQuery('/api/linkedin/oauth/callback?code=abc&error=denied')

    expect(out).toBe('/api/linkedin/oauth/callback?code=[REDACTED]&error=denied')
  })

  it('still hides the magic-link token', () => {
    const out = redactSensitiveQuery('/api/auth/magic/verify?token=SECRET')

    expect(out).toBe('/api/auth/magic/verify?token=[REDACTED]')
  })

  // Sin esto, una URL normal con `code` o `state` quedaría ilegible en los logs.
  it('leaves unrelated URLs untouched', () => {
    expect(redactSensitiveQuery('/api/stories?code=CL&state=active')).toBe(
      '/api/stories?code=CL&state=active',
    )
    expect(redactSensitiveQuery('/api/admin/linkedin/posts')).toBe('/api/admin/linkedin/posts')
  })
})

describe('App error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('404 handler', () => {
    it('returns 404 JSON for unmatched GET route', async () => {
      const res = await request(app).get('/api/nonexistent-route')

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Not found' })
    })

    it('returns 404 JSON for unmatched POST route', async () => {
      const res = await request(app).post('/api/nonexistent-route')

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Not found' })
    })

    it('returns 404 for routes outside /api prefix', async () => {
      const res = await request(app).get('/completely-unknown-path')

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Not found' })
    })
  })

  describe('500 error handler', () => {
    it('returns 403 JSON when CORS rejects an origin on restricted endpoint', async () => {
      // The CORS middleware throws "Not allowed by CORS" for disallowed origins
      // on non-public endpoints (subscribe, auth, admin).
      // Public read endpoints (stories, issues, homepage, feed, docs) allow all origins.
      const res = await request(app)
        .post('/api/subscribe')
        .set('Origin', 'https://evil-site.com')

      // Un origen no permitido es un rechazo del cliente, no una falla del servidor:
      // un 500 disparaba alertas de disponibilidad por cualquier sitio ajeno.
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'Origin not allowed' })
    })
  })
})

describe('GET /api/health', () => {
  // El Static Web App solo reenvía /api/* al backend: /health a secas devuelve
  // el HTML del SPA con 200. La sonda que un monitor externo puede usar es esta.
  it('responde por el router público, no por el fallback del SPA', async () => {
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok', database: 'connected' })
  })

  it('devuelve 503 cuando la base no responde', async () => {
    mockPrisma.$queryRaw = vi.fn().mockRejectedValue(new Error('down'))
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ status: 'error', database: 'disconnected' })
  })

})
