import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAxiosGet = vi.hoisted(() => vi.fn())
const mockParseString = vi.hoisted(() => vi.fn())

vi.mock('axios', () => ({
  default: { get: mockAxiosGet },
}))

vi.mock('../lib/retry.js', () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
  isRetryableError: () => true,
}))

vi.mock('rss-parser', () => {
  return {
    default: class MockParser {
      parseString = mockParseString
    },
  }
})

const { parseFeed } = await import('./rssParser.js')

function axiosResponse(data: string, status = 200, headers: Record<string, string> = {}) {
  return { status, data, headers }
}

describe('parseFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses RSS items from feed', async () => {
    mockAxiosGet.mockResolvedValue(axiosResponse('<rss></rss>'))
    mockParseString.mockResolvedValue({
      items: [
        {
          link: 'https://example.com/article-1',
          title: 'Article 1',
          isoDate: '2024-01-15T00:00:00Z',
          contentSnippet: 'A short description',
        },
        {
          link: 'https://example.com/article-2',
          title: 'Article 2',
          pubDate: 'Mon, 15 Jan 2024 00:00:00 GMT',
          content: '<p>HTML content</p>',
        },
      ],
    })

    const result = await parseFeed('https://example.com/rss')

    expect(result.notModified).toBe(false)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      url: 'https://example.com/article-1',
      title: 'Article 1',
      datePublished: '2024-01-15T00:00:00Z',
      description: 'A short description',
    })
    expect(result.items[1]).toMatchObject({
      url: 'https://example.com/article-2',
      title: 'Article 2',
      datePublished: 'Mon, 15 Jan 2024 00:00:00 GMT',
      description: '<p>HTML content</p>',
    })
  })

  it('skips items without links', async () => {
    mockAxiosGet.mockResolvedValue(axiosResponse('<rss></rss>'))
    mockParseString.mockResolvedValue({
      items: [
        { title: 'No link' },
        { link: 'https://example.com/valid', title: 'Valid' },
      ],
    })

    const result = await parseFeed('https://example.com/rss')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].url).toBe('https://example.com/valid')
  })

  it('limits to configured item cap', async () => {
    const manyItems = Array.from({ length: 40 }, (_, i) => ({
      link: `https://example.com/article-${i}`,
      title: `Article ${i}`,
    }))
    mockAxiosGet.mockResolvedValue(axiosResponse('<rss></rss>'))
    mockParseString.mockResolvedValue({ items: manyItems })

    const result = await parseFeed('https://example.com/rss')
    expect(result.items).toHaveLength(30)
  })

  it('defaults title to Untitled when missing', async () => {
    mockAxiosGet.mockResolvedValue(axiosResponse('<rss></rss>'))
    mockParseString.mockResolvedValue({
      items: [{ link: 'https://example.com/no-title' }],
    })

    const result = await parseFeed('https://example.com/rss')
    expect(result.items[0].title).toBe('Untitled')
  })

  it('returns empty result on error', async () => {
    mockAxiosGet.mockRejectedValue(new Error('Network error'))

    const result = await parseFeed('https://bad-url.com/rss')
    expect(result.items).toEqual([])
    expect(result.notModified).toBe(false)
  })

  it('returns notModified true on 304 response', async () => {
    mockAxiosGet.mockResolvedValue(axiosResponse('', 304))

    const result = await parseFeed('https://example.com/rss', {
      etag: '"abc123"',
      lastModified: 'Sat, 01 Jan 2024 00:00:00 GMT',
    })

    expect(result.notModified).toBe(true)
    expect(result.items).toEqual([])
    expect(result.cacheHeaders.etag).toBe('"abc123"')
    expect(result.cacheHeaders.lastModified).toBe('Sat, 01 Jan 2024 00:00:00 GMT')
    expect(mockParseString).not.toHaveBeenCalled()
  })

  it('sends conditional headers when provided', async () => {
    mockAxiosGet.mockResolvedValue(axiosResponse('<rss></rss>'))
    mockParseString.mockResolvedValue({ items: [] })

    await parseFeed('https://example.com/rss', {
      etag: '"etag-value"',
      lastModified: 'Fri, 01 Dec 2023 00:00:00 GMT',
    })

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://example.com/rss',
      expect.objectContaining({
        headers: expect.objectContaining({
          'If-None-Match': '"etag-value"',
          'If-Modified-Since': 'Fri, 01 Dec 2023 00:00:00 GMT',
        }),
      })
    )
  })

  it('extracts cache headers from response', async () => {
    mockAxiosGet.mockResolvedValue(axiosResponse('<rss></rss>', 200, {
      'etag': '"new-etag"',
      'last-modified': 'Sun, 15 Jan 2024 00:00:00 GMT',
    }))
    mockParseString.mockResolvedValue({ items: [] })

    const result = await parseFeed('https://example.com/rss')

    expect(result.cacheHeaders.etag).toBe('"new-etag"')
    expect(result.cacheHeaders.lastModified).toBe('Sun, 15 Jan 2024 00:00:00 GMT')
  })

  it('does not send conditional headers when none provided', async () => {
    mockAxiosGet.mockResolvedValue(axiosResponse('<rss></rss>'))
    mockParseString.mockResolvedValue({ items: [] })

    await parseFeed('https://example.com/rss')

    const callHeaders = mockAxiosGet.mock.calls[0][1].headers
    expect(callHeaders['If-None-Match']).toBeUndefined()
    expect(callHeaders['If-Modified-Since']).toBeUndefined()
  })

  it('passes maxContentLength and responseType to axios', async () => {
    mockAxiosGet.mockResolvedValue(axiosResponse('<rss></rss>'))
    mockParseString.mockResolvedValue({ items: [] })

    await parseFeed('https://example.com/rss')

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://example.com/rss',
      expect.objectContaining({
        maxContentLength: 5 * 1024 * 1024,
        responseType: 'text',
      })
    )
  })

  // Sitemap como fuente para los municipios sin RSS (12-oct-2026; ver sitemapFeed.ts).
  describe('sitemap', () => {
    const reciente = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://nuevaimperial.cl/noticias</loc><lastmod>${reciente}</lastmod></url>
      <url><loc>https://nuevaimperial.cl/noticias/trafkintu-en-la-plaza-24694</loc><lastmod>${reciente}</lastmod></url>
      <url><loc>https://nuevaimperial.cl/secciones/turismo/rutas</loc><lastmod>${reciente}</lastmod></url>
    </urlset>`

    it('un urlset no pasa por el parser RSS y entrega las URL recientes', async () => {
      mockAxiosGet.mockResolvedValue(axiosResponse(SITEMAP, 200, { etag: '"abc"' }))

      const result = await parseFeed('https://nuevaimperial.cl/sitemap.xml')

      expect(mockParseString).not.toHaveBeenCalled()
      expect(result.error).toBeNull()
      expect(result.cacheHeaders).toEqual({ etag: '"abc"', lastModified: null })
      expect(result.items.map((i) => i.url).sort()).toEqual([
        'https://nuevaimperial.cl/noticias/trafkintu-en-la-plaza-24694',
        'https://nuevaimperial.cl/secciones/turismo/rutas',
      ])
    })

    it('el filtro #solo= se aplica y no viaja al servidor', async () => {
      mockAxiosGet.mockResolvedValue(axiosResponse(SITEMAP))

      const result = await parseFeed('https://nuevaimperial.cl/sitemap.xml#solo=/noticias/')

      expect(mockAxiosGet).toHaveBeenCalledWith('https://nuevaimperial.cl/sitemap.xml', expect.anything())
      expect(result.items.map((i) => i.url)).toEqual(['https://nuevaimperial.cl/noticias/trafkintu-en-la-plaza-24694'])
    })

    it('un indice de sitemaps devuelve un error legible, no un feed vacio', async () => {
      mockAxiosGet.mockResolvedValue(
        axiosResponse('<?xml version="1.0"?><sitemapindex xmlns="x"><sitemap><loc>https://a.cl/post-sitemap.xml</loc></sitemap></sitemapindex>'),
      )

      const result = await parseFeed('https://mtraiguen.cl/sitemap_index.xml')

      expect(mockParseString).not.toHaveBeenCalled()
      expect(result.items).toEqual([])
      expect(result.error).toMatch(/sitemap hijo/)
    })
  })
})

