import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isAllowedUrl, assertUrlAllowed } from './urlValidation.js'

const mockLookup = vi.hoisted(() => vi.fn())
vi.mock('node:dns/promises', () => ({ lookup: mockLookup }))

describe('isAllowedUrl', () => {
  it('allows standard HTTPS URLs', () => {
    expect(isAllowedUrl('https://example.com/article')).toBe(true)
    expect(isAllowedUrl('https://news.ycombinator.com/item?id=123')).toBe(true)
    expect(isAllowedUrl('https://www.bbc.co.uk/news/article')).toBe(true)
  })

  it('allows standard HTTP URLs', () => {
    expect(isAllowedUrl('http://example.com/article')).toBe(true)
  })

  it('blocks non-HTTP protocols', () => {
    expect(isAllowedUrl('ftp://example.com/file')).toBe(false)
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false)
  })

  it('blocks localhost', () => {
    expect(isAllowedUrl('http://localhost/admin')).toBe(false)
    expect(isAllowedUrl('http://localhost:3000/api')).toBe(false)
    expect(isAllowedUrl('http://LOCALHOST/admin')).toBe(false)
  })

  it('blocks loopback addresses', () => {
    expect(isAllowedUrl('http://127.0.0.1/admin')).toBe(false)
    expect(isAllowedUrl('http://127.0.0.1:8080/api')).toBe(false)
    expect(isAllowedUrl('http://[::1]/admin')).toBe(false)
  })

  it('blocks private network ranges (10.x.x.x)', () => {
    expect(isAllowedUrl('http://10.0.0.1/internal')).toBe(false)
    expect(isAllowedUrl('http://10.255.255.255/internal')).toBe(false)
  })

  it('blocks private network ranges (172.16-31.x.x)', () => {
    expect(isAllowedUrl('http://172.16.0.1/internal')).toBe(false)
    expect(isAllowedUrl('http://172.31.255.255/internal')).toBe(false)
  })

  it('blocks private network ranges (192.168.x.x)', () => {
    expect(isAllowedUrl('http://192.168.0.1/internal')).toBe(false)
    expect(isAllowedUrl('http://192.168.1.100/internal')).toBe(false)
  })

  it('blocks link-local / cloud metadata (169.254.x.x)', () => {
    expect(isAllowedUrl('http://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isAllowedUrl('http://169.254.0.1/metadata')).toBe(false)
  })

  it('blocks 0.0.0.0', () => {
    expect(isAllowedUrl('http://0.0.0.0/')).toBe(false)
  })

  it('blocks IPv6 private addresses', () => {
    expect(isAllowedUrl('http://[fc00::1]/')).toBe(false)
    expect(isAllowedUrl('http://[fe80::1]/')).toBe(false)
  })

  it('blocks .internal and .local domains', () => {
    expect(isAllowedUrl('http://service.internal/api')).toBe(false)
    expect(isAllowedUrl('http://printer.local/status')).toBe(false)
  })

  it('returns false for invalid URLs', () => {
    expect(isAllowedUrl('not-a-url')).toBe(false)
    expect(isAllowedUrl('')).toBe(false)
  })

  it('blocks alternate IPv4 encodings that URL normalizes to private IPs', () => {
    // WHATWG URL normalizes these; the guard must catch the normalized form
    expect(isAllowedUrl('http://2130706433/')).toBe(false) // 127.0.0.1 decimal
    expect(isAllowedUrl('http://0x7f000001/')).toBe(false) // 127.0.0.1 hex
    expect(isAllowedUrl('http://0177.0.0.1/')).toBe(false) // 127.0.0.1 octal
    expect(isAllowedUrl('http://127.1/')).toBe(false) // 127.0.0.1 short form
    expect(isAllowedUrl('http://2852039166/')).toBe(false) // 169.254.169.254 decimal
  })

  it('blocks IPv4-mapped and IPv4-compatible IPv6 addresses', () => {
    expect(isAllowedUrl('http://[::ffff:127.0.0.1]/')).toBe(false)
    expect(isAllowedUrl('http://[::ffff:7f00:1]/')).toBe(false)
    expect(isAllowedUrl('http://[::ffff:169.254.169.254]/')).toBe(false)
    expect(isAllowedUrl('http://[::ffff:a9fe:a9fe]/')).toBe(false)
  })

  it('blocks additional IPv6 reserved ranges', () => {
    expect(isAllowedUrl('http://[::1]/')).toBe(false) // loopback
    expect(isAllowedUrl('http://[::]/')).toBe(false) // unspecified
    expect(isAllowedUrl('http://[fd00::1]/')).toBe(false) // unique local
    expect(isAllowedUrl('http://[ff02::1]/')).toBe(false) // multicast
  })

  it('blocks CGNAT and additional reserved IPv4 ranges', () => {
    expect(isAllowedUrl('http://100.64.0.1/')).toBe(false) // CGNAT
    expect(isAllowedUrl('http://192.0.0.1/')).toBe(false) // IETF protocol
    expect(isAllowedUrl('http://224.0.0.1/')).toBe(false) // multicast
  })

  it('still allows legitimate public addresses', () => {
    expect(isAllowedUrl('https://8.8.8.8/')).toBe(true)
    expect(isAllowedUrl('https://1.1.1.1/')).toBe(true)
    expect(isAllowedUrl('https://[2606:4700:4700::1111]/')).toBe(true)
  })
})

describe('assertUrlAllowed', () => {
  beforeEach(() => mockLookup.mockReset())

  it('rejects a URL that fails the synchronous guard without resolving DNS', async () => {
    await expect(assertUrlAllowed('http://127.0.0.1/')).rejects.toThrow()
    expect(mockLookup).not.toHaveBeenCalled()
  })

  it('rejects a public hostname that resolves to a private address (DNS rebinding)', async () => {
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }])
    await expect(assertUrlAllowed('https://evil.example.com/')).rejects.toThrow(/private address/)
  })

  it('rejects when any resolved address is private', async () => {
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ])
    await expect(assertUrlAllowed('https://mixed.example.com/')).rejects.toThrow(/private address/)
  })

  it('allows a public hostname that resolves to public addresses', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    await expect(assertUrlAllowed('https://example.com/feed.xml')).resolves.toBeUndefined()
  })

  it('does not resolve DNS for literal IP hosts', async () => {
    await expect(assertUrlAllowed('https://8.8.8.8/')).resolves.toBeUndefined()
    expect(mockLookup).not.toHaveBeenCalled()
  })
})
