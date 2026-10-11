import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))
// Run the fetch body once, no backoff delays in tests.
vi.mock('./retry.js', () => ({ withRetry: (fn: () => unknown) => fn() }))

// Se simulan SOLO la red (axios) y el DNS. `safeAxiosGet` y la guardia SSRF
// quedan reales a proposito: lo que se prueba es que la busqueda de og:image
// pase por ellas, y mockear `safeHttp` dejaria la guardia fuera del test.
const mockGet = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: { get: mockGet } }))
const mockLookup = vi.hoisted(() => vi.fn())
vi.mock('node:dns/promises', () => ({ lookup: mockLookup }))

const { fetchOgImage } = await import('./extract-og-image.js')

const PUBLICA = [{ address: '93.184.216.34', family: 4 }]

function mockHtml(html: string) {
  mockGet.mockResolvedValue({ status: 200, data: html, headers: {} })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLookup.mockResolvedValue(PUBLICA)
})

describe('fetchOgImage', () => {
  it('extracts the og:image URL', async () => {
    mockHtml('<meta property="og:image" content="https://cdn.example/hero.jpg">')
    expect(await fetchOgImage('https://src.example/1')).toBe('https://cdn.example/hero.jpg')
  })

  it('decodes &amp; in the URL (the double-escape bug that 400s on fetch)', async () => {
    mockHtml('<meta property="og:image" content="https://cdn.example/img?id=abc&amp;width=1200">')
    expect(await fetchOgImage('https://src.example/1')).toBe('https://cdn.example/img?id=abc&width=1200')
  })

  it('decodes numeric and hex entities', async () => {
    mockHtml('<meta property="og:image" content="https://cdn.example/img?a=1&#38;b=2&#x26;c=3">')
    expect(await fetchOgImage('https://src.example/1')).toBe('https://cdn.example/img?a=1&b=2&c=3')
  })

  it('handles the reversed content-before-property attribute order', async () => {
    mockHtml('<meta content="https://cdn.example/x.png?u=1&amp;v=2" property="og:image">')
    expect(await fetchOgImage('https://src.example/1')).toBe('https://cdn.example/x.png?u=1&v=2')
  })

  it('returns null when there is no og:image', async () => {
    mockHtml('<meta name="description" content="no image here">')
    expect(await fetchOgImage('https://src.example/1')).toBeNull()
  })

  it('returns null for a non-absolute URL', async () => {
    mockHtml('<meta property="og:image" content="/relative/path.jpg">')
    expect(await fetchOgImage('https://src.example/1')).toBeNull()
  })

  it('returns null when the page answers with an error status', async () => {
    mockGet.mockRejectedValue(Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } }))
    expect(await fetchOgImage('https://src.example/1')).toBeNull()
  })
})

describe('fetchOgImage: la pagina de un tercero no puede mandar al servidor hacia adentro', () => {
  it('no hace ninguna peticion a una IP privada o de loopback', async () => {
    expect(await fetchOgImage('http://127.0.0.1:8080/admin')).toBeNull()
    expect(await fetchOgImage('http://169.254.169.254/metadata/instance')).toBeNull()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('no sigue una redireccion hacia una direccion interna', async () => {
    mockGet.mockResolvedValueOnce({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' }, data: '' })
    expect(await fetchOgImage('https://src.example/1')).toBeNull()
    // Solo la primera peticion, la publica: el destino interno nunca se pide.
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('no pide un host publico cuyo DNS ahora resuelve a una direccion privada (rebinding)', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
    expect(await fetchOgImage('https://rebind.example/1')).toBeNull()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('sigue una redireccion legitima hacia otra pagina publica', async () => {
    mockGet
      .mockResolvedValueOnce({ status: 301, headers: { location: 'https://www.src.example/1' }, data: '' })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: '<meta property="og:image" content="https://cdn.example/hero.jpg">' })
    expect(await fetchOgImage('https://src.example/1')).toBe('https://cdn.example/hero.jpg')
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('pone un tope al tamaño de la respuesta', async () => {
    mockHtml('<meta property="og:image" content="https://cdn.example/hero.jpg">')
    await fetchOgImage('https://src.example/1')
    expect(mockGet.mock.calls[0][1]).toMatchObject({ responseType: 'text', maxContentLength: expect.any(Number) })
  })
})
