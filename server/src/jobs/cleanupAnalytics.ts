import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('job:cleanup_analytics')

/**
 * Suprime las filas antiguas de `daily_visitors` (una por visitante único por
 * día: hash diario no reversible + país + categoría de dispositivo).
 *
 * Cumple el principio de proporcionalidad de la Ley 21.719 (art. 3 letra c):
 * los datos pueden conservarse "sólo por el período de tiempo que sea necesario
 * para cumplir con los fines del tratamiento, luego de lo cual deben ser
 * suprimidos o anonimizados". El plazo declarado en la Política de Privacidad y
 * `config.analytics.visitorRetentionDays` deben coincidir.
 *
 * `page_views` NO se poda: es un contador agregado (ruta + día + origen) sin
 * sujeto identificable, y se conserva como estadística histórica.
 *
 * SQL crudo para no depender de una regeneración del cliente Prisma.
 */
export async function runCleanupAnalytics(): Promise<void> {
  const days = config.analytics.visitorRetentionDays
  log.info({ retentionDays: days }, 'starting')

  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - days)
  cutoff.setUTCHours(0, 0, 0, 0)

  const deleted = await prisma.$executeRaw`
    DELETE FROM daily_visitors WHERE date < ${cutoff}
  `

  log.info({ deleted, cutoff: cutoff.toISOString().slice(0, 10) }, 'complete')
}
