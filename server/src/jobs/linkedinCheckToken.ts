import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import {
  introspectToken,
  isLinkedInConfigured,
  isLinkedInOAuthConfigured,
} from '../lib/linkedin.js'

const log = createLogger('linkedin_check_token')

/**
 * Vigila el token de LinkedIn y avisa antes de que se caiga el canal.
 *
 * Por qué existe: hasta ahora NINGUNA ruta automática ejercía el token de
 * LinkedIn. `linkedin_update_metrics` corre cuatro veces al día pero es un
 * no-op cuando el autor es un perfil personal — `getOrgPostMetrics` sale
 * temprano sin llamar a la API. Resultado: el token expiró en algún momento
 * antes del 11-jun-2026, un intento manual de publicar murió con
 * EXPIRED_ACCESS_TOKEN, y el canal quedó caído sin que nada lo notara. Peor
 * que el caso de Instagram, donde al menos el job llamaba a la API.
 *
 * A diferencia de Instagram, este job NO renueva nada: los refresh tokens
 * programáticos de LinkedIn son solo para partners aprobados del Marketing
 * Developer Platform, así que la única salida es que un humano reautorice.
 * El job convierte un fallo silencioso en un aviso con antelación.
 *
 * Falla a propósito (lanza) para que el scheduler mande la alerta: cuando el
 * token ya no sirve, y también en los últimos días de vida. Insiste a diario
 * dentro de esa ventana porque la acción es humana y bloqueante; reautorizar
 * por el panel lo silencia.
 */
export async function runLinkedInCheckToken(): Promise<void> {
  if (!isLinkedInConfigured()) {
    log.warn('LinkedIn credentials not configured, skipping token check')
    return
  }

  if (!isLinkedInOAuthConfigured()) {
    // Sin las credenciales de la app no hay forma de introspeccionar. No es un
    // fallo del token, así que no dispara alerta: solo queda constancia.
    log.warn(
      'LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET missing, cannot check the LinkedIn token',
    )
    return
  }

  const status = await introspectToken()
  const { thresholdDays } = config.linkedin.tokenCheck

  if (!status.active) {
    throw new Error(
      `LinkedIn token is ${status.status ?? 'inactive'}`
      + (status.expiresAt ? ` (expired ${status.expiresAt.toISOString()})` : '')
      + `. Automatic renewal is not possible for this app: reauthorize from `
      + `Panel → LinkedIn → Reautorizar.`,
    )
  }

  if (status.daysLeft !== null && status.daysLeft <= thresholdDays) {
    throw new Error(
      `LinkedIn token expires in ${status.daysLeft} day(s) `
      + `(${status.expiresAt?.toISOString()}). Reauthorize from `
      + `Panel → LinkedIn → Reautorizar before it lapses, or posting stops silently.`,
    )
  }

  log.info(
    {
      daysLeft: status.daysLeft,
      expiresAt: status.expiresAt,
      thresholdDays,
      scopes: status.scopes,
      source: status.source,
    },
    'LinkedIn token healthy',
  )
}
