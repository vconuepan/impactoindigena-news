import { config } from '../config.js'
import { cleanupAuditLog } from '../services/audit.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('job:cleanup_audit_log')

/**
 * Poda el registro de actividad (`audit_log`), que hasta el 11-sep-2026 no lo
 * borraba NADIE: crecía sin plazo guardando `actor_email` e `ip_hash`, y ningún
 * camino de baja lo alcanzaba —ni el borrado de cuenta, que hasta ese día le
 * escribía el correo del titular justo al borrarlo—.
 *
 * Conservar sin plazo es lo que prohíbe el principio de proporcionalidad del
 * art. 3 letra c de la Ley 21.719: los datos se conservan «sólo por el período
 * de tiempo que sea necesario para cumplir con los fines del tratamiento».
 *
 * El plazo debe coincidir con el declarado en la Política de Privacidad.
 */
export async function runCleanupAuditLog(): Promise<void> {
  const retentionDays = config.audit.retentionDays
  log.info({ retentionDays }, 'starting')
  const deleted = await cleanupAuditLog()
  log.info({ deleted, retentionDays }, 'complete')
}
