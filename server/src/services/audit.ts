import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('audit')

export interface AuditActor {
  userId?: string | null
  email?: string | null
  role?: string | null
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
