/**
 * Agenda LLM enrichment (Fase 2b). Two independent passes over draft items,
 * each idempotent via a reserved `sys:` tag (no DB migration needed):
 *
 *  A. DATE EXTRACTION — for convocatoria/oportunidad with no dueDate (e.g. FILAC
 *     calls that arrive "sin fecha"): fetch the detail page (local extraction
 *     tiers only, no paid API), feed the untrusted text to a small LLM, and fill
 *     dueDate/startDate/endDate/location/summary if currently empty.
 *  B. TRANSLATION — for items not yet translated (titleOriginal is null), e.g.
 *     English Docip/OHCHR titles: translate to Spanish, keeping the original in
 *     titleOriginal. A cheap diacritics heuristic skips clearly-Spanish titles.
 *
 * Pass A runs before B (A works on original-language content and can refine type).
 * Both never clobber admin edits (only fill null fields) and degrade per-item.
 */
import { Prisma } from '@prisma/client'
import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { summarizeError } from '../utils/errors.js'
import { getSmallLLM, rateLimitDelay } from './llm.js'
import { extractContent } from './extractor.js'
import { buildExtractAgendaPrompt, buildTranslateAgendaPrompt } from '../prompts/agenda.js'
import { extractAgendaDetailsSchema, translateAgendaSchema } from '../schemas/agenda.js'

const log = createLogger('agenda-enrich')

const TAG_DATED = 'sys:llm-dated'
const TAG_TRANSLATED = 'sys:llm-translated'

export interface EnrichResult {
  dated: number
  translated: number
  failed: number
}

/** Parse an LLM-returned YYYY-MM-DD (or ISO) date. `endOfDay` for deadlines so
 *  an item closing today is still "open". Rejects out-of-range / overflow dates
 *  (e.g. "2026-13-40") instead of letting Date.UTC silently normalize them. */
function parseYmd(value: string | null, endOfDay = false): Date | null {
  if (!value) return null
  const m = value.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = +m[1], mo = +m[2], d = +m[3]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, mo - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0))
  // Reject overflow (Date.UTC rolls e.g. Feb 30 → Mar 2): require a round-trip.
  if (isNaN(date.getTime()) || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return date
}

/** Pass A — fill missing dates/metadata for undated calls/opportunities. */
async function enrichDates(limit: number): Promise<{ dated: number; failed: number }> {
  const candidates = await prisma.agendaItem.findMany({
    where: {
      status: 'draft',
      type: { in: ['convocatoria', 'oportunidad'] },
      dueDate: null,
      sourceUrl: { not: null },
      NOT: { tags: { has: TAG_DATED } },
    },
    take: limit,
    select: {
      id: true, title: true, sourceUrl: true, type: true,
      summary: true, location: true, startDate: true, endDate: true, extractionScore: true,
    },
  })

  let dated = 0
  let failed = 0
  for (const c of candidates) {
    try {
      // Local extraction tiers only (shouldAbort bails before the paid API tier).
      const extracted = await extractContent(c.sourceUrl as string, { shouldAbort: () => true })
      if (!extracted || !extracted.content) {
        // No extractable content (JS page / persistent 403). withRetry already
        // covered transient blips, so mark it tried — otherwise the same dead
        // URLs would re-consume the daily limit forever and starve other items.
        await prisma.agendaItem.update({ where: { id: c.id }, data: { tags: { push: TAG_DATED } } })
        log.warn({ id: c.id }, 'date enrich: no content fetched, marking tried')
        failed++
        continue
      }

      await rateLimitDelay()
      const llm = getSmallLLM().withStructuredOutput(extractAgendaDetailsSchema, { method: 'functionCalling' })
      const prompt = buildExtractAgendaPrompt(c.title, extracted.content.slice(0, config.agenda.enrichContentMaxChars))
      const r = await llm.invoke([new HumanMessage(prompt)])

      const data: Prisma.AgendaItemUpdateInput = { tags: { push: TAG_DATED } }
      const due = parseYmd(r.dueDate, true)
      if (due) data.dueDate = due
      if (!c.startDate) { const s = parseYmd(r.startDate); if (s) data.startDate = s }
      if (!c.endDate) { const e = parseYmd(r.endDate); if (e) data.endDate = e }
      if (!c.location && r.location) data.location = r.location
      if (!c.summary && r.summary) data.summary = r.summary
      // Refine type only when confident (draft-first, admin reviews anyway).
      if (r.type && r.type !== c.type && r.confidence >= 0.75) data.type = r.type
      if (typeof r.confidence === 'number') {
        data.extractionScore = Math.max(c.extractionScore ?? 0, r.confidence)
      }

      await prisma.agendaItem.update({ where: { id: c.id }, data })
      if (due) dated++
    } catch (err) {
      log.error({ id: c.id, reason: summarizeError(err) }, 'date enrich failed')
      failed++
    }
  }
  return { dated, failed }
}

/** Pass B — translate non-Spanish titles/summaries to Spanish. */
async function enrichTranslations(limit: number): Promise<{ translated: number; failed: number }> {
  const candidates = await prisma.agendaItem.findMany({
    where: {
      status: 'draft',
      titleOriginal: null,
      NOT: { tags: { has: TAG_TRANSLATED } },
    },
    take: limit,
    select: { id: true, title: true, summary: true },
  })

  let translated = 0
  let failed = 0
  for (const c of candidates) {
    try {
      // The LLM is the authoritative language detector: a diacritics heuristic
      // misfires on English titles with accented proper nouns (e.g. "José"),
      // permanently leaving them untranslated. isSpanish=true is a cheap no-op.
      await rateLimitDelay()
      const llm = getSmallLLM().withStructuredOutput(translateAgendaSchema, { method: 'functionCalling' })
      const r = await llm.invoke([new HumanMessage(buildTranslateAgendaPrompt(c.title, c.summary))])

      const data: Prisma.AgendaItemUpdateInput = { tags: { push: TAG_TRANSLATED } }
      if (!r.isSpanish && r.titleEs) {
        data.titleOriginal = c.title
        data.title = r.titleEs
        if (c.summary && r.summaryEs) data.summary = r.summaryEs
        translated++
      }
      await prisma.agendaItem.update({ where: { id: c.id }, data })
    } catch (err) {
      log.error({ id: c.id, reason: summarizeError(err) }, 'translation enrich failed')
      failed++
    }
  }
  return { translated, failed }
}

/**
 * Run both enrichment passes. Bounded per run by config limits to cap LLM cost.
 * Resilient: a per-item failure is counted and skipped, never aborts the run.
 */
export async function enrichAgendaItems(opts?: { dateLimit?: number; translateLimit?: number }): Promise<EnrichResult> {
  const dateLimit = opts?.dateLimit ?? config.agenda.enrichDateLimit
  const translateLimit = opts?.translateLimit ?? config.agenda.enrichTranslateLimit

  const a = await enrichDates(dateLimit)
  const b = await enrichTranslations(translateLimit)

  const result: EnrichResult = { dated: a.dated, translated: b.translated, failed: a.failed + b.failed }
  log.info(result, 'agenda enrich complete')
  return result
}
