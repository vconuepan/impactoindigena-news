/**
 * El Austral de Temuco scraper
 *
 * El Austral is a print newspaper published Monday–Saturday with a digital
 * replica edition. Each page is available as a PDF at a predictable URL:
 *
 *   https://impresa.soy-chile.cl/AustralTemuco/{DDMMYY}/Paginas/1/AustralTemuco/{DD}_{MM}_{YY}_pag_{N}.pdf
 *
 * Strategy:
 *   1. For each page (1..MAX_PAGES), download the PDF.
 *   2. Extract text with pdf-parse.
 *   3. Skip pages that contain no indigenous-relevant keywords.
 *   4. Return relevant pages as RSSItem objects (URL = page viewer URL).
 *
 * Authentication:
 *   The PDFs are behind the Pasedigital subscription wall. Set the environment
 *   variable AUSTRAL_COOKIE to the value of the Cookie header from an
 *   authenticated browser session on impresa.soy-chile.cl.
 *
 * If AUSTRAL_COOKIE is not set, the scraper attempts unauthenticated access
 * (works only if the edition is publicly available).
 */
import axios from 'axios'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import type { ParseFeedResult, RSSItem } from './rssParser.js'

const log = createLogger('austral-scraper')

// ─── Constants ────────────────────────────────────────────────────────────────

const PDF_BASE = 'https://impresa.soy-chile.cl'
const PAGE_BASE = 'https://www.australtemuco.cl'

/** Feed URL sentinel — matched in rssParser.ts to route here */
export const AUSTRAL_FEED_URL = 'https://www.australtemuco.cl/impresa/'

/** Maximum pages to try per edition (El Austral typically 16–24 pages) */
const MAX_PAGES = 28

/** Pause between page fetches to avoid hammering the server */
const PAGE_DELAY_MS = 600

// ─── URL builders ─────────────────────────────────────────────────────────────

function buildPdfUrl(date: Date, pageNum: number): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(2)
  return `${PDF_BASE}/AustralTemuco/${dd}${mm}${yy}/Paginas/1/AustralTemuco/${dd}_${mm}_${yy}_pag_${pageNum}.pdf`
}

function buildPageUrl(date: Date, pageNum: number): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${PAGE_BASE}/impresa/${yyyy}/${mm}/${dd}/full/cuerpo-principal/${pageNum}/`
}

// ─── Indigenous content detection ─────────────────────────────────────────────

const INDIGENOUS_KEYWORDS = [
  'mapuche', 'indígena', 'indigena', 'pueblo originario', 'comunidad indígena',
  'comunidad indigena', 'conadi', 'araucanía', 'araucania', 'pehuenche',
  'lafkenche', 'huilliche', 'williche', 'territorio ancestral',
  'tierras indígenas', 'tierras indigenas', 'conflicto mapuche',
  'pueblo nación', 'pueblo nacion', 'macrozona sur', 'wallmapu',
  'lonko', 'machi', 'weichafe', 'lof ', 'lof\n', 'ley indígena',
  'ley indigena', 'convenio 169', 'ley lafkenche', 'conaf mapuche',
  'alzamiento mapuche', 'restitución de tierras', 'restitucion de tierras',
]

function hasIndigenousContent(text: string): boolean {
  const lower = text.toLowerCase()
  return INDIGENOUS_KEYWORDS.some(kw => lower.includes(kw))
}

// ─── PDF fetching ──────────────────────────────────────────────────────────────

interface PdfResult {
  text: string
  /** true if the server returned 404 — edition or page doesn't exist */
  notFound: boolean
  /** true if the server returned 401/403 — auth required */
  authRequired: boolean
}

async function fetchPdf(pdfUrl: string, cookie?: string): Promise<PdfResult> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; ImpactoIndigenaCrawler/1.0; +https://impactoindigena.news)',
      'Accept': 'application/pdf,*/*',
      'Referer': PAGE_BASE + '/',
    }
    if (cookie) headers['Cookie'] = cookie

    const response = await withRetry(() =>
      axios.get(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 25_000,
        maxRedirects: 3,
        headers,
        validateStatus: (s) => s === 200,
      })
    )

    // pdf-parse v2 ships an ESM build; import the named export directly
    const { default: pdfParse } = await import('pdf-parse') as any
    const parsed = await pdfParse(Buffer.from(response.data as ArrayBuffer))

    return { text: parsed.text || '', notFound: false, authRequired: false }
  } catch (err: any) {
    const status = err?.response?.status as number | undefined
    if (status === 404) return { text: '', notFound: true, authRequired: false }
    if (status === 401 || status === 403) return { text: '', notFound: false, authRequired: true }
    // Network error or parse error — treat as missing
    log.debug({ pdfUrl, err: err?.message }, 'PDF fetch failed')
    return { text: '', notFound: true, authRequired: false }
  }
}

// ─── Title extraction ──────────────────────────────────────────────────────────

/**
 * Best-effort title from PDF text.
 * Newspaper pages often start with the section name on the first non-empty line
 * and the headline on the next substantial line.
 */
function extractTitle(text: string, date: Date, pageNum: number): string {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 8)

  // Skip very short lines (page numbers, section markers) to find the headline
  const headline = lines.find(l => l.length > 20) || lines[0]
  if (!headline) return `El Austral — ${date.toISOString().split('T')[0]} — Pág. ${pageNum}`

  // Truncate very long lines (they're often body text, not a title)
  return headline.length > 120 ? headline.slice(0, 120) + '…' : headline
}

// ─── Main scraper ──────────────────────────────────────────────────────────────

/**
 * Scrape one edition of El Austral and return pages with indigenous content.
 * Called by the feed pipeline via scrapeAustral() and by the backfill script.
 */
export async function scrapeAustralEdition(date: Date): Promise<ParseFeedResult> {
  const cookie = process.env.AUSTRAL_COOKIE
  const dateStr = date.toISOString().split('T')[0]
  const items: RSSItem[] = []

  log.info({ date: dateStr }, 'scraping El Austral edition')

  let authWarned = false

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pdfUrl = buildPdfUrl(date, page)
    const result = await fetchPdf(pdfUrl, cookie)

    if (result.authRequired) {
      if (!authWarned) {
        log.warn({ date: dateStr }, 'El Austral PDFs require auth — set AUSTRAL_COOKIE env var')
        authWarned = true
      }
      break
    }

    if (result.notFound) {
      if (page === 1) {
        log.info({ date: dateStr }, 'no edition found for this date (page 1 = 404)')
      } else {
        log.debug({ date: dateStr, lastPage: page - 1 }, 'edition complete')
      }
      break
    }

    const { text } = result

    if (!hasIndigenousContent(text)) {
      log.debug({ date: dateStr, page }, 'no indigenous content on page')
      await new Promise(r => setTimeout(r, PAGE_DELAY_MS))
      continue
    }

    const title = extractTitle(text, date, page)
    const pageUrl = buildPageUrl(date, page)

    items.push({
      url: pageUrl,
      title,
      datePublished: date.toISOString(),
      description: text.slice(0, 300).trim(),
      imageUrl: null,
    })

    log.info({ date: dateStr, page, title }, 'indigenous content found')
    await new Promise(r => setTimeout(r, PAGE_DELAY_MS))
  }

  log.info({ date: dateStr, count: items.length }, 'El Austral scrape complete')
  return { items, notModified: false, cacheHeaders: {} }
}

/**
 * Entry point called by rssParser for the daily feed crawl.
 * Always scrapes today's edition.
 */
export async function scrapeAustral(_url: string): Promise<ParseFeedResult> {
  return scrapeAustralEdition(new Date())
}
