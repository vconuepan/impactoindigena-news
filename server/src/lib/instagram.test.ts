import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockToken = vi.hoisted(() => ({
  getStoredToken: vi.fn(),
  saveToken: vi.fn(),
  recordTokenError: vi.fn(),
}))

vi.mock('./socialToken.js', () => mockToken)
vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../config.js', () => ({
  config: {
    instagram: {
      accessToken: 'env-token',
      userId: '1784',
      tokenRefresh: { thresholdDays: 15, lifetimeDays: 60 },
    },
  },
}))

const {
  getPostMetrics,
  getAccessToken,
  refreshAccessToken,
  getTokenStatus,
  InstagramAuthError,
} = await import('./instagram.js')

// Respuesta real de la Graph API capturada de los logs de producción del
// 29-jul-2026, cuando el token llevaba 11 días vencido.
const EXPIRED_TOKEN_RESPONSE = {
  error: {
    message: 'Error validating access token: Session has expired on Saturday, 18-Jul-26 21:55:53 PDT.',
    type: 'OAuthException',
    code: 190,
    error_subcode: 0,
    fbtrace_id: 'A62b1zV0bpwr7rduEyJAiQ4',
  },
}

function mockFetchOnce(payload: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }))
}

beforeEach(() => {
  // Son async en producción; el mock también debe devolver promesa porque el
  // código encadena .catch() sobre ellas.
  mockToken.saveToken.mockResolvedValue(undefined)
  mockToken.recordTokenError.mockResolvedValue(undefined)
})

describe('token resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prefers the refreshed token in the database over the env var', async () => {
    mockToken.getStoredToken.mockResolvedValue({
      accessToken: 'db-token',
      expiresAt: new Date(),
      refreshedAt: new Date(),
    })

    expect(await getAccessToken()).toBe('db-token')
  })

  it('falls back to the env var when nothing is stored yet', async () => {
    mockToken.getStoredToken.mockResolvedValue(null)

    expect(await getAccessToken()).toBe('env-token')
  })

  // Un fallo de la base de datos no debe dejar el canal muerto: la variable de
  // entorno sigue siendo un token válido mientras no se haya renovado.
  it('falls back to the env var when the database read fails', async () => {
    mockToken.getStoredToken.mockRejectedValue(new Error('connection refused'))

    expect(await getAccessToken()).toBe('env-token')
  })

  it('reports days left from the stored expiry', async () => {
    // Medio día de holgura: con 20 días exactos, los milisegundos que pasan
    // hasta el cálculo tiran el floor a 19 y el test se vuelve intermitente.
    mockToken.getStoredToken.mockResolvedValue({
      accessToken: 'db-token',
      expiresAt: new Date(Date.now() + 20.5 * 86_400_000),
      refreshedAt: new Date(),
    })

    const status = await getTokenStatus()
    expect(status.daysLeft).toBe(20)
    expect(status.source).toBe('db')
  })
})

describe('Graph API error classification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToken.getStoredToken.mockResolvedValue(null)
  })

  // El corazón de la regresión: antes todo error salía como Error genérico, así
  // que nada podía distinguir "token muerto" de "esta imagen falló" y los bucles
  // seguían machacando la API post por post.
  it('surfaces an expired token as InstagramAuthError', async () => {
    mockFetchOnce(EXPIRED_TOKEN_RESPONSE, false)

    await expect(getPostMetrics('17900000000000000')).rejects.toThrow(InstagramAuthError)
  })

  it('keeps the Meta error code on the exception', async () => {
    mockFetchOnce(EXPIRED_TOKEN_RESPONSE, false)

    await expect(getPostMetrics('17900000000000000')).rejects.toMatchObject({ code: 190 })
  })

  it('leaves non-auth failures as ordinary errors', async () => {
    mockFetchOnce({ error: { message: 'Media ID is not available', code: 100 } }, false)

    const err = await getPostMetrics('17900000000000000').catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(InstagramAuthError)
  })
})

describe('refreshAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToken.getStoredToken.mockResolvedValue(null)
  })

  it('stores the new token with the expiry the API reports', async () => {
    mockFetchOnce({ access_token: 'fresh-token', expires_in: 5_183_944 })

    const status = await refreshAccessToken()

    expect(mockToken.saveToken).toHaveBeenCalledWith('instagram', 'fresh-token', expect.any(Date))
    expect(status.daysLeft).toBe(59) // 5183944s ≈ 59.99 días
  })

  it('records why a refresh failed instead of silently dropping it', async () => {
    mockFetchOnce(EXPIRED_TOKEN_RESPONSE, false)

    await expect(refreshAccessToken()).rejects.toThrow(InstagramAuthError)
    expect(mockToken.recordTokenError).toHaveBeenCalledWith('instagram', expect.stringContaining('OAuthException'))
    expect(mockToken.saveToken).not.toHaveBeenCalled()
  })
})
