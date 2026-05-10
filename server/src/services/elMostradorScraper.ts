/**
 * El Mostrador scraper
 *
 * El Mostrador removed its RSS feed but maintains a live sitemap at:
 *   https://www.elmostrador.cl/sitemap.xml
 *
 * The sitemap contains ~100 recent articles updated throughout the day.
 * We parse it, filter for sections relevant to indigenous/social coverage
 * (pais, braga, noticias/mundo), and return them as RSSItem objects.
 *
 * Scraping rule: public sitemap, no auth, no paywall bypass.
 */
import axios from 'axios'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import { crawlLimiter } from '../lib/crawlLimiter.js'
import type { ParseFeedResult, RSSItem } from './rssParser.js'

const log = createLogger('elmostrador-scraper')

const SITEMAP_URL = 'https://www.elmostrador.cl/sitemap.xml'

export const ELMOSTRADOR_FEED_URL = SITEMAP_URL

export const SCRAPED_FEED_URLS = new Set([ELMOSTRADOR_FEED_URL])

// Sections we want — skip datos-utiles (tips/guides), cultura, tendencias
const RELEVANT_PATHS = [
  '/noticias/pais/',
  '/noticias/mundo/',
  '/noticias/negocios/',
  '/braga/',
  '/noticias/opinion/',
]

export async function scrapeElMostrador(_url: string): Promise<ParseFeedResult> {
  try {
    const res = await crawlLimiter.run(SITEMAP_URL, () =>
      withRetry(() =>
        axios.get(SITEMAP_URL, {
          timeout: 15_000,
          responseType: 'text',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ImpactoIndigenaCrawler/1.0; +https://impactoindigena.news)',
            'Accept': 'application/xml,text/xml,*/*',
          },
          validateStatus: (s) => s === 200,
        })
      )
    )

    const xml: string = res.data
    const items: RSSItem[] = []

    // Parse <url> entries from sitemap XML
    const urlMatches = xml.matchAll(/<url>([\s\S]*?)<\/url>/g)

    for (const match of urlMatches) {
      const block = match[1]

      const locMatch = block.match(/<loc>(.*?)<\/loc>/)
      const lastmodMatch = block.match(/<lastmod>(.*?)<\/lastmod>/)

      if (!locMatch) continue
      const articleUrl = locMatch[1].trim()

      // Skip homepage and irrelevant sections
      if (!RELEVANT_PATHS.some((p) => articleUrl.includes(p))) continue

      const lastmod = lastmodMatch ? lastmodMatch[1].trim() : null

      // Extract slug-based title (best effort — full title fetched during extraction)
      const slugTitle = articleUrl
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/-/g, ' ') ?? ''

      items.push({
        url: articleUrl,
        title: slugTitle,
        datePublished: lastmod,
        description: null,
        imageUrl: null,
      })
    }

    log.info({ count: items.length }, 'scraped El Mostrador sitemap')
    return { items, notModified: false, cacheHeaders: {} }
  } catch (err) {
    log.error({ err }, 'El Mostrador scraper failed')
    return { items: [], notModified: false, cacheHeaders: {} }
  }
}
