/**
 * OHCHR "Calls for input" scraper (Fase 2b) — the highest-value legal source:
 * UN human-rights calls for submissions with actionable deadlines, including
 * indigenous-specific ones (FPIC, Special Rapporteur on indigenous peoples,
 * EMRIP, CEDAW indigenous women).
 *
 * The listing (https://www.ohchr.org/en/calls-for-input-listing) is static HTML:
 * each call is a `.card-2-item-wrapper` whose text reads "Entity | Deadline |
 * Title" with the detail link in `a.card-2__link`. ~15 calls per page, paginated
 * via `?page=N`. We parse the DEADLINE inline (no LLM needed for dates) and keep
 * only future, indigenous-relevant calls. Titles are English → translated later
 * by the enrich step. Access is intermittent (occasional 403): a failed page
 * degrades the source (keep what we have) without aborting the daily job.
 *
 * Scraping rule: public HTML, no auth, no paywall bypass.
 */
import axios from 'axios'
import * as cheerio from 'cheerio'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import { crawlLimiter } from '../lib/crawlLimiter.js'
import { normalizeUrl } from '../utils/urlNormalization.js'
import { summarizeError } from '../utils/errors.js'
import { config } from '../config.js'
import {
  type AgendaItemDraft,
  type IngestResult,
  isIndigenousRelevant,
  persistDrafts,
  startOfTodayUTC,
} from './agendaIngest.js'

const log = createLogger('ohchr-scraper')

const BASE_URL = 'https://www.ohchr.org'
const LISTING_PATH = '/en/calls-for-input-listing'
const SOURCE_NAME = 'ACNUDH · Llamados'

const EN_MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * Parse the first English date in a text ("30 September 2026" or "September 30,
 * 2026") as an end-of-day UTC Date, so a deadline "today" is not treated as past.
 * Returns null for unknown formats / "ongoing" / no date (never Invalid Date).
 */
function buildUtcEndOfDay(day: number, mon: number | undefined, year: number): Date | null {
  if (mon === undefined || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, mon, day, 23, 59, 59))
  // Reject overflow (e.g. "31 April" → May 1, "45 September" → Oct 15): round-trip.
  if (isNaN(d.getTime()) || d.getUTCDate() !== day || d.getUTCMonth() !== mon) return null
  return d
}

export function parseEnglishDate(text: string): Date | null {
  let m = text.match(/(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/)
  if (m) {
    const r = buildUtcEndOfDay(parseInt(m[1], 10), EN_MONTHS[m[2].toLowerCase()], parseInt(m[3], 10))
    if (r) return r
  }
  m = text.match(/([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (m) {
    const r = buildUtcEndOfDay(parseInt(m[2], 10), EN_MONTHS[m[1].toLowerCase()], parseInt(m[3], 10))
    if (r) return r
  }
  return null
}

async function fetchListingPage(page: number): Promise<string | null> {
  const url = page === 0 ? `${BASE_URL}${LISTING_PATH}` : `${BASE_URL}${LISTING_PATH}?page=${page}`
  try {
    const res = await crawlLimiter.run(url, () =>
      withRetry(() =>
        axios.get<string>(url, {
          timeout: 30_000,
          maxRedirects: 3,
          responseType: 'text',
          maxContentLength: 10 * 1024 * 1024,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,*/*',
            'Accept-Language': 'en',
          },
          validateStatus: (s) => s === 200,
        }),
      ),
    )
    return res.data
  } catch (err) {
    log.warn({ url, reason: summarizeError(err) }, 'OHCHR listing page failed')
    return null
  }
}

/** Parse one listing page into indigenous-relevant, non-expired call drafts. */
export function parseOhchrListing(html: string, today: Date = startOfTodayUTC()): AgendaItemDraft[] {
  const $ = cheerio.load(html)
  const drafts: AgendaItemDraft[] = []

  $('.card-2-item-wrapper').each((_i, el) => {
    const $el = $(el)
    const title = $el.find('.card-2__title').text().trim()
    const href = $el.find('a.card-2__link').attr('href') || $el.find('.card-2__node-url a').attr('href') || ''
    if (!title || !href) return

    const url = new URL(href, BASE_URL).toString() // handles relative/root-relative/absolute
    // Full item text holds "Entity | Deadline | Title": used for the relevance
    // gate (so entity/mandate counts, not just title).
    const itemText = $el.text().replace(/\s+/g, ' ').trim()
    // The deadline precedes the title in the card; parse only the text before the
    // title so a date embedded in the title can't be mistaken for the deadline.
    const dueText = title && itemText.includes(title) ? itemText.slice(0, itemText.indexOf(title)) : itemText
    const dueDate = parseEnglishDate(dueText)

    if (dueDate && dueDate < today) return // closed deadline
    if (!isIndigenousRelevant(title, itemText)) return

    drafts.push({
      type: 'convocatoria',
      status: 'draft',
      title,
      summary: null,
      dueDate,
      startDate: null,
      endDate: null,
      allDay: false,
      location: null,
      sourceName: SOURCE_NAME,
      sourceUrl: url,
      lang: 'en',
      countries: [],
      tags: [],
      externalId: `ohchr:${normalizeUrl(url)}`,
      extractionScore: dueDate ? 0.8 : 0.4, // undated → enrich step will try to resolve
      publishedAt: null,
    })
  })

  return drafts
}

/**
 * Scrape up to `maxPages` listing pages and return deduped, indigenous-relevant
 * call drafts with future (or unknown) deadlines. A failed page stops paging but
 * keeps what was already collected (resilient to OHCHR's intermittent 403s).
 */
export async function scrapeOhchrCalls(maxPages: number = config.agenda.ohchrMaxPages): Promise<AgendaItemDraft[]> {
  const today = startOfTodayUTC()
  const all: AgendaItemDraft[] = []
  const seen = new Set<string>()

  for (let page = 0; page < maxPages; page++) {
    const html = await fetchListingPage(page)
    if (!html) break // page failed — keep what we have
    for (const d of parseOhchrListing(html, today)) {
      if (seen.has(d.externalId)) continue
      seen.add(d.externalId)
      all.push(d)
    }
  }

  log.info({ count: all.length, maxPages }, 'scraped OHCHR calls for input')
  return all
}

/** Ingest OHCHR calls as drafts (create-if-absent). Degrades on failure. */
export async function ingestOhchr(): Promise<IngestResult> {
  if (!config.agenda.ohchrEnabled) {
    log.info('OHCHR ingest disabled')
    return { created: 0, skipped: 0, drafts: 0, sourceErrors: 0 }
  }
  try {
    const drafts = await scrapeOhchrCalls()
    const r = await persistDrafts(drafts)
    log.info({ found: drafts.length, created: r.created, skipped: r.skipped }, 'OHCHR ingest complete')
    return r
  } catch (err) {
    log.error({ reason: summarizeError(err) }, 'OHCHR ingest failed')
    return { created: 0, skipped: 0, drafts: 0, sourceErrors: 1 }
  }
}
