import { z } from 'zod'

export const agendaItemTypeEnum = z.enum(['evento', 'convocatoria', 'oportunidad', 'publicacion'])
export const agendaStatusEnum = z.enum(['draft', 'published'])

export const adminAgendaQuerySchema = z.object({
  status: agendaStatusEnum.optional(),
  type: agendaItemTypeEnum.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(100),
})

// Dates accept a YYYY-MM-DD or full ISO string, or null to clear. The service
// converts to Date; invalid strings are rejected there.
const dateField = z.string().min(1).nullable().optional()

export const updateAgendaItemSchema = z.object({
  type: agendaItemTypeEnum.optional(),
  status: agendaStatusEnum.optional(),
  title: z.string().min(1).max(500).optional(),
  titleOriginal: z.string().max(500).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  dueDate: dateField,
  startDate: dateField,
  endDate: dateField,
  allDay: z.boolean().optional(),
  location: z.string().max(300).nullable().optional(),
  sourceName: z.string().min(1).max(200).optional(),
  sourceUrl: z.string().max(1000).nullable().optional(),
  docRef: z.string().max(200).nullable().optional(),
  countries: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  highlightNew: z.boolean().optional(),
  extendedDeadline: z.boolean().optional(),
})

export type UpdateAgendaItemInput = z.infer<typeof updateAgendaItemSchema>
