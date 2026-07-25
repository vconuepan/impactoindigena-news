import crypto from 'node:crypto'
import geoip from 'fast-geoip'

/**
 * Privacy-preserving, aggregate visitor signals derived server-side from the
 * request. No cookies, no stored IP/User-Agent — only a coarse device category,
 * a 2-letter country, and a daily-rotating one-way hash used to count distinct
 * visitors per day (the Plausible/Fathom model). None of it identifies a person
 * or survives across days.
 */

// Self-declared automated clients. Analytics should count readers, not crawlers:
// Googlebot renders JS (mobile-first UA), so it fires the same /api/track beacon a
// human does — on 23-jul-2026 that inflated a day to ~180 "visitors" spread flat
// across dozens of deep stories, which is a sitemap sweep, not an audience. This
// is the same first line of defense Plausible/Fathom use: trust the UA token that
// well-behaved bots publish. Bots that lie are not detectable here, and that is
// an accepted limit — aggregate analytics, not security.
const BOT_TOKENS = [
  // Generic self-identification
  'bot', 'crawler', 'spider', 'crawling', 'slurp',
  // Search engines / SEO suites
  'googlebot', 'adsbot', 'mediapartners', 'apis-google', 'feedfetcher',
  'google-inspectiontool', 'storebot-google', 'bingpreview', 'yandex',
  'baiduspider', 'applebot', 'semrush', 'ahrefs', 'mj12', 'dotbot', 'petal',
  'dataforseo', 'screaming frog', 'sitebulb', 'serpstat',
  // AI / LLM fetchers
  'gptbot', 'chatgpt-user', 'oai-searchbot', 'claudebot', 'claude-web',
  'anthropic-ai', 'perplexity', 'ccbot', 'bytespider', 'amazonbot',
  'meta-externalagent', 'applebot-extended',
  // Link-preview unfurlers (chat/social)
  'facebookexternalhit', 'facebot', 'twitterbot', 'slackbot', 'discordbot',
  'telegrambot', 'whatsapp', 'linkedinbot', 'embedly', 'redditbot', 'skypeuripreview',
  // Headless browsers, monitoring, scripted HTTP clients
  'headlesschrome', 'phantomjs', 'puppeteer', 'playwright', 'chrome-lighthouse',
  'pagespeed', 'gtmetrix', 'pingdom', 'uptimerobot', 'python-requests', 'scrapy',
  'curl/', 'wget', 'go-http-client', 'okhttp', 'java/', 'node-fetch', 'axios/',
  'libwww-perl', 'httpclient', 'guzzle',
]

/**
 * True when the User-Agent self-identifies as an automated client. Used to skip
 * recording entirely, so page views and unique visitors reflect people.
 * A missing UA also counts as a bot: every real browser sends one.
 */
export function isBot(ua: string | undefined | null): boolean {
  if (!ua) return true
  const s = ua.toLowerCase()
  return BOT_TOKENS.some((t) => s.includes(t))
}

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
