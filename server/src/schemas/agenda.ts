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

// ---------------------------------------------------------------------------
// LLM enrichment schemas (Fase 2b) — structured output for getSmallLLM().
// Format guidance lives in .describe() (project convention), not in the prompt.
// ---------------------------------------------------------------------------

/**
 * Date/type extraction from a call/opportunity detail page. The LLM reads the
 * (untrusted) page content and returns the deadline and structural metadata.
 */
export const extractAgendaDetailsSchema = z.object({
  dueDate: z.string().nullable().describe(
    'Submission/application DEADLINE as YYYY-MM-DD, or null if the page states no deadline. ' +
    'For convocatoria/oportunidad this is the closing date. Use the explicit year from the text; never invent a year.',
  ),
  startDate: z.string().nullable().describe('Event START date as YYYY-MM-DD, or null. For evento/sesión only.'),
  endDate: z.string().nullable().describe('Event END date as YYYY-MM-DD, or null.'),
  type: agendaItemTypeEnum.describe(
    'Best item type: evento (event/session with a date), convocatoria (call for input/applications with a deadline), ' +
    'oportunidad (fellowship/grant/fund), publicacion (report/study).',
  ),
  location: z.string().nullable().describe('City/venue if a physical or named location is given, else null.'),
  summary: z.string().nullable().describe('One neutral sentence in Spanish (max 240 chars) summarizing the item, or null if not derivable.'),
  confidence: z.number().min(0).max(1).describe('Confidence 0-1 that the extracted dates/type reflect the source. Use < 0.5 when dates are guessed or absent.'),
})
export type ExtractAgendaDetails = z.infer<typeof extractAgendaDetailsSchema>

/**
 * Translation of an agenda item's title/summary to Spanish (site is
 * Spanish-first). The LLM also reports whether the input was already Spanish.
 */
export const translateAgendaSchema = z.object({
  isSpanish: z.boolean().describe('true if the provided title is ALREADY in natural Spanish.'),
  titleEs: z.string().describe(
    'The title in natural Spanish. If already Spanish, return it unchanged. ' +
    'Keep proper nouns, acronyms (EMRIP, FPIC, CLPI, OHCHR) and organization names intact.',
  ),
  summaryEs: z.string().nullable().describe('The summary in Spanish, or null if no summary was provided.'),
})
export type TranslateAgenda = z.infer<typeof translateAgendaSchema>
