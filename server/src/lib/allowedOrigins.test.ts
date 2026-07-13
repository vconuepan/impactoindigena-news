import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Request } from 'express'
import { getAllowedOrigins, isTrustedOrigin } from './allowedOrigins.js'

const mkReq = (method: string, headers: Record<string, string> = {}): Request =>
  ({ method, headers } as unknown as Request)

describe('allowedOrigins', () => {
  const original = process.env.FRONTEND_URL

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://impactoindigena.news'
  })

  afterEach(() => {
    if (original !== undefined) process.env.FRONTEND_URL = original
    else delete process.env.FRONTEND_URL
  })

  it('includes FRONTEND_URL and localhost dev origins', () => {
    const origins = getAllowedOrigins()
    expect(origins).toContain('https://impactoindigena.news')
    expect(origins).toContain('http://localhost:5173')
  })

  it('allows all safe (non-mutating) methods regardless of origin', () => {
    expect(isTrustedOrigin(mkReq('GET'))).toBe(true)
    expect(isTrustedOrigin(mkReq('HEAD', { origin: 'https://evil.com' }))).toBe(true)
    expect(isTrustedOrigin(mkReq('OPTIONS'))).toBe(true)
  })

  it('accepts unsafe methods with an allowlisted Origin', () => {
    expect(isTrustedOrigin(mkReq('POST', { origin: 'https://impactoindigena.news' }))).toBe(true)
    expect(isTrustedOrigin(mkReq('DELETE', { origin: 'http://localhost:5173' }))).toBe(true)
  })

  it('rejects unsafe methods with a foreign Origin', () => {
    expect(isTrustedOrigin(mkReq('POST', { origin: 'https://evil.com' }))).toBe(false)
    expect(isTrustedOrigin(mkReq('DELETE', { origin: 'https://impactoindigena.news.evil.com' }))).toBe(false)
  })

  it('rejects unsafe methods with no Origin or Referer', () => {
    expect(isTrustedOrigin(mkReq('POST'))).toBe(false)
  })

  it('falls back to the Referer origin when Origin is absent', () => {
    expect(isTrustedOrigin(mkReq('POST', { referer: 'https://impactoindigena.news/comunidad/x' }))).toBe(true)
    expect(isTrustedOrigin(mkReq('POST', { referer: 'https://evil.com/attack' }))).toBe(false)
    expect(isTrustedOrigin(mkReq('POST', { referer: 'not-a-url' }))).toBe(false)
  })
})
