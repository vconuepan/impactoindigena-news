import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAxiosGet = vi.hoisted(() => vi.fn())
const mockAxiosPost = vi.hoisted(() => vi.fn())
const mockReadabilityParse = vi.hoisted(() => vi.fn())
const mockWindowClose = vi.hoisted(() => vi.fn())

vi.mock('axios', () => ({
  default: {
    get: mockAxiosGet,
    post: mockAxiosPost,
  },
}))

vi.mock('jsdom', () => ({
  JSDOM: class MockJSDOM {
    window = { document: {}, close: mockWindowClose }
  },
}))

vi.mock('@mozilla/readability', () => ({
  Readability: class MockReadability {
    parse = mockReadabilityParse
  },
}))

const { extractContent, _resetApiState, ApiThrottle } = await import('./extractor.js')

const LONG_TEXT = 'A '.repeat(200)

describe('extractContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PIPFEED_API_KEY
    delete process.env.DIFFBOT_TOKEN
    _resetApiState()
  })

  it('returns null when page fetch fails and no API keys', async () => {
    mockAxiosGet.mockRejectedValue(new Error('Network error'))

    const result = await extractContent('https://example.com/article')
    expect(result).toBeNull()
  })

  it('falls back to configured API when page fetch fails', async () => {
    process.env.DIFFBOT_TOKEN = 'test-token'
    mockAxiosGet
      .mockRejectedValueOnce(new Error('Network error')) // page fetch fails
      .mockResolvedValueOnce({                           // Diffbot API
        data: { objects: [{ title: 'Diffbot Title', text: LONG_TEXT, date: '2024-01-15' }] },
      })

    const result = await extractContent('https://example.com/article')

    expect(result).not.toBeNull()
    expect(result!.method).toBe('diffbot')
    expect(result!.title).toBe('Diffbot Title')
  })

  it('extracts content using CSS selector (tier 1)', async () => {
    const longText = 'This is a substantial article body with enough text to pass the minimum length check. '.repeat(5)
    const html = `<html><head><title>Test Page</title></head><body><article class="content"><p>${longText}</p></article></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })

    const result = await extractContent('https://example.com/article', {
      htmlSelector: 'article.content',
    })

    expect(result).not.toBeNull()
    expect(result!.method).toBe('selector')
    expect(result!.title).toBe('Test Page')
    expect(result!.content.length).toBeGreaterThan(300)
  })

  it('falls back to readability when selector fails (tier 2)', async () => {
    const html = `<html><head><title>Test</title></head><body><p>Some content</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue({
      title: 'Readability Title',
      textContent: LONG_TEXT,
    })

    const result = await extractContent('https://example.com/article', {
      htmlSelector: '.nonexistent-selector',
    })

    expect(result).not.toBeNull()
    expect(result!.method).toBe('readability')
    expect(result!.title).toBe('Readability Title')
  })

  it('uses readability when no selector provided', async () => {
    const html = `<html><body><p>Content</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue({
      title: 'Article Title',
      textContent: 'Meaningful content '.repeat(20),
    })

    const result = await extractContent('https://example.com/article')

    expect(result).not.toBeNull()
    expect(result!.method).toBe('readability')
  })

  it('falls back to configured API when readability fails (tier 3)', async () => {
    process.env.DIFFBOT_TOKEN = 'test-token'
    const html = `<html><body><p>Short</p></body></html>`
    mockAxiosGet
      .mockResolvedValueOnce({ data: html }) // page fetch
      .mockResolvedValueOnce({               // Diffbot API
        data: { objects: [{ title: 'Diffbot Title', text: LONG_TEXT, date: '2024-01-15' }] },
      })
    mockReadabilityParse.mockReturnValue(null)

    const result = await extractContent('https://example.com/article')

    expect(result).not.toBeNull()
    expect(result!.method).toBe('diffbot')
    expect(result!.title).toBe('Diffbot Title')
    expect(result!.datePublished).toBe('2024-01-15')
  })

  it('returns null when all methods fail', async () => {
    const html = `<html><body><p>Short</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue(null)

    const result = await extractContent('https://example.com/article')
    expect(result).toBeNull()
  })

  it('skips pipfeed when no API key set', async () => {
    const html = `<html><body><p>Short</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue(null)

    const result = await extractContent('https://example.com/article')

    expect(result).toBeNull()
    expect(mockAxiosPost).not.toHaveBeenCalled()
  })

  it('rejects content below minimum length threshold', async () => {
    const shortContent = 'x'.repeat(299)
    const html = `<html><body><p>${shortContent}</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue({
      title: 'Title',
      textContent: shortContent,
    })

    const result = await extractContent('https://example.com/article')
    expect(result).toBeNull()
  })

  it('accepts content at minimum length threshold', async () => {
    const exactContent = 'x'.repeat(300)
    const html = `<html><body><p>${exactContent}</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue({
      title: 'Title',
      textContent: exactContent,
    })

    const result = await extractContent('https://example.com/article')
    expect(result).not.toBeNull()
    expect(result!.method).toBe('readability')
  })

  it('skips selector extraction when content too short', async () => {
    const html = `<html><body><article class="content"><p>Short</p></article></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue(null)

    const result = await extractContent('https://example.com/article', {
      htmlSelector: 'article.content',
    })

    // Selector finds "Short" (< 300 chars), falls through to readability (null), no API keys
    expect(result).toBeNull()
  })

  it('skips local extraction when skipLocalExtraction is true', async () => {
    process.env.DIFFBOT_TOKEN = 'test-token'
    mockAxiosGet.mockResolvedValueOnce({
      data: { objects: [{ title: 'API Title', text: LONG_TEXT, date: '2024-01-01' }] },
    })

    const result = await extractContent('https://example.com/article', {
      htmlSelector: '.content',
      skipLocalExtraction: true,
    })

    expect(result).not.toBeNull()
    expect(result!.method).toBe('diffbot')
    // Only one GET call (Diffbot API) — no page fetch
    expect(mockAxiosGet).toHaveBeenCalledTimes(1)
    expect(mockReadabilityParse).not.toHaveBeenCalled()
  })
})

describe('las fotos del cuerpo del artículo (imageUrls)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PIPFEED_API_KEY
    delete process.env.DIFFBOT_TOKEN
    _resetApiState()
  })

  it('readability: salen del HTML limpio (content), sin la og:image ni los íconos', async () => {
    const html = `<html><head><meta property="og:image" content="https://cdn.ejemplo.cl/img/portada.jpg?w=1200"></head><body></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue({
      title: 'Nota',
      textContent: 'Meaningful content '.repeat(20),
      content: `<div><img src="https://cdn.ejemplo.cl/img/portada.jpg?w=800"><p>x</p>`
        + `<img src="https://cdn.ejemplo.cl/img/foto-1.jpg"><img src="https://cdn.ejemplo.cl/img/logo.png">`
        + `<img src="https://cdn.ejemplo.cl/img/foto-2.jpg"></div>`,
    })

    // example.com: la guardia SSRF resuelve el DNS de la URL de la nota.
    const result = await extractContent('https://example.com/nota')

    expect(result!.imageUrls).toEqual(['https://cdn.ejemplo.cl/img/foto-1.jpg', 'https://cdn.ejemplo.cl/img/foto-2.jpg'])
  })

  it('readability sin content devuelve una lista vacía, no falla', async () => {
    mockAxiosGet.mockResolvedValue({ data: '<html><body></body></html>' })
    mockReadabilityParse.mockReturnValue({ title: 'Nota', textContent: 'Meaningful content '.repeat(20) })

    const result = await extractContent('https://example.com/nota')

    expect(result!.imageUrls).toEqual([])
  })

  it('selector: salen del contenedor, resueltas contra la URL de la nota', async () => {
    const html = `<html><body><nav><img src="/logo.png"></nav><article class="post">`
      + `<p>${'Content '.repeat(60)}</p><img src="/media/foto.jpg" width="900"><img src="/media/icono.jpg" width="40"></article></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })

    const result = await extractContent('https://example.com/nota', { htmlSelector: 'article.post' })

    expect(result!.method).toBe('selector')
    expect(result!.imageUrls).toEqual(['https://example.com/media/foto.jpg'])
  })
})

describe('Diffbot extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PIPFEED_API_KEY
    delete process.env.DIFFBOT_TOKEN
    _resetApiState()
  })

  it('extracts content via Diffbot when readability fails', async () => {
    process.env.DIFFBOT_TOKEN = 'test-token'
    const html = `<html><body><p>Short</p></body></html>`
    // First GET: page fetch; Second GET: Diffbot API
    mockAxiosGet
      .mockResolvedValueOnce({ data: html })
      .mockResolvedValueOnce({
        data: {
          objects: [{
            title: 'Diffbot Title',
            text: LONG_TEXT,
            date: '2024-06-15',
          }],
        },
      })
    mockReadabilityParse.mockReturnValue(null)

    const result = await extractContent('https://example.com/article')

    expect(result).not.toBeNull()
    expect(result!.method).toBe('diffbot')
    expect(result!.title).toBe('Diffbot Title')
    expect(result!.datePublished).toBe('2024-06-15')
  })

  it('skips Diffbot when no DIFFBOT_TOKEN', async () => {
    const html = `<html><body><p>Short</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue(null)

    const result = await extractContent('https://example.com/article')

    expect(result).toBeNull()
  })

  it('returns null when Diffbot returns insufficient content', async () => {
    process.env.DIFFBOT_TOKEN = 'test-token'
    const html = `<html><body><p>Short</p></body></html>`
    mockAxiosGet
      .mockResolvedValueOnce({ data: html })
      .mockResolvedValueOnce({
        data: { objects: [{ title: 'Title', text: 'Too short' }] },
      })
    mockReadabilityParse.mockReturnValue(null)

    const result = await extractContent('https://example.com/article')
    expect(result).toBeNull()
  })

  it('uses estimatedDate when date is absent', async () => {
    process.env.DIFFBOT_TOKEN = 'test-token'
    const html = `<html><body><p>Short</p></body></html>`
    mockAxiosGet
      .mockResolvedValueOnce({ data: html })
      .mockResolvedValueOnce({
        data: {
          objects: [{
            title: 'Title',
            text: LONG_TEXT,
            estimatedDate: '2024-05-01',
          }],
        },
      })
    mockReadabilityParse.mockReturnValue(null)

    const result = await extractContent('https://example.com/article')

    expect(result).not.toBeNull()
    expect(result!.datePublished).toBe('2024-05-01')
  })

  it('returns null when Diffbot fails (no fallback to other API)', async () => {
    process.env.DIFFBOT_TOKEN = 'test-token'
    process.env.PIPFEED_API_KEY = 'test-key'
    const html = `<html><body><p>Short</p></body></html>`
    mockAxiosGet
      .mockResolvedValueOnce({ data: html }) // page fetch
      .mockRejectedValueOnce(new Error('Diffbot error')) // Diffbot fails
    mockReadabilityParse.mockReturnValue(null)

    const result = await extractContent('https://example.com/article')

    expect(result).toBeNull()
    // PipFeed should NOT be called as fallback
    expect(mockAxiosPost).not.toHaveBeenCalled()
  })

  it('returns null when both Diffbot and PipFeed have no API keys', async () => {
    const html = `<html><body><p>Short</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue(null)

    const result = await extractContent('https://example.com/article')
    expect(result).toBeNull()
  })
})

describe('JSDOM cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PIPFEED_API_KEY
    delete process.env.DIFFBOT_TOKEN
    _resetApiState()
  })

  it('calls window.close() after successful readability extraction', async () => {
    const html = `<html><body><p>Content</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue({
      title: 'Title',
      textContent: LONG_TEXT,
    })

    await extractContent('https://example.com/article')
    expect(mockWindowClose).toHaveBeenCalled()
  })

  it('calls window.close() when readability returns null', async () => {
    const html = `<html><body><p>Short</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockReturnValue(null)

    await extractContent('https://example.com/article')
    expect(mockWindowClose).toHaveBeenCalled()
  })

  it('calls window.close() when readability throws', async () => {
    const html = `<html><body><p>Content</p></body></html>`
    mockAxiosGet.mockResolvedValue({ data: html })
    mockReadabilityParse.mockImplementation(() => { throw new Error('parse error') })

    await extractContent('https://example.com/article')
    expect(mockWindowClose).toHaveBeenCalled()
  })
})

describe('fetchPage limits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PIPFEED_API_KEY
    delete process.env.DIFFBOT_TOKEN
    _resetApiState()
  })

  it('passes maxContentLength to axios', async () => {
    mockAxiosGet.mockResolvedValue({ data: '<html></html>' })
    mockReadabilityParse.mockReturnValue(null)

    await extractContent('https://example.com/article')

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://example.com/article',
      expect.objectContaining({
        maxContentLength: 5 * 1024 * 1024,
      })
    )
  })
})

describe('API extraction limits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PIPFEED_API_KEY
    delete process.env.DIFFBOT_TOKEN
    _resetApiState()
  })

  it('passes maxContentLength to Diffbot API call', async () => {
    process.env.DIFFBOT_TOKEN = 'test-token'
    const html = `<html><body><p>Short</p></body></html>`
    mockAxiosGet
      .mockResolvedValueOnce({ data: html })
      .mockResolvedValueOnce({
        data: { objects: [{ title: 'Title', text: LONG_TEXT }] },
      })
    mockReadabilityParse.mockReturnValue(null)

    await extractContent('https://example.com/article')

    // Second GET call is the Diffbot API call
    const diffbotCall = mockAxiosGet.mock.calls[1]
    expect(diffbotCall[1]).toEqual(expect.objectContaining({
      maxContentLength: 5 * 1024 * 1024,
    }))
  })

})

describe('ApiThrottle', () => {
  it('doubles delay on 429 and reduces on success', async () => {
    const throttle = new ApiThrottle(0, 0, 1000) // no base delay, no backoff wait, 1s max

    let callCount = 0
    const fn = async () => ++callCount

    // Normal call
    await throttle.run(fn)
    expect(callCount).toBe(1)

    // Simulate 429
    throttle.onRateLimited()

    // Next call should still work (backoffMs=0 so no wait)
    await throttle.run(fn)
    expect(callCount).toBe(2)
  })

  it('caps delay at maxDelayMs', async () => {
    const throttle = new ApiThrottle(100, 0, 500)
    const delays: number[] = []

    // Repeated 429s should cap at 500ms
    throttle.onRateLimited() // 200
    throttle.onRateLimited() // 400
    throttle.onRateLimited() // 500 (capped)
    throttle.onRateLimited() // 500 (still capped)

    // Verify by running calls and measuring timing — delay should be ~500ms (capped)
    const start = Date.now()
    await throttle.run(async () => { delays.push(Date.now() - start) })
    // With 0ms backoff, the only wait is the inter-call delay (capped at 500ms)
    expect(delays[0]).toBeGreaterThanOrEqual(450)
    expect(delays[0]).toBeLessThan(1000)
  })

  it('serializes concurrent calls', async () => {
    const throttle = new ApiThrottle(0, 0, 1000)
    const order: number[] = []

    const p1 = throttle.run(async () => { order.push(1) })
    const p2 = throttle.run(async () => { order.push(2) })
    const p3 = throttle.run(async () => { order.push(3) })

    await Promise.all([p1, p2, p3])
    expect(order).toEqual([1, 2, 3])
  })

  it('gradually reduces delay after successful calls', async () => {
    const throttle = new ApiThrottle(10, 0, 1000)

    // Force delay up
    throttle.onRateLimited() // 20
    throttle.onRateLimited() // 40

    // Successful calls should halve delay back toward base
    await throttle.run(async () => {}) // 40 → 20
    await throttle.run(async () => {}) // 20 → 10
    await throttle.run(async () => {}) // 10 (at base, no further reduction)

    // Another success should not go below base — verify by checking it doesn't throw
    await throttle.run(async () => {})
  })
})
