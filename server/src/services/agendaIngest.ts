import axios from 'axios'
import ical from 'node-ical'
import { Prisma, type AgendaItemType, type ContentStatus } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { summarizeError } from '../utils/errors.js'
import { parseFeed, type RSSItem } from './rssParser.js'
import { AGENDA_SOURCES, type AgendaSource } from '../data/agendaSources.js'

const log = createLogger('agenda-ingest')

// What we build for a new AgendaItem (status decided by the confidence gate).
export type AgendaItemDraft = {
  type: AgendaItemType
  status: ContentStatus
  title: string
  summary: string | null
  dueDate: Date | null
  startDate: Date | null
  endDate: Date | null
  allDay: boolean
  location: string | null
  sourceName: string
  sourceUrl: string | null
  lang: string
  countries: string[]
  tags: string[]
  externalId: string
  extractionScore: number
  publishedAt: Date | null
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return isNaN(d.getTime()) ? null : d
}

// Calendar-artifact titles that aren't real agenda items (e.g. the Docip Google
// Calendar emits daylight-saving-time change markers as VEVENTs).
const JUNK_TITLE_PATTERNS = [/daylight saving/i, /horario de verano/i, /\bDST\b/]

/** Reject placeholder/empty/artifact titles that feeds emit (CBD "No item available", DST markers). */
function isJunkTitle(title: string | undefined | null): boolean {
  const raw = (title ?? '').trim()
  const t = raw.toLowerCase()
  if (t.length < 4 || t === 'no item available' || t === 'untitled' || t === 'sin título') return true
  return JUNK_TITLE_PATTERNS.some((re) => re.test(raw))
}

// RSS items (calls/events) carry no structured event date — only a publish date.
// Anything published more than this long ago is stale (the deadline passed / the
// event happened): e.g. a 2021 fellowship. 6 months keeps the agenda to recent
// items only (~current year); tune via env without a redeploy.
const RSS_MAX_AGE_MONTHS = parseInt(process.env.AGENDA_RSS_MAX_AGE_MONTHS || '6', 10)

// Indigenous-relevance keyword gate for broad sources (source.topicFilter).
const INDIGENOUS_TERMS = [
  'indigena', 'indigenous', 'originari', 'aborigen', 'first nations', 'tribal',
  'abya yala', 'clpi', 'fpic', 'medpi', 'emrip', 'unpfii', 'foro permanente',
  'consulta previa', 'consentimiento libre', 'afroindigena',
  'mapuche', 'quechua', 'aymara', 'guarani', 'sami', 'maori', 'kichwa',
  'rapa nui', 'lickanantay', 'wayuu', 'garifuna', 'nasa', 'inuit', 'first peoples',
]

function stripDiacritics(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** True if any provided text mentions an indigenous-related term (accent-insensitive). */
function isIndigenousRelevant(...texts: (string | null | undefined)[]): boolean {
  const hay = texts.filter(Boolean).map((t) => stripDiacritics(t as string)).join('  ')
  return INDIGENOUS_TERMS.some((term) => hay.includes(term))
}

// Administrative procurement/tender notices that orgs publish in their "calls"
// feeds (e.g. FILAC convoca empresas auditoras / contratación de servicios): these
// are supplier-facing tenders, NOT opportunities for indigenous peoples. Dropped
// from ALL sources (not gated by topicFilter) since they're noise everywhere.
const PROCUREMENT_TERMS = [
  'empresas auditoras', 'auditoria externa', 'servicios de auditoria',
  'contratacion de servicios', 'contratacion de empresa', 'licitacion',
  'terminos de referencia', 'cotizacion', 'concurso de precios',
  'llamado a presentar ofertas', 'invitacion a cotizar',
]

/** True if a title/summary looks like an administrative procurement/tender notice. */
function isProcurementNotice(...texts: (string | null | undefined)[]): boolean {
  const hay = texts.filter(Boolean).map((t) => stripDiacritics(t as string)).join('  ')
  return PROCUREMENT_TERMS.some((term) => hay.includes(term))
}

function isStaleByPubDate(datePublished: string | null, now: Date): boolean {
  const d = parseDate(datePublished)
  if (!d) return false // no date → can't tell → keep (lands as a draft anyway)
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - RSS_MAX_AGE_MONTHS)
  return d < cutoff
}

function startOfTodayUTC(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * Normalize an RSS item into an AgendaItem DRAFT. The TYPE comes from the source
 * (type-specific feed). Curation model: nothing auto-publishes — every item lands
 * as `draft` for admin review. `extractionScore` still flags confidence: higher
 * when a publication date is present, lower when no structured date exists (the
 * deadline/event date lives in the body and needs LLM in Fase 2b).
 * Returns null if the item lacks a usable title/url or the title is junk.
 */
export function buildFromRss(item: RSSItem, source: AgendaSource, now: Date = new Date()): AgendaItemDraft | null {
  if (!item.url || !item.title || isJunkTitle(item.title)) return null
  if (isProcurementNotice(item.title, item.description)) return null // admin tenders, not opportunities
  if (isStaleByPubDate(item.datePublished, now)) return null
  // Broad sources (topicFilter): keep only indigenous-relevant items. FILAC and
  // other inherently indigenous sources omit topicFilter and pass through.
  if (source.topicFilter && !isIndigenousRelevant(item.title, item.description)) return null
  const base = {
    type: source.type,
    title: item.title.trim(),
    summary: item.description?.trim() || null,
    dueDate: null as Date | null,
    startDate: null as Date | null,
    endDate: null as Date | null,
    allDay: false,
    location: null as string | null,
    sourceName: source.sourceName,
    sourceUrl: item.url,
    lang: source.lang,
    countries: [] as string[],
    tags: [] as string[],
    externalId: `rss:${item.url}`,
  }

  // Publications carry the pubDate (shown via startDate); higher confidence but
  // still draft for curation.
  if (source.type === 'publicacion') {
    const pub = parseDate(item.datePublished)
    return { ...base, status: 'draft', startDate: pub, publishedAt: null, extractionScore: pub ? 0.9 : 0.3 }
  }
  return { ...base, status: 'draft', publishedAt: null, extractionScore: 0.3 }
}

type VEventLike = {
  type?: string
  uid?: string
  summary?: string
  start?: Date
  end?: Date
  location?: string
  url?: string
  datetype?: string
}

/**
 * Normalize an iCal VEVENT into an `evento` AgendaItem DRAFT (high confidence —
 * authoritative start/end dates — but still draft for curation). Past events
 * (effective end < today), junk titles, and events without a start/UID are
 * skipped (returns null).
 */
export function buildFromVevent(ev: VEventLike, source: AgendaSource, today: Date = startOfTodayUTC(), now: Date = new Date()): AgendaItemDraft | null {
  if (ev.type !== 'VEVENT' || !ev.uid || !ev.summary || isJunkTitle(ev.summary)) return null
  if (isProcurementNotice(ev.summary)) return null // admin tenders, not events
  void now
  const start = parseDate(ev.start)
  if (!start) return null
  const end = parseDate(ev.end)
  const effectiveEnd = end ?? start
  if (effectiveEnd < today) return null // skip past events
  // Broad calendars (topicFilter): keep only indigenous-relevant events.
  if (source.topicFilter && !isIndigenousRelevant(ev.summary)) return null

  return {
    type: 'evento',
    status: 'draft',
    title: ev.summary.trim(),
    summary: null,
    dueDate: null,
    startDate: start,
    endDate: end,
    allDay: ev.datetype === 'date',
    location: ev.location?.trim() || null,
    sourceName: source.sourceName,
    sourceUrl: ev.url || null,
    lang: source.lang,
    countries: [],
    tags: [],
    externalId: `ical:${ev.uid}`,
    extractionScore: 1.0,
    publishedAt: null,
  }
}

async function fetchIcs(url: string): Promise<string> {
  const res = await axios.get<string>(url, {
    timeout: config.crawl.httpTimeoutMs,
    maxRedirects: 3,
    responseType: 'text',
    maxContentLength: 10 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ImpactoIndigenaCrawler/1.0; +https://impactoindigena.news)',
      'Accept': 'text/calendar, text/plain, */*',
    },
  })
  return res.data
}

/** Persist a draft create-if-absent (never clobbers admin edits to existing items). */
async function persist(draft: AgendaItemDraft): Promise<'created' | 'skipped'> {
  try {
    await prisma.agendaItem.create({ data: draft })
    return 'created'
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'skipped'
    throw err
  }
}

export interface IngestResult {
  created: number
  skipped: number
  drafts: number
  sourceErrors: number
}

/**
 * Ingest all structured agenda sources into AgendaItem (Fase 2a). Resilient
 * per-source (one failing source doesn't abort the rest). Dedups by externalId
 * (create-if-absent). Items with a reliable date publish; the rest land as drafts.
 */
export async function ingestAgenda(sources: AgendaSource[] = AGENDA_SOURCES): Promise<IngestResult> {
  const result: IngestResult = { created: 0, skipped: 0, drafts: 0, sourceErrors: 0 }
  const today = startOfTodayUTC()
  const now = new Date()

  for (const source of sources) {
    try {
      const drafts: AgendaItemDraft[] = []

      if (source.kind === 'rss') {
        const { items } = await parseFeed(source.url)
        for (const item of items) {
          const d = buildFromRss(item, source, now)
          if (d) drafts.push(d)
        }
      } else {
        const text = await fetchIcs(source.url)
        const parsed = await ical.async.parseICS(text)
        for (const key of Object.keys(parsed)) {
          const d = buildFromVevent(parsed[key] as VEventLike, source, today, now)
          if (d) drafts.push(d)
        }
      }

      let created = 0
      for (const d of drafts) {
        const outcome = await persist(d)
        if (outcome === 'created') {
          result.created++
          created++
          if (d.status === 'draft') result.drafts++
        } else {
          result.skipped++
        }
      }
      log.info({ source: source.sourceName, found: drafts.length, created }, 'agenda source ingested')
    } catch (err) {
      result.sourceErrors++
      log.error({ source: source.sourceName, reason: summarizeError(err) }, 'agenda source failed')
    }
  }

  log.info(result, 'agenda ingest complete')
  return result
}
