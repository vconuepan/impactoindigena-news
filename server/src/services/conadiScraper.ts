/**
 * CONADI scraper — Corporación Nacional de Desarrollo Indígena
 *
 * CONADI's /feed/ endpoint returns HTML instead of RSS, making the native RSS
 * parser useless. However, the /noticias page loads static HTML (~69KB) with
 * well-structured article cards:
 *
 *   <div class="post tarjeta">
 *     <div class="pic">
 *       <a href="https://www.conadi.gob.cl/noticias/{slug}">
 *         <img src="/storage/image/articulos/{file}">
 *       </a>
 *     </div>
 *     <div class="texto">
 *       <span class="meta">viernes 15 de mayo, 2026</span>
 *       <h4 class="title"><a href="URL">Title</a></h4>
 *     </div>
 *   </div>
 *
 * Strategy: scrape /noticias once per crawl, extract articles, filter by date
 * (only last 7 days — CONADI publishes ~2-3 articles/week).
 *
 * Scraping rule: public HTML, no auth, no paywall bypass. Government content.
 */
import axios from 'axios'
import * as cheerio from 'cheerio'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import { crawlLimiter } from '../lib/crawlLimiter.js'
import type { ParseFeedResult, RSSItem } from './rssParser.js'

const log = createLogger('conadi-scraper')

const BASE_URL = 'https://www.conadi.gob.cl'
const NOTICIAS_URL = `${BASE_URL}/noticias`

export const CONADI_FEED_URL = `${NOTICIAS_URL}/scraper`

export const SCRAPED_FEED_URLS = new Set([CONADI_FEED_URL])

// Spanish month names → 0-indexed month number
const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3,
  mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
}

/**
 * Parse date strings like "viernes 15 de mayo, 2026"
 * Returns ISO string or null if unparseable.
 */
function parseSpanishDate(text: string): string | null {
  // "viernes 15 de mayo, 2026" → day=15, month=mayo, year=2026
  const match = text.match(/(\d{1,2})\s+de\s+(\w+),?\s*(\d{4})/)
  if (!match) return null

  const day = parseInt(match[1], 10)
  const monthName = match[2].toLowerCase()
  const year = parseInt(match[3], 10)

  const month = MONTHS[monthName]
  if (month === undefined) return null

  // Chile is UTC-3 / UTC-4
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00-04:00`
}

/**
 * Only include articles from the last 7 days.
 * CONADI publishes ~2-3 articles/week, so 7 days covers a full cycle.
 */
function isRecent(dateStr: string | null): boolean {
  if (!dateStr) return true // keep undated articles
  const articleDate = new Date(dateStr)
  if (isNaN(articleDate.getTime())) return true
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  return articleDate >= sevenDaysAgo
}

export async function scrapeConadi(_url: string): Promise<ParseFeedResult> {
  try {
    const res = await crawlLimiter.run(NOTICIAS_URL, () =>
      withRetry(() =>
        axios.get(NOTICIAS_URL, {
          timeout: 20_000,
          maxRedirects: 3,
          responseType: 'text',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ImpactoIndigenaCrawler/1.0; +https://impactoindigena.news)',
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

    $('div.post.tarjeta').each((_i, el) => {
      const $el = $(el)

      // Title + URL from h4.title a
      const $link = $el.find('h4.title a').first()
      const title = $link.text().trim()
      const href = $link.attr('href') ?? ''
      if (!title || !href || seen.has(href)) return
      seen.add(href)

      const articleUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`

      // Date from span.meta
      const dateText = $el.find('span.meta').text().trim()
      const datePublished = parseSpanishDate(dateText)

      if (!isRecent(datePublished)) return

      // Image
      const imgSrc = $el.find('.pic img').attr('src') ?? null
      const imageUrl = imgSrc
        ? (imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`)
        : null

      items.push({ url: articleUrl, title, datePublished, description: null, imageUrl })
    })

    log.info({ count: items.length }, 'scraped CONADI noticias')
    return { items, notModified: false, cacheHeaders: {} }
  } catch (err: any) {
    log.error({ err: err?.message }, 'CONADI scraper failed')
    return { items: [], notModified: false, cacheHeaders: {} }
  }
}
