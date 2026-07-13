import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))
// Run the fetch body once, no backoff delays in tests.
vi.mock('./retry.js', () => ({ withRetry: (fn: () => unknown) => fn() }))

const { fetchOgImage } = await import('./extract-og-image.js')

function mockHtml(html: string, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 404, text: async () => html }) as any
}

describe('fetchOgImage', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('extracts the og:image URL', async () => {
    mockHtml('<meta property="og:image" content="https://cdn.example/hero.jpg">')
    expect(await fetchOgImage('https://src/1')).toBe('https://cdn.example/hero.jpg')
  })

  it('decodes &amp; in the URL (the double-escape bug that 400s on fetch)', async () => {
    mockHtml('<meta property="og:image" content="https://cdn.example/img?id=abc&amp;width=1200">')
    expect(await fetchOgImage('https://src/1')).toBe('https://cdn.example/img?id=abc&width=1200')
  })

  it('decodes numeric and hex entities', async () => {
    mockHtml('<meta property="og:image" content="https://cdn.example/img?a=1&#38;b=2&#x26;c=3">')
    expect(await fetchOgImage('https://src/1')).toBe('https://cdn.example/img?a=1&b=2&c=3')
  })

  it('handles the reversed content-before-property attribute order', async () => {
    mockHtml('<meta content="https://cdn.example/x.png?u=1&amp;v=2" property="og:image">')
    expect(await fetchOgImage('https://src/1')).toBe('https://cdn.example/x.png?u=1&v=2')
  })

  it('returns null when there is no og:image', async () => {
    mockHtml('<meta name="description" content="no image here">')
    expect(await fetchOgImage('https://src/1')).toBeNull()
  })

  it('returns null for a non-absolute URL', async () => {
    mockHtml('<meta property="og:image" content="/relative/path.jpg">')
    expect(await fetchOgImage('https://src/1')).toBeNull()
  })
})
