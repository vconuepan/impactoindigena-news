import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import {
  getTokenStatus,
  refreshAccessToken,
  isInstagramConfigured,
  InstagramTokenTooYoungError,
} from '../lib/instagram.js'

const log = createLogger('instagram_refresh_token')

/**
 * Mantiene vivo el token largo de Instagram.
 *
 * Los tokens largos duran 60 días y la Graph API los extiende otros 60 vía
 * /refresh_access_token, siempre que el token esté vigente. Sin este job la
 * renovación es manual, y en julio de 2026 eso costó 12 días de posteo caído
 * sin una sola alerta.
 *
 * Corre a diario y solo actúa cuando quedan pocos días, no en cada corrida: la
 * llamada extiende el plazo desde hoy, así que renovar a diario no gana nada y
 * gasta cuota. Si el token ya expiró, no hay nada que renovar (la API exige uno
 * vigente): lanza para que salga la alerta y alguien genere uno nuevo a mano.
 */
export async function runInstagramRefreshToken(): Promise<void> {
  if (!isInstagramConfigured()) {
    log.warn('Instagram credentials not configured, skipping token refresh')
    return
  }

  const { thresholdDays } = config.instagram.tokenRefresh
  const status = await getTokenStatus()

  // Sin fecha conocida (primera corrida, token puesto a mano en la variable de
  // entorno): renovar ahora para tomar el control del ciclo y quedar con una
  // fecha de expiración registrada.
  if (status.daysLeft === null) {
    log.info({ source: status.source }, 'no known expiry for Instagram token, refreshing to establish one')
    try {
      const refreshed = await refreshAccessToken()
      log.info({ expiresAt: refreshed.expiresAt, daysLeft: refreshed.daysLeft }, 'Instagram token now tracked')
    } catch (err) {
      // Token recién rotado a mano: la API no lo renueva hasta que cumpla 24 h.
      // Salir en silencio; mañana la corrida lo toma. Lanzar acá mandaría una
      // alerta falsa justo después de arreglar el problema.
      if (err instanceof InstagramTokenTooYoungError) {
        log.info({ reason: err.message }, 'Instagram token too young to refresh, will retry tomorrow')
        return
      }
      throw err
    }
    return
  }

  if (status.daysLeft <= 0) {
    // Ya expiró: la API no resucita tokens muertos.
    throw new Error(
      `Instagram token expired ${Math.abs(status.daysLeft)} day(s) ago. ` +
      'Automatic refresh is no longer possible: generate a new long-lived token ' +
      'in the Meta Developer Console and update INSTAGRAM_ACCESS_TOKEN.',
    )
  }

  if (status.daysLeft > thresholdDays) {
    log.info({ daysLeft: status.daysLeft, thresholdDays }, 'Instagram token still fresh, no refresh needed')
    return
  }

  log.info({ daysLeft: status.daysLeft, thresholdDays }, 'Instagram token near expiry, refreshing')
  try {
    const refreshed = await refreshAccessToken()
    log.info({ expiresAt: refreshed.expiresAt, daysLeft: refreshed.daysLeft }, 'Instagram token refreshed')
  } catch (err) {
    if (err instanceof InstagramTokenTooYoungError) {
      log.info({ reason: err.message, daysLeft: status.daysLeft }, 'Instagram token too young to refresh, will retry tomorrow')
      return
    }
    throw err
  }
}
