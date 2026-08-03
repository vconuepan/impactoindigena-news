import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  config: {
    facebook: { tokenCheck: { thresholdDays: 7 } },
  },
}))

const mockFacebook = vi.hoisted(() => ({
  introspectToken: vi.fn(),
  isFacebookConfigured: vi.fn(() => true),
  isFacebookAppConfigured: vi.fn(() => true),
}))

vi.mock('../config.js', () => mockConfig)
vi.mock('../lib/facebook.js', () => mockFacebook)

const { runFacebookCheckToken } = await import('./facebookCheckToken.js')

function introspection(overrides: Record<string, unknown> = {}) {
  return {
    isValid: true,
    expiresAt: new Date(Date.now() + 40 * 86_400_000),
    daysLeft: 40,
    scopes: ['pages_manage_posts', 'pages_read_engagement'],
    source: 'db' as const,
    ...overrides,
  }
}

describe('runFacebookCheckToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFacebook.isFacebookConfigured.mockReturnValue(true)
    mockFacebook.isFacebookAppConfigured.mockReturnValue(true)
  })

  it('no hace nada si Facebook no está configurado', async () => {
    mockFacebook.isFacebookConfigured.mockReturnValue(false)

    await expect(runFacebookCheckToken()).resolves.toBeUndefined()
    expect(mockFacebook.introspectToken).not.toHaveBeenCalled()
  })

  // Sin credenciales de app no hay forma de introspeccionar, pero eso no es un
  // fallo del token: alertar acá sería una alarma falsa diaria.
  it('sale sin alertar si faltan las credenciales de la app', async () => {
    mockFacebook.isFacebookAppConfigured.mockReturnValue(false)

    await expect(runFacebookCheckToken()).resolves.toBeUndefined()
    expect(mockFacebook.introspectToken).not.toHaveBeenCalled()
  })

  it('lanza cuando el token ya no es válido', async () => {
    mockFacebook.introspectToken.mockResolvedValue(introspection({ isValid: false, daysLeft: -3 }))

    await expect(runFacebookCheckToken()).rejects.toThrow(/no longer valid/)
  })

  it('lanza cuando quedan pocos días, para que alguien reemplace el token', async () => {
    mockFacebook.introspectToken.mockResolvedValue(introspection({ daysLeft: 5 }))

    await expect(runFacebookCheckToken()).rejects.toThrow(/expires in 5 day/)
  })

  it('calla cuando el token está sano', async () => {
    mockFacebook.introspectToken.mockResolvedValue(introspection({ daysLeft: 40 }))

    await expect(runFacebookCheckToken()).resolves.toBeUndefined()
  })

  // Un token de system user no expira: no hay fecha que vigilar, así que el job
  // no debe alertar nunca. Tratar "sin fecha" como "vencido" sería un correo diario.
  it('calla cuando el token no expira', async () => {
    mockFacebook.introspectToken.mockResolvedValue(
      introspection({ expiresAt: null, daysLeft: null }),
    )

    await expect(runFacebookCheckToken()).resolves.toBeUndefined()
  })
})
