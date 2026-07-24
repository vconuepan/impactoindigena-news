import { describe, it, expect } from 'vitest'
import { deviceType, dailyVisitorHash, clientIpForAnalytics } from './analyticsVisitor.js'

describe('deviceType', () => {
  it('detects mobile', () => {
    expect(deviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile')
    expect(deviceType('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36')).toBe('mobile')
  })
  it('detects tablet', () => {
    expect(deviceType('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1')).toBe('tablet')
    expect(deviceType('Mozilla/5.0 (Linux; Android 14; SM-X200) Safari/537.36')).toBe('tablet') // Android, no "mobile"
  })
  it('detects desktop', () => {
    expect(deviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1')).toBe('desktop')
    expect(deviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('desktop')
  })
  it('defaults to desktop for empty/unknown UA', () => {
    expect(deviceType('')).toBe('desktop')
    expect(deviceType(undefined)).toBe('desktop')
    expect(deviceType(null)).toBe('desktop')
  })
})

describe('dailyVisitorHash', () => {
  const day = '2026-07-20'
  it('is stable for the same visitor within a day', () => {
    expect(dailyVisitorHash('1.1.1.1', 'UA-x', day)).toBe(dailyVisitorHash('1.1.1.1', 'UA-x', day))
  })
  it('differs for different IPs', () => {
    expect(dailyVisitorHash('1.1.1.1', 'UA-x', day)).not.toBe(dailyVisitorHash('2.2.2.2', 'UA-x', day))
  })
  it('differs for different user-agents', () => {
    expect(dailyVisitorHash('1.1.1.1', 'UA-x', day)).not.toBe(dailyVisitorHash('1.1.1.1', 'UA-y', day))
  })
  it('rotates across days (no cross-day correlation)', () => {
    expect(dailyVisitorHash('1.1.1.1', 'UA-x', day)).not.toBe(dailyVisitorHash('1.1.1.1', 'UA-x', '2026-07-21'))
  })
  it('produces a 64-char hex sha256 digest', () => {
    expect(dailyVisitorHash('1.1.1.1', 'UA-x', day)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('clientIpForAnalytics', () => {
  // Regression: behind the SWA linked-backend proxy, req.ip was the proxy's
  // West Europe egress → every visitor recorded as country NL (prod, 23-jul).
  it('takes the first X-Forwarded-For entry (original client)', () => {
    expect(clientIpForAnalytics('190.20.30.40, 10.0.0.1', '10.0.0.1')).toBe('190.20.30.40')
  })
  it('strips an IPv4 port suffix (Azure SWA sends ip:port)', () => {
    expect(clientIpForAnalytics('190.20.30.40:51840', '10.0.0.1')).toBe('190.20.30.40')
  })
  it('handles bracketed IPv6 with port', () => {
    expect(clientIpForAnalytics('[2001:db8::1]:443', '10.0.0.1')).toBe('2001:db8::1')
  })
  it('keeps a bare IPv6 address intact', () => {
    expect(clientIpForAnalytics('2001:db8::1', '10.0.0.1')).toBe('2001:db8::1')
  })
  it('falls back to req.ip when the header is missing or empty', () => {
    expect(clientIpForAnalytics(undefined, '10.0.0.9')).toBe('10.0.0.9')
    expect(clientIpForAnalytics('', '10.0.0.9')).toBe('10.0.0.9')
  })
  it('accepts the array form of the header', () => {
    expect(clientIpForAnalytics(['190.20.30.40, 10.0.0.1'], '10.0.0.1')).toBe('190.20.30.40')
  })
})
