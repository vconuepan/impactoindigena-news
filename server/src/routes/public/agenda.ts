/**
 * GET /api/public/agenda — grouped, published, non-expired agenda items for the
 * public "Incidencia Internacional Indígena" page.
 *
 * Returns { events, calls, opportunities, publications }. Only `published` items
 * are exposed (the draft gate keeps low-confidence extractions hidden). Expired
 * items are filtered out: past events (effective end < today) and closed
 * deadlines (dueDate < today) are dropped.
 */
import { Router } from 'express'
import prisma from '../../lib/prisma.js'
import { TTLCache, cached } from '../../lib/cache.js'
import { createLogger } from '../../lib/logger.js'

const router = Router()
const log = createLogger('public:agenda')

// Public payload shapes (kept local — the server defines its own response types,
// mirrored by PublicAgenda/PublicAgendaItem in shared/types for the client).
type AgendaItemType = 'evento' | 'convocatoria' | 'oportunidad' | 'publicacion'

interface PublicAgendaItem {
  id: string
  type: AgendaItemType
  title: string
  summary: string | null
  dueDate: string | null
  startDate: string | null
  endDate: string | null
  allDay: boolean
  location: string | null
  sourceName: string
  sourceUrl: string | null
  docRef: string | null
  countries: string[]
  tags: string[]
  highlightNew: boolean
  extendedDeadline: boolean
}

interface PublicAgenda {
  events: PublicAgendaItem[]
  calls: PublicAgendaItem[]
  opportunities: PublicAgendaItem[]
  publications: PublicAgendaItem[]
}

const LIST_TTL = 5 * 60 * 1000 // 5 minutes
const listCache = new TTLCache<unknown>(LIST_TTL)

// DB row shape we select (kept local to avoid Prisma type coupling).
interface AgendaRow {
  id: string
  type: 'evento' | 'convocatoria' | 'oportunidad' | 'publicacion'
  title: string
  summary: string | null
  dueDate: Date | null
  startDate: Date | null
  endDate: Date | null
  allDay: boolean
  location: string | null
  sourceName: string
  sourceUrl: string | null
  docRef: string | null
  countries: string[]
  tags: string[]
  highlightNew: boolean
  extendedDeadline: boolean
}

function toPublic(r: AgendaRow): PublicAgendaItem {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    summary: r.summary,
    dueDate: r.dueDate?.toISOString() ?? null,
    startDate: r.startDate?.toISOString() ?? null,
    endDate: r.endDate?.toISOString() ?? null,
    allDay: r.allDay,
    location: r.location,
    sourceName: r.sourceName,
    sourceUrl: r.sourceUrl,
    docRef: r.docRef,
    countries: r.countries,
    tags: r.tags,
    highlightNew: r.highlightNew,
    extendedDeadline: r.extendedDeadline,
  }
}

router.get('/', async (_req, res) => {
  try {
    const data = await cached(listCache, 'agenda', async (): Promise<PublicAgenda> => {
      // Start of today (UTC) — items closing/ending today are still shown.
      const startOfToday = new Date()
      startOfToday.setUTCHours(0, 0, 0, 0)

      const rows = (await prisma.agendaItem.findMany({
        where: { status: 'published' },
        select: {
          id: true, type: true, title: true, summary: true,
          dueDate: true, startDate: true, endDate: true, allDay: true,
          location: true, sourceName: true, sourceUrl: true, docRef: true,
          countries: true, tags: true, highlightNew: true, extendedDeadline: true,
        },
      })) as AgendaRow[]

      // Events: keep upcoming/ongoing (effective end >= today). Sort by start asc.
      const events = rows
        .filter((r) => r.type === 'evento')
        .filter((r) => {
          const end = r.endDate ?? r.startDate
          return !end || end >= startOfToday
        })
        .sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0))
        .map(toPublic)

      // Calls / opportunities: keep open deadlines (dueDate >= today or none). Sort by due asc.
      const openByDue = (type: AgendaRow['type']) =>
        rows
          .filter((r) => r.type === type)
          .filter((r) => !r.dueDate || r.dueDate >= startOfToday)
          .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
          .map(toPublic)

      // Publications: most recent first (no expiry).
      const publications = rows
        .filter((r) => r.type === 'publicacion')
        .sort((a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0))
        .map(toPublic)

      return {
        events,
        calls: openByDue('convocatoria'),
        opportunities: openByDue('oportunidad'),
        publications,
      }
    })

    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ err: msg }, 'failed to list agenda items')
    res.status(500).json({ error: 'Failed to list agenda items' })
  }
})

export default router
