import { createLogger } from './logger.js'
import { withRetry } from './retry.js'

const log = createLogger('extract-og-image')

/**
 * Decodes the HTML entities that appear inside a meta tag's content attribute.
 * og:image URLs are routinely stored HTML-escaped in the source markup
 * (e.g. `...?id=abc&amp;width=1200`), and using the raw value verbatim yields
 * an invalid URL with a literal `&amp;` that 4xxs on fetch — leaving the story
 * with a broken hero image on the site and in Google Discover. Numeric refs are
 * decoded before named ones so `&amp;` isn't clobbered mid-pass.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Fetches a URL and extracts the og:image meta tag value.
 * Returns null if not found or on any error.
 */
export async function fetchOgImage(sourceUrl: string): Promise<string | null> {
  try {
    const html = await withRetry(async () => {
      const res = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ImpactoIndigenaCrawler/1.0)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.text()
    })

    // Match og:image — handle both property= and name= forms, single or double quotes
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)

    if (!match) return null

    const url = decodeHtmlEntities(match[1].trim())
    // Basic sanity check — must look like an absolute URL
    if (!url.startsWith('http')) return null

    return url
  } catch (err) {
    log.warn({ sourceUrl, err }, 'could not extract og:image')
    return null
  }
}
