import { describe, it, expect, vi, beforeEach } from 'vitest'

class InstagramTokenTooYoungError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InstagramTokenTooYoungError'
  }
}

const mockLib = vi.hoisted(() => ({
  getTokenStatus: vi.fn(),
  refreshAccessToken: vi.fn(),
  isInstagramConfigured: vi.fn(() => true),
}))

vi.mock('../lib/instagram.js', () => ({ ...mockLib, InstagramTokenTooYoungError }))
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../config.js', () => ({
  config: { instagram: { tokenRefresh: { thresholdDays: 15, lifetimeDays: 60 } } },
}))

const { runInstagramRefreshToken } = await import('./instagramRefreshToken.js')

describe('runInstagramRefreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isInstagramConfigured.mockReturnValue(true)
    mockLib.refreshAccessToken.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60 * 86_400_000),
      daysLeft: 60,
      source: 'db',
    })
  })

  it('does not spend a refresh call while the token is still fresh', async () => {
    mockLib.getTokenStatus.mockResolvedValue({ expiresAt: new Date(), daysLeft: 45, source: 'db' })

    await runInstagramRefreshToken()

    expect(mockLib.refreshAccessToken).not.toHaveBeenCalled()
  })

  it('refreshes once the token drops to the threshold', async () => {
    mockLib.getTokenStatus.mockResolvedValue({ expiresAt: new Date(), daysLeft: 15, source: 'db' })

    await runInstagramRefreshToken()

    expect(mockLib.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('establishes an expiry on the first run, when the token comes from the env var', async () => {
    mockLib.getTokenStatus.mockResolvedValue({ expiresAt: null, daysLeft: null, source: 'env' })

    await runInstagramRefreshToken()

    expect(mockLib.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  // Regresión de la caída de julio de 2026: el token expiró el 18-jul y el
  // sistema estuvo 12 días fallando en silencio. Un token vencido no se puede
  // renovar, así que el job debe lanzar para que salga la alerta por correo.
  it('throws (so the scheduler alerts) when the token already expired', async () => {
    mockLib.getTokenStatus.mockResolvedValue({ expiresAt: new Date(), daysLeft: -12, source: 'db' })

    await expect(runInstagramRefreshToken()).rejects.toThrow(/expired 12 day\(s\) ago/)
    expect(mockLib.refreshAccessToken).not.toHaveBeenCalled()
  })

  // Escenario del día siguiente a rotar el token a mano: Meta no renueva un
  // token con menos de 24 h de vida. No es un fallo, así que el job no debe
  // lanzar (una alerta acá llegaría justo después de arreglar el problema).
  it('waits without alerting when the token is younger than 24 hours', async () => {
    mockLib.getTokenStatus.mockResolvedValue({ expiresAt: null, daysLeft: null, source: 'env' })
    mockLib.refreshAccessToken.mockRejectedValue(
      new InstagramTokenTooYoungError("This IG User's access token must be at least 24 hours old before it can be refreshed"),
    )

    await expect(runInstagramRefreshToken()).resolves.toBeUndefined()
  })

  it('still surfaces real refresh failures', async () => {
    mockLib.getTokenStatus.mockResolvedValue({ expiresAt: new Date(), daysLeft: 3, source: 'db' })
    mockLib.refreshAccessToken.mockRejectedValue(new Error('Failed to refresh Instagram token: {"code":190}'))

    await expect(runInstagramRefreshToken()).rejects.toThrow(/Failed to refresh/)
  })

  it('skips quietly when Instagram is not configured', async () => {
    mockLib.isInstagramConfigured.mockReturnValue(false)

    await runInstagramRefreshToken()

    expect(mockLib.getTokenStatus).not.toHaveBeenCalled()
    expect(mockLib.refreshAccessToken).not.toHaveBeenCalled()
  })
})
