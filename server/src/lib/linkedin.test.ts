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
    linkedin: {
      accessToken: 'env-token',
      authorUrn: 'urn:li:person:abc123',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://impactoindigena.news/api/linkedin/oauth/callback',
      scopes: ['w_member_social'],
      tokenCheck: { thresholdDays: 7, lifetimeDays: 60 },
    },
  },
}))

const {
  getAccessToken,
  introspectToken,
  exchangeCodeForToken,
  buildAuthorizationUrl,
  createUgcPost,
  getOrgPostMetrics,
  LinkedInAuthError,
} = await import('./linkedin.js')

const EXPIRED_401 = JSON.stringify({
  status: 401,
  serviceErrorCode: 65602,
  code: 'EXPIRED_ACCESS_TOKEN',
  message: 'The token used in the request has expired',
})

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
    headers: { get: () => 'application/json' },
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as Response
}

describe('getAccessToken', () => {
  beforeEach(() => vi.clearAllMocks())

  it('prefers the reauthorized token in the database', async () => {
    mockToken.getStoredToken.mockResolvedValue({ accessToken: 'db-token', expiresAt: null, refreshedAt: null })

    await expect(getAccessToken()).resolves.toBe('db-token')
  })

  it('falls back to the env var when nothing is stored', async () => {
    mockToken.getStoredToken.mockResolvedValue(null)

    await expect(getAccessToken()).resolves.toBe('env-token')
  })

  // Que la base no responda no debe dejar el canal muerto.
  it('falls back to the env var when the database errors', async () => {
    mockToken.getStoredToken.mockRejectedValue(new Error('connection refused'))

    await expect(getAccessToken()).resolves.toBe('env-token')
  })
})

describe('introspectToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToken.getStoredToken.mockResolvedValue(null)
  })

  it('reports an active token with the days left', async () => {
    const expiresAt = Math.floor((Date.now() + 30 * 86_400_000) / 1000)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      active: true,
      status: 'active',
      expires_at: expiresAt,
      scope: 'w_member_social,openid,profile',
      auth_type: '3L',
    })))

    const result = await introspectToken()

    expect(result.active).toBe(true)
    expect(result.daysLeft).toBe(29)
    expect(result.scopes).toEqual(['w_member_social', 'openid', 'profile'])
    expect(result.source).toBe('env')
  })

  // El caso real de junio de 2026: el token ya estaba muerto.
  it('reports an expired token with a negative days left', async () => {
    const expiredAt = Math.floor((Date.now() - 12 * 86_400_000) / 1000)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      active: false,
      status: 'expired',
      expires_at: expiredAt,
    })))

    const result = await introspectToken()

    expect(result.active).toBe(false)
    expect(result.status).toBe('expired')
    expect(result.daysLeft).toBeLessThan(0)
  })

  it('authenticates with the app credentials, not with the token scopes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ active: true }))
    vi.stubGlobal('fetch', fetchMock)

    await introspectToken()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://www.linkedin.com/oauth/v2/introspectToken')
    const body = (init.body as URLSearchParams).toString()
    expect(body).toContain('client_id=client-id')
    expect(body).toContain('client_secret=client-secret')
    expect(body).toContain('token=env-token')
  })

  it('says the token came from the database when there is one stored', async () => {
    mockToken.getStoredToken.mockResolvedValue({ accessToken: 'db-token', expiresAt: null, refreshedAt: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ active: true })))

    await expect(introspectToken()).resolves.toMatchObject({ source: 'db' })
  })
})

describe('buildAuthorizationUrl', () => {
  it('requests the publishing scope and the registered redirect', () => {
    const url = new URL(buildAuthorizationUrl('signed-state'))

    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('signed-state')
    expect(url.searchParams.get('scope')).toBe('w_member_social')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://impactoindigena.news/api/linkedin/oauth/callback',
    )
  })
})

describe('exchangeCodeForToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Es async en producción; el código encadena .catch() sobre su promesa.
    mockToken.recordTokenError.mockResolvedValue(undefined)
  })

  it('stores the new token with the expiry LinkedIn reports', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'fresh-token',
      expires_in: 60 * 86_400,
    })))

    const result = await exchangeCodeForToken('auth-code')

    expect(result.daysLeft).toBe(60)
    expect(result.hasRefreshToken).toBe(false)
    expect(mockToken.saveToken).toHaveBeenCalledWith('linkedin', 'fresh-token', expect.any(Date))
  })

  it('falls back to the nominal lifetime when expires_in is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ access_token: 'fresh-token' })))

    await expect(exchangeCodeForToken('auth-code')).resolves.toMatchObject({ daysLeft: 60 })
  })

  // Un código de autorización es una credencial: no debe acabar en el mensaje de
  // error, que termina en los logs y se comparte al depurar.
  it('never leaks the authorization code when the exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'invalid_request', code_echo: 'secret-code' }, 400),
    ))

    await expect(exchangeCodeForToken('secret-code')).rejects.toThrow(
      /LinkedIn token exchange failed 400/,
    )
    await expect(exchangeCodeForToken('secret-code')).rejects.not.toThrow(/secret-code/)
  })

  it('does not store anything when no access_token comes back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ expires_in: 100 })))

    await expect(exchangeCodeForToken('auth-code')).rejects.toThrow(/no access_token/)
    expect(mockToken.saveToken).not.toHaveBeenCalled()
  })
})

describe('createUgcPost with a dead token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToken.getStoredToken.mockResolvedValue(null)
  })

  /**
   * La regresión del 11-jun-2026: un intento de publicar produjo OCHO líneas de
   * error — un 401 por cada uno de los 5 slides, otro al crear el post y dos
   * cascadas. Un token muerto tiene que cortar en el primer 401.
   */
  it('stops at the first 401 instead of retrying every slide', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      // La descarga de la imagen desde la fuente sí funciona.
      if (!String(url).includes('api.linkedin.com')) return jsonResponse('binary', 200)
      return jsonResponse(EXPIRED_401, 401)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createUgcPost('texto', 'https://impactoindigena.news/stories/x', 'Título', 'Resumen', [
        'https://cdn/1.jpg',
        'https://cdn/2.jpg',
        'https://cdn/3.jpg',
        'https://cdn/4.jpg',
        'https://cdn/5.jpg',
      ]),
    ).rejects.toThrow(LinkedInAuthError)

    const linkedinCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('api.linkedin.com'))
    expect(linkedinCalls).toHaveLength(1)
  })

  it('carries the LinkedIn service error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(EXPIRED_401, 401)))

    await createUgcPost('texto', 'https://x/y', 'T', 'R', null).catch((err) => {
      expect(err).toBeInstanceOf(LinkedInAuthError)
      expect(err.serviceErrorCode).toBe(65602)
      expect(err.status).toBe(401)
    })
    expect.assertions(3)
  })

  // Un fallo puntual de una imagen no debe impedir publicar: el post sale en
  // modo ARTICLE, que es el comportamiento que ya existía.
  it('still falls back to ARTICLE mode on a non-auth upload failure', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (!String(url).includes('api.linkedin.com')) return jsonResponse('binary', 200)
      if (String(url).includes('registerUpload')) return jsonResponse('boom', 500)
      return jsonResponse({ id: 'urn:li:share:123' }, 200)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createUgcPost('texto', 'https://x/y', 'T', 'R', ['https://cdn/1.jpg'])

    expect(result.id).toBe('urn:li:share:123')
    const postCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/v2/ugcPosts'))
    expect(JSON.parse(postCall![1].body).specificContent['com.linkedin.ugc.ShareContent']
      .shareMediaCategory).toBe('ARTICLE')
  })
})

describe('getOrgPostMetrics with a dead token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToken.getStoredToken.mockResolvedValue(null)
  })

  it('throws instead of swallowing the 401, so the job can fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(EXPIRED_401, 401)))

    await expect(
      getOrgPostMetrics('urn:li:share:1', 'urn:li:organization:99'),
    ).rejects.toThrow(LinkedInAuthError)
  })

  it('keeps returning null on other failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('server error', 500)))

    await expect(
      getOrgPostMetrics('urn:li:share:1', 'urn:li:organization:99'),
    ).resolves.toBeNull()
  })

  // Sigue siendo un no-op para perfiles personales: no llama a la API. Es el
  // punto ciego que hacía falta cubrir con un job aparte.
  it('never touches the API for a personal profile', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getOrgPostMetrics('urn:li:share:1', 'urn:li:person:abc')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
