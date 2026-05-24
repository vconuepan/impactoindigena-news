/**
 * Radio Bio Bio scraper
 *
 * BioBioChile removed its RSS feed. Section pages load via JavaScript and return
 * only 146 bytes without a JS engine, but the homepage loads ~1.3MB of full HTML
 * including 300+ article links structured as:
 *
 *   <a href="/noticias/nacional/{region}/{YYYY}/{MM}/{DD}/{slug}.shtml">
 *     <article class="article">
 *       <h2 class="article-title">Title</h2>
 *       <div class="article-image" style="background-image: url(img)">
 *     </article>
 *   </a>
 *
 * Strategy: scrape homepage once per crawl, extract nacional + sociedad articles,
 * filter by date (only last 2 days to avoid reprocessing old content).
 *
 * Scraping rule: public HTML, no auth, no paywall bypass.
 */
import axios from 'axios'
import * as cheerio from 'cheerio'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import { crawlLimiter } from '../lib/crawlLimiter.js'
import type { ParseFeedResult, RSSItem } from './rssParser.js'

const log = createLogger('biobio-scraper')

const HOMEPAGE_URL = 'https://www.biobiochile.cl/'

export const BIOBIO_FEED_URL = `${HOMEPAGE_URL}scraper`

export const SCRAPED_FEED_URLS = new Set([BIOBIO_FEED_URL])

// Sections relevant to indigenous / rights coverage
// /noticias/nacional/ already includes all regional subsections
// (e.g. /noticias/nacional/region-de-la-araucania/)
const RELEVANT_SECTIONS = [
  '/noticias/nacional/',
  '/noticias/sociedad/',
  '/noticias/opinion/',
  '/noticias/economia/',
  '/noticias/reportajes/',
  '/noticias/entrevistas/',
  '/noticias/artes-y-cultura/',
]

// Only include articles from the last 2 days to avoid reprocessing old content
function isRecent(url: string): boolean {
  const match = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//)
  if (!match) return false
  const articleDate = new Date(`${match[1]}-${match[2]}-${match[3]}`)
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  return articleDate >= twoDaysAgo
}

export async function scrapeBioBio(_url: string): Promise<ParseFeedResult> {
  try {
    const res = await crawlLimiter.run(HOMEPAGE_URL, () =>
      withRetry(() =>
        axios.get(HOMEPAGE_URL, {
          timeout: 30_000,
          maxRedirects: 5,
          responseType: 'text',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,*/*',
            'Accept-Language': 'es-CL,es;q=0.9',
          },
          validateStatus: (s) => s === 200,
        })
      )
    )

    const $ = cheerio.load(res.data)
    const items: RSSItem[] = []
    const seen = new Set<string>()

    // Article links: <a href="/noticias/..."> containing <article class="article">
    $('a[href*="/noticias/"]').each((_i, el) => {
      const href = $(el).attr('href') ?? ''
      if (!href || seen.has(href)) return
      if (!href.endsWith('.shtml')) return
      if (!RELEVANT_SECTIONS.some((s) => href.includes(s))) return
      if (!isRecent(href)) return

      const articleUrl = href.startsWith('http') ? href : `https://www.biobiochile.cl${href}`
      seen.add(href)

      const title = $(el).find('h2.article-title').text().trim()
        || $(el).find('.article-title').text().trim()
        || $(el).find('h2').text().trim()

      if (!title) return

      // Extract image from background-image style
      const bgStyle = $(el).find('.article-image').attr('style') ?? ''
      const imgMatch = bgStyle.match(/url\(([^)]+)\)/)
      const imageUrl = imgMatch ? imgMatch[1].replace(/['"]/g, '') : null

      // Extract date from URL path
      const dateMatch = articleUrl.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//)
      const datePublished = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00-03:00`
        : null

      items.push({ url: articleUrl, title, datePublished, description: null, imageUrl })
    })

    log.info({ count: items.length }, 'scraped BioBioChile')
    return { items, notModified: false, cacheHeaders: {} }
  } catch (err) {
    log.error({ err }, 'BioBioChile scraper failed')
    return { items: [], notModified: false, cacheHeaders: {} }
  }
}
