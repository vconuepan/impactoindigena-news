import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: { get: mockGet } }))

const mockAssert = vi.hoisted(() => vi.fn())
vi.mock('../utils/urlValidation.js', () => ({ assertUrlAllowed: mockAssert }))

const { safeAxiosGet } = await import('./safeHttp.js')

describe('safeAxiosGet — SSRF guard on the initial URL and every redirect hop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssert.mockResolvedValue(undefined)
  })

  it('validates the initial URL and returns a 2xx response', async () => {
    mockGet.mockResolvedValue({ status: 200, data: 'ok', headers: {} })
    const res = await safeAxiosGet('https://a.com/feed', {})
    expect(mockAssert).toHaveBeenCalledWith('https://a.com/feed')
    expect(res.status).toBe(200)
  })

  it('re-validates each redirect target with assertUrlAllowed (DNS) before following', async () => {
    mockGet
      .mockResolvedValueOnce({ status: 302, headers: { location: 'https://evil.com/x' }, data: '' })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: 'final' })
    const res = await safeAxiosGet('https://a.com/feed', {}, { maxRedirects: 3 })
    expect(mockAssert).toHaveBeenNthCalledWith(1, 'https://a.com/feed')
    expect(mockAssert).toHaveBeenNthCalledWith(2, 'https://evil.com/x') // the hop IS re-validated
    expect(res.data).toBe('final')
  })

  it('blocks a redirect whose target fails the SSRF guard (DNS rebinding) — never fetches it', async () => {
    mockGet.mockResolvedValueOnce({ status: 302, headers: { location: 'https://rebind.evil/x' }, data: '' })
    mockAssert.mockImplementation(async (u: string) => {
      if (u.includes('rebind')) throw new Error('Blocked host resolving to private address')
    })
    await expect(safeAxiosGet('https://a.com/feed', {}, { maxRedirects: 3 })).rejects.toThrow(/Blocked/)
    expect(mockGet).toHaveBeenCalledTimes(1) // the private target is never requested
  })

  it('returns a non-redirect 3xx (304 Not Modified) without following it', async () => {
    mockGet.mockResolvedValue({ status: 304, headers: {}, data: '' })
    const res = await safeAxiosGet('https://a.com/feed', {}, { isNonRedirect: (s) => s === 304 })
    expect(res.status).toBe(304)
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('throws when redirects exceed the limit', async () => {
    mockGet.mockResolvedValue({ status: 302, headers: { location: 'https://a.com/loop' }, data: '' })
    await expect(safeAxiosGet('https://a.com/feed', {}, { maxRedirects: 2 })).rejects.toThrow(/Too many redirects/)
  })
})
