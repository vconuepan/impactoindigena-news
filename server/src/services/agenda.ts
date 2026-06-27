import { Prisma, type AgendaItemType, type ContentStatus } from '@prisma/client'
import prisma from '../lib/prisma.js'
import type { UpdateAgendaItemInput } from '../schemas/agenda.js'

export interface ListAgendaFilters {
  status?: ContentStatus
  type?: AgendaItemType
  page: number
  pageSize: number
}

export async function listAgendaItems(filters: ListAgendaFilters) {
  const where: Prisma.AgendaItemWhereInput = {}
  if (filters.status) where.status = filters.status
  if (filters.type) where.type = filters.type

  try {
    const [items, total] = await Promise.all([
      prisma.agendaItem.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // drafts first, newest first
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.agendaItem.count({ where }),
    ])
    return { items, total, page: filters.page, pageSize: filters.pageSize }
  } catch (err) {
    // Table not provisioned yet (Fase 1 migration pending) — degrade to empty
    // so /admin/agenda renders instead of 500-ing before the migration runs.
    const code = (err as { code?: string })?.code
    if (code === 'P2021' || code === 'P2022') {
      return { items: [], total: 0, page: filters.page, pageSize: filters.pageSize }
    }
    throw err
  }
}

/** Convert an incoming date string/null into a Date|null; throws on invalid. */
function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) throw new AgendaValidationError(`Invalid date: ${value}`)
  return d
}

export class AgendaValidationError extends Error {}

export async function updateAgendaItem(id: string, input: UpdateAgendaItemInput) {
  const data: Prisma.AgendaItemUpdateInput = {}

  // Scalars copied as-is when present
  for (const key of ['type', 'status', 'title', 'titleOriginal', 'summary', 'allDay',
    'location', 'sourceName', 'sourceUrl', 'docRef', 'countries', 'tags',
    'highlightNew', 'extendedDeadline'] as const) {
    if (input[key] !== undefined) {
      ;(data as Record<string, unknown>)[key] = input[key]
    }
  }
  // Date fields need conversion
  const due = toDate(input.dueDate)
  if (due !== undefined) data.dueDate = due
  const start = toDate(input.startDate)
  if (start !== undefined) data.startDate = start
  const end = toDate(input.endDate)
  if (end !== undefined) data.endDate = end

  // Stamp publishedAt the first time an item is published
  if (input.status === 'published') {
    const current = await prisma.agendaItem.findUnique({ where: { id }, select: { publishedAt: true } })
    if (current && !current.publishedAt) data.publishedAt = new Date()
  }

  return prisma.agendaItem.update({ where: { id }, data })
}

export async function deleteAgendaItem(id: string) {
  return prisma.agendaItem.delete({ where: { id } })
}
