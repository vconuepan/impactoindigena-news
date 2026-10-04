import { reconcileCommunityReviews } from '../services/communityReview.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('job:reconcile_community_reviews')

/**
 * Concilia la retencion por vertical (D4): crea filas para notas que encajan en
 * una vertical en revision y no tienen, reevalua las decisiones de maquina que
 * quedaron viejas y borra las de notas que ya no encajan. Nunca toca una
 * decision humana. Ver services/communityReview.ts.
 *
 * Nace DESHABILITADO (migracion 20261004000000 y seed-jobs.ts): lo enciende el
 * director despues de poner las verticales en sombra y correr la carga inicial
 * (diseño D4, seccion 8). Sin verticales en revision, no hace nada.
 */
export async function runReconcileCommunityReviews(): Promise<void> {
  const reports = await reconcileCommunityReviews()
  if (reports.length === 0) {
    log.info('no verticals under review; nothing to reconcile')
    return
  }
  for (const r of reports) log.info(r, 'reconciled')
}
