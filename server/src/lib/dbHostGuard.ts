/**
 * Decide si una DATABASE_URL apunta a una base local.
 *
 * Existe porque `prisma migrate dev` —tambien con `--create-only`— APLICA las
 * migraciones pendientes antes de crear la nueva (verificado en el CLI de
 * Prisma 6.19.3 el 5-oct-2026: `applyMigrations()` corre antes de mirar la
 * bandera), y `server/.env` apunta a la base de produccion en Azure. Las
 * migraciones de este repo se aplican a mano, con SQL que corre el director:
 * ningun `db:migrate*` debe tocar un host que no sea local.
 */

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function hostDeDatabaseUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname
    return host ? host.toLowerCase() : null
  } catch {
    return null
  }
}

export function esHostLocal(url: string | undefined | null): boolean {
  if (!url) return false
  const host = hostDeDatabaseUrl(url)
  if (!host) return false
  return HOSTS_LOCALES.has(host) || host.endsWith('.localhost') || host.endsWith('.test')
}
