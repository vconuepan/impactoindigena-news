import { createLogger } from '../lib/logger.js'
import { ingestAgenda } from '../services/agendaIngest.js'
import { ingestOhchr } from '../services/ohchrScraper.js'
import { enrichAgendaItems } from '../services/agendaEnrich.js'
import { summarizeError } from '../utils/errors.js'

const log = createLogger('job:ingest_agenda')

/**
 * Daily ingestion of "Incidencia Internacional" agenda items:
 *  1. structured sources (RSS by type + iCal session calendars),
 *  2. OHCHR calls-for-input (scrape),
 *  3. LLM enrichment (extract deadlines for undated calls + translate to Spanish).
 * Everything lands as drafts for admin review (/admin/agenda). The enrichment
 * step is isolated so an LLM failure never masks a successful ingestion.
 */
export async function runIngestAgenda(): Promise<void> {
  log.info('starting agenda ingest')

  // Each stage is isolated so one failing stage doesn't skip the others
  // (e.g. an OHCHR outage must not prevent enrichment of existing items).
  try {
    const structured = await ingestAgenda()
    const ohchr = await ingestOhchr()
    log.info({ structured, ohchr }, 'agenda ingest (structured + OHCHR) complete')
  } catch (err) {
    log.error({ reason: summarizeError(err) }, 'agenda ingest (structured/OHCHR) failed')
  }

  try {
    const enrich = await enrichAgendaItems()
    log.info(enrich, 'agenda enrich complete')
  } catch (err) {
    log.error({ reason: summarizeError(err) }, 'agenda enrich failed (ingestion still succeeded)')
  }
}
