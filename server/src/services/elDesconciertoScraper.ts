/**
 * El Desconcierto scraper
 *
 * El Desconcierto blocks RSS feeds (403) but its HTML is publicly accessible.
 * We scrape the listing pages for Nacional, Medio Ambiente, and Opinión —
 * the three sections most likely to contain indigenous rights coverage.
 *
 * Article links follow the pattern:
 *   https://eldesconcierto.cl/{seccion}/{slug}-n{id}
 *
 * CSS selector: <a class="news-article ..."> contains title in .news-article__title
 *
 * Scraping rule: public HTML, no auth, no paywall bypass.
 */
import axios from 'axios'
import * as cheerio from 'cheerio'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import { crawlLimiter } from '../lib/crawlLimiter.js'
import type { ParseFeedResult, RSSItem } from './rssParser.js'

const log = createLogger('desconcierto-scraper')

const BASE_URL = 'https://www.eldesconcierto.cl'

// Sections most relevant for indigenous coverage
const SECTIONS = [
  'https://www.eldesconcierto.cl/nacional/',
  'https://www.eldesconcierto.cl/medio-ambiente/',
  'https://www.eldesconcierto.cl/opinion/',
]

export const DESCONCIERTO_FEED_URL = `${BASE_URL}/scraper`

export const SCRAPED_FEED_URLS = new Set([DESCONCIERTO_FEED_URL])

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'es-CL,es;q=0.9',
}

async function fetchSection(url: string): Promise<RSSItem[]> {
  const res = await crawlLimiter.run(url, () =>
    withRetry(() =>
      axios.get(url, {
        timeout: 20_000,
        maxRedirects: 5,
        responseType: 'text',
        headers: HEADERS,
        validateStatus: (s) => s === 200,
      })
    )
  )

  const $ = cheerio.load(res.data)
  const items: RSSItem[] = []
  const seen = new Set<string>()

  // Articles: <a class="news-article ..."> with href to article
  $('a.news-article[href]').each((_i, el) => {
    const href = $(el).attr('href') ?? ''
    if (!href || seen.has(href)) return

    // Only article URLs (contain slug pattern with -nNNNNNN)
    if (!href.match(/\/[a-z0-9-]+-n\d+$/)) return

    const articleUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
    seen.add(href)

    const title = $(el).find('.news-article__title').text().trim()
    const badge = $(el).find('.news-article__badge').text().trim() // section label
    const imgSrc = $(el).find('img[data-td-src-property]').attr('data-td-src-property')
      || $(el).find('img').attr('src')

    if (!title) return

    items.push({
      url: articleUrl,
      title: badge ? `[${badge}] ${title}` : title,
      datePublished: null, // not in listing HTML; extractor will get it
      description: null,
      imageUrl: imgSrc ?? null,
    })
  })

  return items
}

export async function scrapeElDesconcierto(_url: string): Promise<ParseFeedResult> {
  try {
    const results = await Promise.allSettled(SECTIONS.map(fetchSection))

    const allItems: RSSItem[] = []
    const seenUrls = new Set<string>()

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const item of result.value) {
          if (!seenUrls.has(item.url)) {
            seenUrls.add(item.url)
            allItems.push(item)
          }
        }
      }
    }

    log.info({ count: allItems.length }, 'scraped El Desconcierto')
    return { items: allItems, notModified: false, cacheHeaders: {} }
  } catch (err) {
    log.error({ err }, 'El Desconcierto scraper failed')
    return { items: [], notModified: false, cacheHeaders: {} }
  }
}
