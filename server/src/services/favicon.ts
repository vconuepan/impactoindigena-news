import { access, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as cheerio from 'cheerio'
import { createLogger } from '../lib/logger.js'
import * as feedService from './feed.js'
import { assertUrlAllowed } from '../utils/urlValidation.js'

const log = createLogger('favicon')
const __dirname = dirname(fileURLToPath(import.meta.url))
const FAVICON_DIR = process.env.FAVICON_DIR || join(__dirname, '..', '..', '..', 'client', 'public', 'images', 'feeds')
const MAX_FAVICON_BYTES = 100_000
const FETCH_TIMEOUT_MS = 10_000
const CONCURRENCY = 5
// Google's generic globe icon for unknown domains is very small (~300 bytes at 32px).
// Real favicons are almost always larger.
const MAX_HTML_BYTES = 2 * 1024 * 1024 // 2 MB cap for HTML pages when looking for favicon links
const GOOGLE_GLOBE_MAX_BYTES = 400

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MAX_REDIRECTS = 3

/**
 * fetch() with an SSRF guard applied to the initial URL and to every redirect
 * hop. `fetch` follows redirects transparently, so we handle them manually
 * (redirect: 'manual') and re-validate each Location before following it.
 */
async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertUrlAllowed(current)
    const res = await fetch(current, { ...init, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return res
      current = new URL(location, current).href
      continue
    }
    return res
  }
  throw new Error('Too many redirects')
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true })
}

function faviconPath(feedId: string): string {
  return join(FAVICON_DIR, `${feedId}.png`)
}

async function faviconExists(feedId: string): Promise<boolean> {
  try {
    await access(faviconPath(feedId))
    return true
  } catch {
    return false
  }
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await safeFetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return null

    // Read body in chunks to avoid allocating huge buffers for unexpected responses
    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_FAVICON_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    if (totalBytes === 0) return null

    return Buffer.concat(chunks)
  } catch {
    return null
  }
}

/** Try Google Favicon API. Returns null if response is the generic globe icon. */
async function tryGoogleApi(hostname: string): Promise<Buffer | null> {
  const buffer = await fetchImage(`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`)
  if (!buffer) return null
  // Filter out Google's generic globe icon for unknown domains
  if (buffer.length <= GOOGLE_GLOBE_MAX_BYTES) return null
  return buffer
}

/** Parse HTML for <link rel="icon"> and download the best match. */
async function tryHtmlParsing(origin: string): Promise<Buffer | null> {
  try {
    const res = await safeFetch(origin, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'Accept': 'text/html' },
    })
    if (!res.ok) return null

    // Read body in chunks to cap memory usage — we only need the <head> for favicon links
    const reader = res.body?.getReader()
    if (!reader) return null
    const decoder = new TextDecoder()
    let html = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (html.length > MAX_HTML_BYTES) {
        await reader.cancel()
        break
      }
    }
    html += decoder.decode() // flush remaining bytes
    const $ = cheerio.load(html)

    // Collect all icon link tags, prefer larger sizes
    const iconLinks: { href: string; size: number }[] = []
    $('link[rel*="icon"]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const sizes = $(el).attr('sizes') || ''
      const match = sizes.match(/(\d+)x\d+/)
      const size = match ? parseInt(match[1]) : 0
      iconLinks.push({ href, size })
    })

    // Sort: prefer sizes closest to 32, then largest
    iconLinks.sort((a, b) => {
      const distA = a.size ? Math.abs(a.size - 32) : 999
      const distB = b.size ? Math.abs(b.size - 32) : 999
      return distA - distB
    })

    for (const link of iconLinks) {
      const iconUrl = new URL(link.href, origin).href
      const buffer = await fetchImage(iconUrl)
      if (buffer) return buffer
    }

    return null
  } catch {
    return null
  }
}

/** Try fetching /favicon.ico directly from the origin. */
async function tryDirectFavicon(origin: string): Promise<Buffer | null> {
  return fetchImage(`${origin}/favicon.ico`)
}

export interface FaviconResult {
  success: boolean
  message: string
}

export async function fetchFavicon(feedId: string, feedUrl: string, homeUrl?: string | null, force = false): Promise<FaviconResult> {
  if (!UUID_RE.test(feedId)) {
    throw new Error(`Invalid feed ID format: ${feedId}`)
  }

  if (!force && await faviconExists(feedId)) {
    log.debug({ feedId }, 'favicon already exists, skipping')
    return { success: true, message: 'Already exists' }
  }

  // Prefer homepage URL for favicon (cleaner domain), fall back to RSS URL
  const primaryUrl = homeUrl ? new URL(homeUrl) : new URL(feedUrl)
  const hostname = primaryUrl.hostname

  // Try the feed's hostname, then progressively shorter domains
  // e.g. feeder-prod.int.politico.com → int.politico.com → politico.com
  const domains = [hostname]
  const parts = hostname.split('.')
  for (let i = 1; i <= parts.length - 2; i++) {
    domains.push(parts.slice(i).join('.'))
  }

  let buffer: Buffer | null = null
  for (const domain of domains) {
    const origin = `${primaryUrl.protocol}//${domain}`
    buffer =
      await tryGoogleApi(domain) ??
      await tryHtmlParsing(origin) ??
      await tryDirectFavicon(origin)
    if (buffer) break
  }

  if (!buffer) {
    log.warn({ feedId, hostname }, 'no favicon found')
    return { success: false, message: `No favicon found for ${hostname}` }
  }

  await ensureDir(FAVICON_DIR)
  await writeFile(faviconPath(feedId), buffer)
  log.info({ feedId, hostname }, 'favicon saved')
  return { success: true, message: 'Favicon saved' }
}

export async function fetchAllFavicons(): Promise<{ succeeded: number; failed: number; skipped: number; errors: string[] }> {
  const feeds = await feedService.getFeeds({ active: true })
  let succeeded = 0
  let failed = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < feeds.length; i += CONCURRENCY) {
    const batch = feeds.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(async (feed) => {
        if (await faviconExists(feed.id)) return 'skipped' as const
        const result = await fetchFavicon(feed.id, feed.rssUrl, feed.url)
        return result.success ? 'fetched' as const : 'not_found' as const
      })
    )
    for (const [idx, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        if (result.value === 'skipped') skipped++
        else if (result.value === 'fetched') succeeded++
        else {
          failed++
          errors.push(`${batch[idx].title}: not found`)
        }
      } else {
        failed++
        errors.push(`${batch[idx].title}: ${result.reason?.message || 'Unknown error'}`)
        log.warn({ feedId: batch[idx].id, err: result.reason }, 'failed to fetch favicon')
      }
    }
  }

  return { succeeded, failed, skipped, errors }
}
