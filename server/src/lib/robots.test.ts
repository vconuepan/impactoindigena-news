import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: { get: mockGet } }))

vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const { isAllowedByRobots, clearRobotsCache, ROBOTS_USER_AGENT } = await import('./robots.js')

const robotsTxt = (body: string) => ({ status: 200, data: body })

describe('isAllowedByRobots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearRobotsCache()
  })

  it('respeta una regla que excluye a este crawler por su nombre', async () => {
    mockGet.mockResolvedValue(robotsTxt(`User-agent: ${ROBOTS_USER_AGENT}\nDisallow: /\n`))
    expect(await isAllowedByRobots('https://medio.cl/nota')).toBe(false)
  })

  it('respeta una regla general que excluye a todos los bots', async () => {
    mockGet.mockResolvedValue(robotsTxt('User-agent: *\nDisallow: /\n'))
    expect(await isAllowedByRobots('https://medio.cl/nota')).toBe(false)
  })

  it('distingue el path bloqueado del permitido', async () => {
    mockGet.mockResolvedValue(robotsTxt('User-agent: *\nDisallow: /privado\n'))
    expect(await isAllowedByRobots('https://medio.cl/privado/x')).toBe(false)
    expect(await isAllowedByRobots('https://medio.cl/noticias/x')).toBe(true)
  })

  it('no se da por aludido cuando el bloqueo apunta a otro bot', async () => {
    // El caso real: 20 de los 80 dominios mas crawleados bloquean GPTBot y
    // CCBot —los bots de entrenamiento de modelos— y no a nosotros.
    mockGet.mockResolvedValue(robotsTxt('User-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n'))
    expect(await isAllowedByRobots('https://theguardian.com/world/x')).toBe(true)
  })

  describe('fail-open: la duda permite, nunca bloquea', () => {
    it('permite cuando no hay robots.txt (404)', async () => {
      mockGet.mockResolvedValue({ status: 404, data: 'Not Found' })
      expect(await isAllowedByRobots('https://medio.cl/nota')).toBe(true)
    })

    it('permite cuando la peticion falla', async () => {
      mockGet.mockRejectedValue(new Error('ENOTFOUND'))
      expect(await isAllowedByRobots('https://medio.cl/nota')).toBe(true)
    })

    it('permite cuando la URL no parsea', async () => {
      expect(await isAllowedByRobots('no-es-una-url')).toBe(true)
      expect(mockGet).not.toHaveBeenCalled()
    })
  })

  it('cachea por origen: no pide robots.txt dos veces al mismo sitio', async () => {
    // Sin cache, una tanda de crawl pediria el mismo robots.txt una vez por
    // articulo — decenas de peticiones extra al medio en cada corrida.
    mockGet.mockResolvedValue(robotsTxt('User-agent: *\nDisallow: /privado\n'))
    await isAllowedByRobots('https://medio.cl/a')
    await isAllowedByRobots('https://medio.cl/b')
    await isAllowedByRobots('https://medio.cl/privado/c')
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('trata cada origen por separado', async () => {
    mockGet.mockResolvedValue(robotsTxt('User-agent: *\nAllow: /\n'))
    await isAllowedByRobots('https://uno.cl/x')
    await isAllowedByRobots('https://dos.cl/x')
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('pide el robots.txt en la raiz del origen', async () => {
    mockGet.mockResolvedValue(robotsTxt('User-agent: *\nAllow: /\n'))
    await isAllowedByRobots('https://medio.cl/seccion/nota-larga?x=1')
    expect(mockGet.mock.calls[0][0]).toBe('https://medio.cl/robots.txt')
  })
})
