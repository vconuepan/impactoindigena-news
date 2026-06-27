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

function startOfTodayUTC(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * Normalize an RSS item into an AgendaItem draft. The TYPE comes from the source
 * (type-specific feed). Confidence gate (Fase 2a, no LLM):
 * - `publicacion`: the RSS pubDate IS the publication date → publish.
 * - `evento` / `convocatoria` / `oportunidad`: the RSS pubDate is NOT the event
 *   date nor the deadline (that lives in the body, needs LLM in 2b) → draft for
 *   review, with no date set.
 * Returns null if the item lacks a usable title/url.
 */
export function buildFromRss(item: RSSItem, source: AgendaSource, now: Date = new Date()): AgendaItemDraft | null {
  if (!item.url || !item.title) return null
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

  if (source.type === 'publicacion') {
    const pub = parseDate(item.datePublished)
    if (pub) {
      return { ...base, status: 'published', startDate: pub, publishedAt: now, extractionScore: 0.9 }
    }
  }
  // No reliable structured date for this type → hold as draft for admin / Fase 2b.
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
 * Normalize an iCal VEVENT into an `evento` AgendaItem draft. Authoritative
 * start/end dates → publish. Past events (effective end < today) and events
 * without a start date or UID are skipped (returns null).
 */
export function buildFromVevent(ev: VEventLike, source: AgendaSource, today: Date = startOfTodayUTC(), now: Date = new Date()): AgendaItemDraft | null {
  if (ev.type !== 'VEVENT' || !ev.uid || !ev.summary) return null
  const start = parseDate(ev.start)
  if (!start) return null
  const end = parseDate(ev.end)
  const effectiveEnd = end ?? start
  if (effectiveEnd < today) return null // skip past events

  return {
    type: 'evento',
    status: 'published',
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
    publishedAt: now,
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
