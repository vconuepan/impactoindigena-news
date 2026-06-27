import { createLogger } from '../lib/logger.js'
import { ingestAgenda } from '../services/agendaIngest.js'

const log = createLogger('job:ingest_agenda')

/**
 * Daily ingestion of "Incidencia Internacional" agenda items from structured
 * sources (RSS by type + iCal session calendars). Items with a reliable date
 * publish; the rest land as drafts for admin review (/admin/agenda).
 */
export async function runIngestAgenda(): Promise<void> {
  log.info('starting agenda ingest')
  const result = await ingestAgenda()
  log.info(result, 'agenda ingest job complete')
}
