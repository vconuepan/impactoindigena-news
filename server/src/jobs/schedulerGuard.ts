/**
 * ¿Puede este proceso programar jobs automáticos?
 *
 * EL RIESGO QUE CIERRA (medido el 23-oct-2026). El `server/.env` local apunta a
 * la base de PRODUCCIÓN en Azure, y `initScheduler()` corre al arrancar: lee
 * `job_runs`, registra cada cron y ejecuta en el acto los que estén atrasados.
 * Un `npm run dev --prefix server` en el Mac habría rastreado, analizado,
 * publicado y posteado en redes contra producción, en paralelo al App Service.
 * Ese día no pasó porque el firewall de Azure no dejaba conectar desde el Mac;
 * el día que se abra, sí pasa.
 *
 * LA REGLA. Se programan jobs si se cumple cualquiera de estas:
 * - es producción: `NODE_ENV=production` (está en la configuración del App
 *   Service, verificado con `az` el 25-oct-2026) o `WEBSITE_SITE_NAME`, que la
 *   plataforma inyecta (no aparece en los registros, así que no está
 *   verificada: solo suma);
 * - la base es local: `localhost`, `127.0.0.1`, `::1` o un nombre sin punto
 *   (`db`, el servicio de docker-compose);
 * - alguien lo pide a propósito con `SCHEDULER_ALLOW_REMOTE_DB=true`.
 *
 * Fuera de eso no se programa nada. Las condiciones solo pueden HABILITAR: en
 * producción basta la primera, así que un error en las otras nunca apaga los
 * jobs de producción. Correr un job a mano desde el panel sigue funcionando:
 * es un acto explícito, como cualquier otra escritura del panel.
 */

export interface SchedulerDecision {
  start: boolean
  reason: string
}

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** El host de la base, o null si la URL no se puede leer. */
export function databaseHost(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null
  try {
    return new URL(databaseUrl).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isLocalDatabaseHost(host: string | null): boolean {
  if (!host) return false
  return HOSTS_LOCALES.has(host) || !host.includes('.')
}

export function schedulerStartDecision(env: NodeJS.ProcessEnv): SchedulerDecision {
  if (env.NODE_ENV === 'production') return { start: true, reason: 'NODE_ENV=production' }
  if (env.WEBSITE_SITE_NAME) return { start: true, reason: 'Azure App Service' }

  const host = databaseHost(env.DATABASE_URL)
  if (isLocalDatabaseHost(host)) return { start: true, reason: `base local (${host})` }

  if (env.SCHEDULER_ALLOW_REMOTE_DB === 'true') {
    return { start: true, reason: `SCHEDULER_ALLOW_REMOTE_DB=true con base remota (${host ?? 'sin host'})` }
  }

  return {
    start: false,
    reason: `fuera de producción con una base remota (${host ?? 'URL ilegible'}): los jobs correrían contra esa base. Para permitirlo a propósito, SCHEDULER_ALLOW_REMOTE_DB=true`,
  }
}
