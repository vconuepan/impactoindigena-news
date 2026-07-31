import prisma from './prisma.js'
import { createLogger } from './logger.js'

const log = createLogger('social-token')

/**
 * Persistencia de tokens sociales de larga duración (tabla `social_tokens`).
 *
 * Existe porque el token largo de Instagram se renueva por otros 60 días con un
 * valor NUEVO, y el proceso no puede reescribir su propia variable de entorno en
 * App Service. Sin esto, cada renovación exigiría intervención manual — que es
 * exactamente lo que dejó el posteo caído 12 días en julio de 2026.
 *
 * Usa SQL directo en vez de los modelos del client para no depender de
 * `prisma generate` (que obliga a detener el dev server). Ver
 * `.context/database-migrations.md`.
 */

export interface StoredToken {
  accessToken: string
  expiresAt: Date | null
  refreshedAt: Date | null
}

/** Devuelve el token guardado, o null si nunca se ha renovado. */
export async function getStoredToken(provider: string): Promise<StoredToken | null> {
  const rows = await prisma.$queryRaw<Array<{
    access_token: string
    expires_at: Date | null
    refreshed_at: Date | null
  }>>`
    SELECT access_token, expires_at, refreshed_at
    FROM social_tokens
    WHERE provider = ${provider}
    LIMIT 1
  `

  const row = rows[0]
  if (!row) return null

  return {
    accessToken: row.access_token,
    expiresAt: row.expires_at,
    refreshedAt: row.refreshed_at,
  }
}

/** Guarda un token renovado. Upsert por `provider`, limpia `last_error`. */
export async function saveToken(
  provider: string,
  accessToken: string,
  expiresAt: Date | null,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO social_tokens (id, provider, access_token, expires_at, refreshed_at, last_error, created_at, updated_at)
    VALUES (gen_random_uuid()::text, ${provider}, ${accessToken}, ${expiresAt}, NOW(), NULL, NOW(), NOW())
    ON CONFLICT (provider) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      expires_at   = EXCLUDED.expires_at,
      refreshed_at = NOW(),
      last_error   = NULL,
      updated_at   = NOW()
  `
  log.info({ provider, expiresAt }, 'social token stored')
}

/**
 * Registra el motivo por el que falló una renovación, sin tocar el token.
 * Deja rastro para el panel y para depurar sin depender de los logs, que rotan.
 */
export async function recordTokenError(provider: string, error: string): Promise<void> {
  const safe = error.length > 500 ? `${error.slice(0, 500)}…` : error
  await prisma.$executeRaw`
    UPDATE social_tokens
    SET last_error = ${safe}, updated_at = NOW()
    WHERE provider = ${provider}
  `
}
