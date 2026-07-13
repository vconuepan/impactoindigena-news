import Parser from 'rss-parser'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import { normalizeUrl } from '../utils/urlNormalization.js'
import { safeAxiosGet } from '../lib/safeHttp.js'
import { summarizeError } from '../utils/errors.js'
import { crawlLimiter } from '../lib/crawlLimiter.js'
import { SCRAPED_FEED_URLS as DISD_SCRAPED_URLS, scrapeDISD } from './disdScraper.js'
import { AUSTRAL_FEED_URL, scrapeAustral } from './australScraper.js'
import { ELMOSTRADOR_FEED_URL, scrapeElMostrador } from './elMostradorScraper.js'
import { DESCONCIERTO_FEED_URL, scrapeElDesconcierto } from './elDesconciertoScraper.js'
import { BIOBIO_FEED_URL, scrapeBioBio } from './biobioScraper.js'
import { CONADI_FEED_URL, scrapeConadi } from './conadiScraper.js'

const SCRAPED_FEED_URLS = new Set([...DISD_SCRAPED_URLS, AUSTRAL_FEED_URL, ELMOSTRADOR_FEED_URL, DESCONCIERTO_FEED_URL, BIOBIO_FEED_URL, CONADI_FEED_URL])

const log = createLogger('rssParser')

const parser = new Parser()

export interface RSSItem {
  url: string
  title: string
  datePublished: string | null
  description: string | null
  imageUrl: string | null
}

export interface FeedCacheHeaders {
  etag?: string | null
  lastModified?: string | null
}

export interface ParseFeedResult {
  items: RSSItem[]
  notModified: boolean
  cacheHeaders: FeedCacheHeaders
  /** Set when the fetch or XML parse failed (404/403/invalid XML/timeout).
   *  Distinguishes a broken feed from a healthy feed that returned zero items. */
  error?: string | null
}

export async function parseFeed(feedUrl: string, cacheHeaders?: FeedCacheHeaders): Promise<ParseFeedResult> {
  // Route HTML-scraped feeds to their dedicated scrapers instead of the RSS parser
  if (feedUrl === AUSTRAL_FEED_URL) return scrapeAustral(feedUrl)
  if (feedUrl === ELMOSTRADOR_FEED_URL) return scrapeElMostrador(feedUrl)
  if (feedUrl === DESCONCIERTO_FEED_URL) return scrapeElDesconcierto(feedUrl)
  if (feedUrl === BIOBIO_FEED_URL) return scrapeBioBio(feedUrl)
  if (feedUrl === CONADI_FEED_URL) return scrapeConadi(feedUrl)
  if (SCRAPED_FEED_URLS.has(feedUrl)) return scrapeDISD(feedUrl)

  try {
    const headers: Record<string, string> = {
      // Mimic a real browser so sites that block generic bots (UN, OHCHR, etc.) respond correctly
      'User-Agent': 'Mozilla/5.0 (compatible; ImpactoIndigenaCrawler/1.0; +https://impactoindigena.news)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    }
    if (cacheHeaders?.etag) {
      headers['If-None-Match'] = cacheHeaders.etag
    }
    if (cacheHeaders?.lastModified) {
      headers['If-Modified-Since'] = cacheHeaders.lastModified
    }

    // safeAxiosGet applies the SSRF guard (assertUrlAllowed, with DNS) to the
    // initial URL and to every redirect hop — closing the DNS-rebinding-via-
    // redirect hole the synchronous beforeRedirect check left open. 304 (from
    // the conditional GET above) is a non-redirect 3xx that must pass through.
    const response = await crawlLimiter.run(feedUrl, () =>
      withRetry(() => safeAxiosGet(feedUrl, {
        timeout: config.crawl.httpTimeoutMs,
        headers,
        responseType: 'text',
        maxContentLength: 5 * 1024 * 1024, // 5 MB cap to prevent OOM on huge responses
      }, { maxRedirects: 3, isNonRedirect: (status) => status === 304 }))
    )

    if (response.status === 304) {
      log.debug({ feedUrl }, 'feed not modified (304)')
      return {
        items: [],
        notModified: true,
        cacheHeaders: {
          etag: cacheHeaders?.etag || null,
          lastModified: cacheHeaders?.lastModified || null,
        },
        error: null,
      }
    }

    const feed = await parser.parseString(response.data)
    const items: RSSItem[] = []
    const isGoogleNews = feedUrl.includes('news.google.com')

    for (const item of feed.items.slice(0, config.crawl.rssItemLimit)) {
      // Google News RSS links point to a news.google.com tracking URL that returns
      // a JS SPA — unusable for extraction. The real article URL is in the
      // <description> field as the href of the first <a> tag.
      let url = item.link
      if (isGoogleNews && item.description) {
        const match = item.description.match(/href="(https?:\/\/(?!news\.google\.com)[^"]+)"/)
        if (match) url = match[1]
      }
      if (!url) continue

      items.push({
        url: normalizeUrl(url),
        title: item.title?.replace(/\s*-\s*[^-]+$/, '').trim() || 'Untitled', // strip " - Source Name" suffix Google News adds
        datePublished: item.isoDate || item.pubDate || null,
        description: item.contentSnippet || item.content || null,
        imageUrl: item.enclosure?.url || item['media:content']?.['$']?.url || item['media:thumbnail']?.['$']?.url || null,
      })
    }

    return {
      items,
      notModified: false,
      cacheHeaders: {
        etag: response.headers['etag'] || null,
        lastModified: response.headers['last-modified'] || null,
      },
      error: null,
    }
  } catch (err) {
    const reason = summarizeError(err)
    log.error({ feedUrl, reason }, 'failed to parse feed')
    // Surface the failure so the crawler can mark the feed as broken (failed),
    // not as an empty crawl. A silent items:[] here made 404/403/invalid-XML
    // feeds look identical to healthy-but-quiet feeds.
    return { items: [], notModified: false, cacheHeaders: {}, error: reason }
  }
}
