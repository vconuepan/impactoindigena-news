import type { AgendaItem, AgendaItemType } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'

/**
 * Weekly "Incidencia Internacional" digest (Fase 3).
 *
 * Deterministic selection + teaser formatting for the weekly social summary.
 * No LLM: the post is a count-based teaser that drives traffic to the section
 * (`/incidencia-internacional`), which is where the full, dated list lives.
 * Selection windows are configurable via `config.agenda.digest`.
 */

export const AGENDA_SECTION_PATH = '/incidencia-internacional'

export interface DigestCounts {
  evento: number
  convocatoria: number
  oportunidad: number
  publicacion: number
  total: number
}

export interface WeeklyAgendaSelection {
  items: AgendaItem[]
  counts: DigestCounts
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
}

function emptyCounts(): DigestCounts {
  return { evento: 0, convocatoria: 0, oportunidad: 0, publicacion: 0, total: 0 }
}

function countByType(items: AgendaItem[]): DigestCounts {
  const counts = emptyCounts()
  for (const item of items) {
    counts[item.type as AgendaItemType] += 1
    counts.total += 1
  }
  return counts
}

/**
 * Select published agenda items that are "this week's" news:
 *  - convocatoria / oportunidad with an upcoming deadline (dueDate within window),
 *  - evento upcoming or currently running (startDate within window, or start<=now<=end),
 *  - publicacion published recently (within the lookback window).
 */
export async function selectWeeklyAgendaItems(now: Date = new Date()): Promise<WeeklyAgendaSelection> {
  const cfg = config.agenda.digest
  const dueMax = addDays(now, cfg.dueWithinDays)
  const eventMax = addDays(now, cfg.eventWithinDays)
  const publishedMin = addDays(now, -cfg.publishedWithinDays)

  try {
    const items = await prisma.agendaItem.findMany({
      where: {
        status: 'published',
        OR: [
          // Calls & opportunities with a deadline coming up (not already past).
          { type: { in: ['convocatoria', 'oportunidad'] }, dueDate: { gte: now, lte: dueMax } },
          // Events starting soon.
          { type: 'evento', startDate: { gte: now, lte: eventMax } },
          // Events currently running (started, not yet ended).
          { type: 'evento', startDate: { lte: now }, endDate: { gte: now } },
          // Publications released recently.
          { type: 'publicacion', publishedAt: { gte: publishedMin } },
        ],
      },
      orderBy: [{ dueDate: 'asc' }, { startDate: 'asc' }, { publishedAt: 'desc' }],
    })
    return { items, counts: countByType(items) }
  } catch (err) {
    // Table not provisioned yet (Fase 1 migration pending) — degrade to empty
    // so the job no-ops instead of throwing before the migration runs.
    const code = (err as { code?: string })?.code
    if (code === 'P2021' || code === 'P2022') {
      return { items: [], counts: emptyCounts() }
    }
    throw err
  }
}

/** "3 eventos", "1 convocatoria con fecha límite", ... — plural-aware, Spanish. */
function segmentFor(type: AgendaItemType, n: number): string | null {
  if (n <= 0) return null
  switch (type) {
    case 'evento':
      return `${n} ${n === 1 ? 'evento' : 'eventos'}`
    case 'convocatoria':
      return `${n} ${n === 1 ? 'convocatoria' : 'convocatorias'} con fecha límite`
    case 'oportunidad':
      return `${n} ${n === 1 ? 'oportunidad' : 'oportunidades'}`
    case 'publicacion':
      return `${n} ${n === 1 ? 'publicación nueva' : 'publicaciones nuevas'}`
  }
}

/** Join segments as a natural Spanish list: "a, b y c". */
function joinSegments(segments: string[]): string {
  if (segments.length === 0) return ''
  if (segments.length === 1) return segments[0]
  return `${segments.slice(0, -1).join(', ')} y ${segments[segments.length - 1]}`
}

/** Human-readable count phrase, e.g. "3 eventos, 2 convocatorias con fecha límite y 2 oportunidades". */
export function buildCountPhrase(counts: DigestCounts): string {
  const order: AgendaItemType[] = ['evento', 'convocatoria', 'oportunidad', 'publicacion']
  const segments = order
    .map((t) => segmentFor(t, counts[t]))
    .filter((s): s is string => s !== null)
  return joinSegments(segments)
}

export type DigestChannel = 'bluesky' | 'mastodon' | 'twitter' | 'instagram'

// Per-channel text budget. Bluesky puts the URL in an external card (out of the
// text), so its body never carries the link. The others append the link inline.
const CHAR_LIMITS: Record<DigestChannel, number> = {
  bluesky: 300,
  mastodon: config.mastodon.charLimit,
  twitter: 280,
  instagram: 2200,
}
// Twitter shortens every URL to a fixed t.co length regardless of the real URL.
const TWITTER_URL_LENGTH = 23

const INTRO = '📅 Esta semana en incidencia internacional indígena:'
const CTA = 'Agenda completa 👉'

/**
 * Build the teaser text for a channel. The full URL is appended inline for every
 * channel except Bluesky (where it belongs in the link-card embed instead).
 */
export function buildDigestText(counts: DigestCounts, channel: DigestChannel): string {
  const phrase = buildCountPhrase(counts)
  const url = `${config.siteUrl}${AGENDA_SECTION_PATH}`

  if (channel === 'bluesky') {
    // URL lives in the external card; keep the body link-free.
    const body = `${INTRO} ${phrase}.\n\nEventos, convocatorias y oportunidades ante la ONU y el sistema interamericano 👇`
    return clampToLimit(body, CHAR_LIMITS.bluesky)
  }

  const suffix = `\n\n${CTA} ${url}`
  // For Twitter the URL counts as a fixed length; budget the body against that.
  const urlCost = channel === 'twitter' ? TWITTER_URL_LENGTH : url.length
  const bodyBudget = CHAR_LIMITS[channel] - (`\n\n${CTA} `.length + urlCost)
  const body = clampToLimit(`${INTRO} ${phrase}.`, Math.max(0, bodyBudget))
  return `${body}${suffix}`
}

/** Trim to a hard character budget without cutting mid-word when avoidable. */
function clampToLimit(text: string, limit: number): string {
  if ([...text].length <= limit) return text
  const chars = [...text]
  let cut = chars.slice(0, Math.max(0, limit - 1)).join('')
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace > limit * 0.6) cut = cut.slice(0, lastSpace)
  return `${cut}…`
}

/** Instagram caption: teaser + link (not clickable there) + a few hashtags. */
export function buildInstagramCaption(counts: DigestCounts): string {
  const base = buildDigestText(counts, 'instagram')
  const hashtags = '\n\n#PueblosIndígenas #DerechosIndígenas #ONU #IncidenciaInternacional'
  return `${base}${hashtags}`
}

/**
 * True when both dates fall in the same ISO week (used for once-per-week
 * idempotency so a manual re-trigger doesn't double-post).
 */
export function isSameIsoWeek(a: Date, b: Date): boolean {
  return isoWeekKey(a) === isoWeekKey(b)
}

/** ISO-8601 week key "YYYY-Www" (Monday-based, week 1 contains the first Thursday). */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7 // Sunday → 7
  d.setUTCDate(d.getUTCDate() + 4 - day) // shift to the Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
