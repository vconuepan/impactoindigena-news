import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('audit')

export interface AuditActor {
  userId?: string | null
  email?: string | null
  role?: string | null
}

/**
 * El actor de esta operación es el propio titular de los datos, así que su
 * correo NO se guarda en el registro.
 *
 * Para qué sirve: cuando un administrador borra datos ajenos, su correo es
 * trazabilidad del operador y corresponde conservarlo. Pero en los caminos de
 * autoservicio —exportar mis datos, borrar mi cuenta— actor y titular son la
 * misma persona, y ahí el correo deja de ser trazabilidad y pasa a ser el dato
 * personal que la operación venía a eliminar.
 *
 * El caso extremo era el borrado de cuenta: `writeAuditLog({ actor: req.user })`
 * escribía el correo del titular EN EL MISMO ACTO de borrarlo, y como nada
 * purgaba la tabla, ese correo era lo único que sobrevivía al borrado. El
 * `userId` sigue guardándose y basta para auditar: identifica la operación y,
 * tras el borrado, queda huérfano —un uuid que ya no apunta a ninguna persona—.
 */
export function actorTitular(user: { userId: string; role?: string } | undefined): AuditActor {
  return { userId: user?.userId ?? null, email: null, role: user?.role ?? null }
}

export interface AuditEntry {
  actor?: AuditActor
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  ipHash?: string
}

/**
 * Write an audit-log entry for an operation on personal data (admin deletes,
 * data exports, account deletions). Fire-and-forget: it NEVER throws to the
 * caller — a failed audit write must not break the underlying operation. Backs
 * the "registro de actividad" promised by the privacy policy (Ley 21.719,
 * deber de seguridad).
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actor?.userId ?? null,
        actorEmail: entry.actor?.email ?? null,
        actorRole: entry.actor?.role ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ipHash: entry.ipHash ?? null,
      },
    })
  } catch (err) {
    log.error({ err, action: entry.action }, 'failed to write audit log')
  }
}

/**
 * Suprime las entradas del registro de actividad más antiguas que el plazo
 * declarado. Sin esto la tabla crece sin límite con `actor_email` e `ip_hash`
 * dentro, que es tratamiento sin plazo de conservación.
 *
 * El plazo vive en `config.audit.retentionDays` y **debe coincidir con el que
 * declara la sección Conservación de la Política de Privacidad** — el mismo
 * acoplamiento que documenta `cleanupAnalytics`.
 *
 * SQL crudo, por la misma razón que el job de analytics: no depender de que el
 * cliente de Prisma esté regenerado.
 */
export async function cleanupAuditLog(): Promise<number> {
  const days = config.audit.retentionDays
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - days)
  cutoff.setUTCHours(0, 0, 0, 0)

  const deleted = await prisma.$executeRaw`
    DELETE FROM audit_log WHERE created_at < ${cutoff}
  `
  return deleted
}
