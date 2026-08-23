import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockLib = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
}))
const mockState = vi.hoisted(() => ({
  verifyOAuthState: vi.fn(),
}))

vi.mock('../lib/linkedin.js', () => mockLib)
vi.mock('../lib/linkedinOAuthState.js', () => mockState)
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const { default: router } = await import('./linkedinOAuth.js')

const app = express()
app.use('/api/linkedin', router)

const ADMIN = 'https://vocesindigenas.org/admin/linkedin'

describe('GET /api/linkedin/oauth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.verifyOAuthState.mockReturnValue(true)
    mockLib.exchangeCodeForToken.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60 * 86_400_000),
      daysLeft: 60,
      hasRefreshToken: false,
    })
  })

  it('exchanges the code and sends the admin back with the result', async () => {
    const res = await request(app)
      .get('/api/linkedin/oauth/callback')
      .query({ code: 'auth-code', state: 'signed' })

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(`${ADMIN}?auth=ok&days=60`)
    expect(mockLib.exchangeCodeForToken).toHaveBeenCalledWith('auth-code')
  })

  /**
   * La razón de ser del state firmado: esta ruta es pública (el navegador llega
   * por el redirect de LinkedIn, sin el Bearer del admin). Sin esta validación,
   * cualquiera podría canjear un código propio y dejar el sitio publicando en su
   * cuenta de LinkedIn.
   */
  it('refuses to exchange anything when the state does not validate', async () => {
    mockState.verifyOAuthState.mockReturnValue(false)

    const res = await request(app)
      .get('/api/linkedin/oauth/callback')
      .query({ code: 'attacker-code', state: 'forged' })

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(`${ADMIN}?auth=invalid_state`)
    expect(mockLib.exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('refuses when the state is missing entirely', async () => {
    mockState.verifyOAuthState.mockReturnValue(false)

    const res = await request(app).get('/api/linkedin/oauth/callback').query({ code: 'x' })

    expect(res.headers.location).toBe(`${ADMIN}?auth=invalid_state`)
    expect(mockLib.exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('handles the member cancelling on LinkedIn', async () => {
    const res = await request(app)
      .get('/api/linkedin/oauth/callback')
      .query({ error: 'user_cancelled_login', error_description: 'The user cancelled' })

    expect(res.headers.location).toBe(`${ADMIN}?auth=denied`)
    expect(mockLib.exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('handles a valid state with no code', async () => {
    const res = await request(app).get('/api/linkedin/oauth/callback').query({ state: 'signed' })

    expect(res.headers.location).toBe(`${ADMIN}?auth=missing_code`)
    expect(mockLib.exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('reports a failed exchange instead of leaving the admin guessing', async () => {
    mockLib.exchangeCodeForToken.mockRejectedValue(new Error('LinkedIn token exchange failed 400'))

    const res = await request(app)
      .get('/api/linkedin/oauth/callback')
      .query({ code: 'auth-code', state: 'signed' })

    expect(res.headers.location).toBe(`${ADMIN}?auth=exchange_failed`)
  })

  // Un array en la query (?state=a&state=b) no debe colarse como string.
  it('rejects a non-string state', async () => {
    mockState.verifyOAuthState.mockImplementation((s: unknown) => typeof s === 'string')

    const res = await request(app)
      .get('/api/linkedin/oauth/callback')
      .query({ code: 'x', state: ['a', 'b'] })

    expect(res.headers.location).toBe(`${ADMIN}?auth=invalid_state`)
    expect(mockLib.exchangeCodeForToken).not.toHaveBeenCalled()
  })
})
