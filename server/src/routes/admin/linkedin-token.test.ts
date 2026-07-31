import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockLib = vi.hoisted(() => ({
  introspectToken: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  isLinkedInConfigured: vi.fn(() => true),
  isLinkedInOAuthConfigured: vi.fn(() => true),
  exchangeCodeForToken: vi.fn(),
  createUgcPost: vi.fn(),
  getOrgPostMetrics: vi.fn(),
  LinkedInAuthError: class extends Error {},
}))
const mockState = vi.hoisted(() => ({
  createOAuthState: vi.fn(() => 'signed-state'),
  verifyOAuthState: vi.fn(() => true),
}))

vi.mock('../../lib/linkedin.js', () => mockLib)
vi.mock('../../lib/linkedinOAuthState.js', () => mockState)
vi.mock('../../lib/prisma.js', () => ({
  default: { linkedInPost: { findMany: vi.fn(), count: vi.fn() }, $disconnect: vi.fn() },
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

function introspection(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    status: 'active',
    expiresAt: new Date('2026-09-29T00:00:00Z'),
    daysLeft: 30,
    scopes: ['w_member_social'],
    authType: '3L',
    source: 'db' as const,
    ...overrides,
  }
}

describe('GET /api/admin/linkedin/token/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isLinkedInConfigured.mockReturnValue(true)
    mockLib.isLinkedInOAuthConfigured.mockReturnValue(true)
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/api/admin/linkedin/token/status')

    expect(res.status).toBe(401)
    expect(mockLib.introspectToken).not.toHaveBeenCalled()
  })

  it('reports a healthy token with its expiry and scopes', async () => {
    mockLib.introspectToken.mockResolvedValue(introspection())

    const res = await request(app)
      .get('/api/admin/linkedin/token/status')
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      configured: true,
      canReauthorize: true,
      active: true,
      daysLeft: 30,
      scopes: ['w_member_social'],
      source: 'db',
    })
  })

  // El token nunca debe salir por la API: la ruta informa salud, no credenciales.
  it('never returns the token itself', async () => {
    mockLib.introspectToken.mockResolvedValue(introspection())

    const res = await request(app)
      .get('/api/admin/linkedin/token/status')
      .set(authHeader())

    const body = JSON.stringify(res.body)
    expect(body).not.toMatch(/accessToken|access_token/)
  })

  it('reports an expired token as inactive', async () => {
    mockLib.introspectToken.mockResolvedValue(
      introspection({ active: false, status: 'expired', daysLeft: -12 }),
    )

    const res = await request(app)
      .get('/api/admin/linkedin/token/status')
      .set(authHeader())

    expect(res.body).toMatchObject({ active: false, status: 'expired' })
  })

  it('says LinkedIn is not configured without calling the API', async () => {
    mockLib.isLinkedInConfigured.mockReturnValue(false)

    const res = await request(app)
      .get('/api/admin/linkedin/token/status')
      .set(authHeader())

    expect(res.body).toMatchObject({ configured: false })
    expect(mockLib.introspectToken).not.toHaveBeenCalled()
  })

  it('explains that the app credentials are missing, rather than guessing', async () => {
    mockLib.isLinkedInOAuthConfigured.mockReturnValue(false)

    const res = await request(app)
      .get('/api/admin/linkedin/token/status')
      .set(authHeader())

    expect(res.body).toMatchObject({ configured: true, canReauthorize: false })
    expect(res.body.error).toMatch(/LINKEDIN_CLIENT_ID/)
    expect(mockLib.introspectToken).not.toHaveBeenCalled()
  })

  // Que falle la introspección no significa que el token esté muerto: hay que
  // distinguirlo o el panel mentiría.
  it('returns 502 when introspection itself fails', async () => {
    mockLib.introspectToken.mockRejectedValue(new Error('introspection failed 401'))

    const res = await request(app)
      .get('/api/admin/linkedin/token/status')
      .set(authHeader())

    expect(res.status).toBe(502)
    expect(res.body.active).toBeUndefined()
  })
})

describe('POST /api/admin/linkedin/token/authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isLinkedInOAuthConfigured.mockReturnValue(true)
    mockState.createOAuthState.mockReturnValue('signed-state')
    mockLib.buildAuthorizationUrl.mockReturnValue(
      'https://www.linkedin.com/oauth/v2/authorization?state=signed-state',
    )
  })

  it('requires authentication', async () => {
    const res = await request(app).post('/api/admin/linkedin/token/authorize')

    expect(res.status).toBe(401)
    expect(mockState.createOAuthState).not.toHaveBeenCalled()
  })

  /**
   * El state solo se emite acá, detrás de la sesión de admin. Es lo que hace
   * seguro que el callback sea una ruta pública.
   */
  it('mints a signed state and returns the authorization URL', async () => {
    const res = await request(app)
      .post('/api/admin/linkedin/token/authorize')
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body.url).toContain('linkedin.com/oauth/v2/authorization')
    expect(mockState.createOAuthState).toHaveBeenCalledTimes(1)
    expect(mockLib.buildAuthorizationUrl).toHaveBeenCalledWith('signed-state')
  })

  it('refuses when the app credentials are missing', async () => {
    mockLib.isLinkedInOAuthConfigured.mockReturnValue(false)

    const res = await request(app)
      .post('/api/admin/linkedin/token/authorize')
      .set(authHeader())

    expect(res.status).toBe(400)
    expect(mockState.createOAuthState).not.toHaveBeenCalled()
  })

  it('returns 500 instead of a broken URL when signing fails', async () => {
    mockLib.buildAuthorizationUrl.mockImplementation(() => {
      throw new Error('LINKEDIN_CLIENT_SECRET is required to sign the OAuth state')
    })

    const res = await request(app)
      .post('/api/admin/linkedin/token/authorize')
      .set(authHeader())

    expect(res.status).toBe(500)
    expect(res.body.url).toBeUndefined()
  })
})
