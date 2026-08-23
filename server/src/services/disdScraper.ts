/**
 * DISD scraper — UN Division for Inclusive Social Development
 *
 * The official UNPFII news page (social.desa.un.org/issues/indigenous-peoples/news)
 * has no RSS feed. This scraper fetches the Drupal Views page and converts the
 * structured HTML (div.views-row) into the same ParseFeedResult interface that
 * rssParser.ts produces, so the crawler pipeline treats it identically.
 *
 * The page requires a browser-like User-Agent; without one it returns 405.
 *
 * Scraping rule: only public, machine-readable structured HTML (no auth, no JS
 * execution, no bypassing paywalls). Un.org content is public domain.
 */
import axios from 'axios'
import * as cheerio from 'cheerio'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import { crawlLimiter } from '../lib/crawlLimiter.js'
import type { ParseFeedResult, RSSItem } from './rssParser.js'

const log = createLogger('disd-scraper')

const BASE_URL = 'https://social.desa.un.org'

export const DISD_NEWS_URL = `${BASE_URL}/issues/indigenous-peoples/news`

// Scraped feeds we handle here
export const SCRAPED_FEED_URLS = new Set([DISD_NEWS_URL])

export async function scrapeDISD(url: string): Promise<ParseFeedResult> {
  try {
    const html = await crawlLimiter.run(url, () =>
      withRetry(() =>
        axios.get(url, {
          timeout: 20_000,
          maxRedirects: 3,
          responseType: 'text',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; VocesIndigenasCrawler/1.0; +https://vocesindigenas.org)',
            'Accept': 'text/html,application/xhtml+xml,*/*',
            'Accept-Language': 'en,es;q=0.9',
          },
          validateStatus: (s) => s === 200,
        })
      )
    )

    const $ = cheerio.load(html.data)
    const items: RSSItem[] = []

    $('.views-row').each((_i, row) => {
      const $row = $(row)

      // Title + URL
      const $titleLink = $row.find('.views-field-title a').first()
      const title = $titleLink.text().trim()
      const relativeHref = $titleLink.attr('href')
      if (!title || !relativeHref) return

      const articleUrl = relativeHref.startsWith('http')
        ? relativeHref
        : `${BASE_URL}${relativeHref}`

      // Date — <time datetime="2026-01-28T11:22:47-05:00">
      const dateAttr = $row.find('time').attr('datetime') || null

      // Excerpt
      const description = $row.find('.views-field-body .field-content').text().trim() || null

      // Image
      const imgSrc = $row.find('img').attr('src') || null
      const imageUrl = imgSrc
        ? (imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`)
        : null

      items.push({ url: articleUrl, title, datePublished: dateAttr, description, imageUrl })
    })

    log.info({ url, count: items.length }, 'scraped DISD indigenous peoples news')

    return { items, notModified: false, cacheHeaders: {} }
  } catch (err: any) {
    log.error({ url, err: err?.message }, 'DISD scrape failed')
    return { items: [], notModified: false, cacheHeaders: {} }
  }
}
