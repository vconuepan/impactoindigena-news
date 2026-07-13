/**
 * Corte IDH press-release scraper (Fase 2c) — the Inter-American Court's
 * "Comunicados de prensa" listing (https://www.corteidh.or.cr/comunicados_prensa.cfm).
 * Spanish-native, high legal value. No RSS; static HTML (unlike the CIDH/OAS
 * site, which is JS-rendered and not scrapable with cheerio).
 *
 * Each release is an `<li class="tr_normal">` with an `<h4>` title, a `<p>` body
 * whose leading `<em>` holds the Spanish dateline ("San José, Costa Rica, 3 de
 * julio de 2026."), and an `<a class="link1" href="docs/comunicados/cp_N_YYYY.pdf">`.
 * Only indigenous-relevant releases are kept (the Court publishes on many
 * topics). Type is classified heuristically (audiencia → evento; convocatoria/
 * concurso → convocatoria; else publicacion). Dates are Spanish → parsed inline.
 *
 * Scraping rule: public HTML, no auth, no paywall bypass.
 */
import axios from 'axios'
import * as cheerio from 'cheerio'
import type { AgendaItemType } from '@prisma/client'
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
} from './agendaIngest.js'

const log = createLogger('corteidh-scraper')

const BASE_URL = 'https://www.corteidh.or.cr'
const LISTING_PATH = '/comunicados_prensa.cfm?lang=es'
const SOURCE_NAME = 'Corte IDH · Comunicados'

const ES_MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6,
  agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
}

/** Parse the first Spanish date ("3 de julio de 2026") as a midday-UTC Date. */
export function parseSpanishDate(text: string): Date | null {
  const m = text.match(/(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+de\s+(\d{4})/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const mon = ES_MONTHS[m[2].toLowerCase()]
  const year = parseInt(m[3], 10)
  if (mon === undefined || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, mon, day, 12, 0, 0))
  // Reject overflow (e.g. "31 de abril") via round-trip.
  if (isNaN(d.getTime()) || d.getUTCDate() !== day || d.getUTCMonth() !== mon) return null
  return d
}

/** Heuristic type from the release text. Most releases are publications. */
export function classifyType(text: string): AgendaItemType {
  const t = text.toLowerCase()
  if (/convocatoria|concurso|pasant[íi]a|vacante|llamado a/.test(t)) return 'convocatoria'
  if (/audiencia|per[íi]odo de sesiones|sesion(es)? (ordinaria|extraordinaria)/.test(t)) return 'evento'
  return 'publicacion'
}

/** Parse the listing HTML into indigenous-relevant press-release drafts. */
export function parseCorteIdhListing(html: string): AgendaItemDraft[] {
  const $ = cheerio.load(html)
  const drafts: AgendaItemDraft[] = []

  $('li.tr_normal').each((_i, el) => {
    const $el = $(el)
    const title = $el.find('h4').first().text().replace(/\s+/g, ' ').trim()
    const body = $el.find('p').text().replace(/\s+/g, ' ').trim()
    const href =
      $el.find('a.link1[href*="comunicados"]').first().attr('href') ||
      $el.find('a.link1').first().attr('href') ||
      ''
    if (!title || !href) return

    const url = new URL(href, BASE_URL).toString()
    const fullText = `${title} ${body}`
    // The Court publishes on many topics; keep only indigenous-relevant releases.
    if (!isIndigenousRelevant(title, fullText)) return

    const date = parseSpanishDate(body)
    const type = classifyType(fullText)

    // cp_N_YYYY is a stable id per release; fall back to the normalized URL.
    const cp = url.match(/cp_(\d+)_(\d{4})/i)
    const externalId = cp ? `corteidh:cp_${cp[1]}_${cp[2]}` : `corteidh:${normalizeUrl(url)}`

    drafts.push({
      type,
      status: 'draft',
      title,
      summary: body ? body.slice(0, 500) : null,
      dueDate: null,
      startDate: type === 'evento' ? date : null,
      endDate: null,
      allDay: false,
      location: null,
      sourceName: SOURCE_NAME,
      sourceUrl: url,
      lang: 'es',
      countries: [],
      tags: [],
      externalId,
      extractionScore: date ? 0.8 : 0.5,
      publishedAt: type === 'publicacion' ? date : null,
    })
  })

  return drafts
}

async function fetchListing(): Promise<string | null> {
  const url = `${BASE_URL}${LISTING_PATH}`
  try {
    const res = await crawlLimiter.run(url, () =>
      withRetry(() =>
        axios.get<string>(url, {
          timeout: 30_000,
          maxRedirects: 3,
          responseType: 'text',
          maxContentLength: 10 * 1024 * 1024,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,*/*',
            'Accept-Language': 'es',
          },
          validateStatus: (s) => s === 200,
        }),
      ),
    )
    return res.data
  } catch (err) {
    log.warn({ url, reason: summarizeError(err) }, 'Corte IDH listing failed')
    return null
  }
}

/** Scrape the press-release listing → deduped, indigenous-relevant drafts. */
export async function scrapeCorteIdh(): Promise<AgendaItemDraft[]> {
  const html = await fetchListing()
  if (!html) return []
  const seen = new Set<string>()
  const out: AgendaItemDraft[] = []
  for (const d of parseCorteIdhListing(html)) {
    if (seen.has(d.externalId)) continue
    seen.add(d.externalId)
    out.push(d)
  }
  log.info({ count: out.length }, 'scraped Corte IDH press releases')
  return out
}

/** Ingest Corte IDH releases as drafts (create-if-absent). Degrades on failure. */
export async function ingestCorteIdh(): Promise<IngestResult> {
  if (!config.agenda.corteIdhEnabled) {
    log.info('Corte IDH ingest disabled')
    return { created: 0, skipped: 0, drafts: 0, sourceErrors: 0 }
  }
  try {
    const drafts = await scrapeCorteIdh()
    const r = await persistDrafts(drafts)
    log.info({ found: drafts.length, created: r.created, skipped: r.skipped }, 'Corte IDH ingest complete')
    return r
  } catch (err) {
    log.error({ reason: summarizeError(err) }, 'Corte IDH ingest failed')
    return { created: 0, skipped: 0, drafts: 0, sourceErrors: 1 }
  }
}
