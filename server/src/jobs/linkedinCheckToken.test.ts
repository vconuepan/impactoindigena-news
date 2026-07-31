import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLib = vi.hoisted(() => ({
  introspectToken: vi.fn(),
  isLinkedInConfigured: vi.fn(() => true),
  isLinkedInOAuthConfigured: vi.fn(() => true),
}))

vi.mock('../lib/linkedin.js', () => mockLib)
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../config.js', () => ({
  config: { linkedin: { tokenCheck: { thresholdDays: 7, lifetimeDays: 60 } } },
}))

const { runLinkedInCheckToken } = await import('./linkedinCheckToken.js')

function introspection(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    status: 'active',
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    daysLeft: 30,
    scopes: ['w_member_social'],
    authType: '3L',
    source: 'env' as const,
    ...overrides,
  }
}

describe('runLinkedInCheckToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isLinkedInConfigured.mockReturnValue(true)
    mockLib.isLinkedInOAuthConfigured.mockReturnValue(true)
  })

  it('passes quietly while the token is healthy', async () => {
    mockLib.introspectToken.mockResolvedValue(introspection())

    await expect(runLinkedInCheckToken()).resolves.toBeUndefined()
  })

  // El corazón del arreglo: un token muerto tiene que hacer fallar el job, que es
  // lo que dispara la alerta del scheduler. Antes nada ejercía el token.
  it('fails loudly when the token has expired', async () => {
    mockLib.introspectToken.mockResolvedValue(
      introspection({ active: false, status: 'expired', daysLeft: -12 }),
    )

    await expect(runLinkedInCheckToken()).rejects.toThrow(/expired/i)
  })

  it('fails loudly when the token was revoked', async () => {
    mockLib.introspectToken.mockResolvedValue(
      introspection({ active: false, status: 'revoked' }),
    )

    await expect(runLinkedInCheckToken()).rejects.toThrow(/revoked/i)
  })

  // Avisar con antelación es el punto: cuando expira ya es tarde, porque
  // reautorizar exige a una persona y LinkedIn no renueva solo.
  it('warns before expiry, inside the threshold window', async () => {
    mockLib.introspectToken.mockResolvedValue(introspection({ daysLeft: 5 }))

    await expect(runLinkedInCheckToken()).rejects.toThrow(/expires in 5 day/i)
  })

  it('stays quiet one day above the threshold', async () => {
    mockLib.introspectToken.mockResolvedValue(introspection({ daysLeft: 8 }))

    await expect(runLinkedInCheckToken()).resolves.toBeUndefined()
  })

  it('does not check anything when LinkedIn is not configured', async () => {
    mockLib.isLinkedInConfigured.mockReturnValue(false)

    await runLinkedInCheckToken()

    expect(mockLib.introspectToken).not.toHaveBeenCalled()
  })

  // Sin credenciales de app no se puede introspeccionar. Eso no es un token
  // muerto, así que no debe mandar una alerta que nadie puede accionar.
  it('does not raise an alert when the app credentials are missing', async () => {
    mockLib.isLinkedInOAuthConfigured.mockReturnValue(false)

    await expect(runLinkedInCheckToken()).resolves.toBeUndefined()
    expect(mockLib.introspectToken).not.toHaveBeenCalled()
  })
})
