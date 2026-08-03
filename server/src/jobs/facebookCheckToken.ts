import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import {
  introspectToken,
  isFacebookConfigured,
  isFacebookAppConfigured,
} from '../lib/facebook.js'

const log = createLogger('facebook_check_token')

/**
 * Vigila el token de la Página de Facebook y avisa antes de que el canal se caiga.
 *
 * Igual que LinkedIn, este job NO renueva: convertir un token de Página en uno
 * nuevo exige un user token vigente y el flujo de OAuth, o sea un humano. Lo que
 * hace es cambiar un fallo silencioso por un aviso con antelación, que es la
 * lección de los dos incidentes de 2026 (Instagram, 12 días caído; LinkedIn, 49).
 *
 * Un token de system user no expira: en ese caso no hay fecha que vigilar y el
 * job solo confirma que el token sigue siendo válido.
 */
export async function runFacebookCheckToken(): Promise<void> {
  if (!isFacebookConfigured()) {
    log.warn('Facebook credentials not configured, skipping token check')
    return
  }

  if (!isFacebookAppConfigured()) {
    // Sin credenciales de la app no hay forma de introspeccionar. No es un fallo
    // del token, así que no dispara alerta: solo queda constancia.
    log.warn('FACEBOOK_APP_ID/FACEBOOK_APP_SECRET missing, cannot check the Facebook Page token')
    return
  }

  const status = await introspectToken()
  const { thresholdDays } = config.facebook.tokenCheck

  if (!status.isValid) {
    throw new Error(
      'Facebook Page token is no longer valid'
      + (status.expiresAt ? ` (expired ${status.expiresAt.toISOString()})` : '')
      + '. Automatic renewal is not possible: generate a new Page access token and '
      + 'update FACEBOOK_PAGE_ACCESS_TOKEN, then delete the social_tokens row for provider=facebook.',
    )
  }

  if (status.daysLeft !== null && status.daysLeft <= thresholdDays) {
    throw new Error(
      `Facebook Page token expires in ${status.daysLeft} day(s) `
      + `(${status.expiresAt?.toISOString()}). Generate a new one before it lapses, `
      + 'or posting stops silently.',
    )
  }

  log.info(
    {
      daysLeft: status.daysLeft,
      expiresAt: status.expiresAt,
      neverExpires: status.expiresAt === null,
      thresholdDays,
      scopes: status.scopes,
      source: status.source,
    },
    'Facebook Page token healthy',
  )
}
