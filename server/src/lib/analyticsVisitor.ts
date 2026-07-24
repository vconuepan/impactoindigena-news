import crypto from 'node:crypto'
import geoip from 'fast-geoip'

/**
 * Privacy-preserving, aggregate visitor signals derived server-side from the
 * request. No cookies, no stored IP/User-Agent — only a coarse device category,
 * a 2-letter country, and a daily-rotating one-way hash used to count distinct
 * visitors per day (the Plausible/Fathom model). None of it identifies a person
 * or survives across days.
 */

/** Coarse device category from a User-Agent. Kept deliberately coarse (no fine
 *  fingerprinting): mobile / tablet / desktop. */
export function deviceType(ua: string | undefined | null): 'mobile' | 'tablet' | 'desktop' {
  const s = (ua || '').toLowerCase()
  if (!s) return 'desktop'
  // Tablets first: iPad, Android without "mobile", and common tablet tokens.
  if (/ipad|tablet|playbook|silk|kindle/.test(s) || (/android/.test(s) && !/mobile/.test(s))) {
    return 'tablet'
  }
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini|windows phone/.test(s)) {
    return 'mobile'
  }
  return 'desktop'
}

// Daily salt kept ONLY in memory and regenerated when the day changes. Because
// it is never persisted and rotates every day, a visitor hash cannot be
// correlated across days nor reversed to an IP. A server restart mid-day
// generates a fresh salt (a visitor may be counted twice that day) — an
// accepted, minor over-count, in exchange for storing no secret.
let currentSalt: Buffer = crypto.randomBytes(32)
let currentSaltDay = ''
function saltForDay(dayStr: string): Buffer {
  if (dayStr !== currentSaltDay) {
    currentSalt = crypto.randomBytes(32)
    currentSaltDay = dayStr
  }
  return currentSalt
}

/**
 * Non-reversible daily visitor fingerprint: sha256(dailySalt + ip + ua).
 * Same visitor within a day → same hash (lets us dedupe to count unique
 * visitors); the next day the salt rotates so the hash changes (no cross-day
 * tracking). `dayStr` should be the UTC day (YYYY-MM-DD).
 */
export function dailyVisitorHash(ip: string, ua: string | undefined | null, dayStr: string): string {
  return crypto
    .createHash('sha256')
    .update(saltForDay(dayStr))
    .update(ip)
    .update('|')
    .update(ua || '')
    .digest('hex')
}

/**
 * Best client IP for ANALYTICS purposes. Behind the Azure Static Web App
 * linked-backend proxy, req.ip resolves to the proxy's egress (West Europe →
 * every visitor geolocated "NL", observed in production 23-jul-2026). The
 * original client is the FIRST entry of X-Forwarded-For, which the SWA proxy
 * appends as "ip" or "ip:port". Spoofable by a direct caller, which is fine
 * here: this feeds aggregate analytics only — rate limiting keeps using req.ip.
 */
export function clientIpForAnalytics(
  xff: string | string[] | undefined,
  fallback: string | undefined,
): string | undefined {
  const raw = Array.isArray(xff) ? xff[0] : xff
  const first = raw?.split(',')[0]?.trim()
  if (!first) return fallback
  // "[2001:db8::1]:443" → "2001:db8::1"
  const bracketed = first.match(/^\[([^\]]+)\]/)
  if (bracketed) return bracketed[1]
  // "203.0.113.7:51840" → "203.0.113.7" (lone colon = IPv4:port; multiple = bare IPv6)
  const colons = (first.match(/:/g) || []).length
  if (colons === 1) return first.split(':')[0]
  return first
}

/** 2-letter country code from an IP (aggregate geo). 'XX' when unknown/private. */
export async function lookupCountry(ip: string): Promise<string> {
  try {
    const geo = await geoip.lookup(ip)
    return geo?.country || 'XX'
  } catch {
    return 'XX'
  }
}
