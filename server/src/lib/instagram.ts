import { config } from '../config.js'
import { createLogger } from './logger.js'
import { withRetry } from './retry.js'
import { getStoredToken, saveToken, recordTokenError } from './socialToken.js'

const log = createLogger('instagram')

const PROVIDER = 'instagram'
const GRAPH_BASE = 'https://graph.instagram.com'
const GRAPH_VERSION = 'v21.0'

function isConfigured(): boolean {
  return Boolean(
    config.instagram.accessToken &&
    config.instagram.userId
  )
}

/**
 * Error de autenticación de la Graph API (token expirado, revocado o inválido).
 * Se distingue del resto porque reintentar no sirve de nada: hay que renovar el
 * token. Permite cortar en seco los bucles que recorren muchos posts en vez de
 * fallar una vez por cada uno.
 */
export class InstagramAuthError extends Error {
  readonly code: number

  constructor(message: string, code: number) {
    super(message)
    this.name = 'InstagramAuthError'
    this.code = code
  }
}

/** Códigos de OAuth de Meta que significan "el token ya no sirve". */
const AUTH_ERROR_CODES = new Set([190, 102, 463, 467])

/**
 * La API se niega a renovar un token con menos de 24 h de vida. Llega como
 * código 190, igual que un token muerto, pero significa lo contrario: el token
 * está perfecto, solo es demasiado nuevo. Distinguirlo evita una alerta falsa
 * la primera noche después de rotar el token a mano.
 */
export class InstagramTokenTooYoungError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InstagramTokenTooYoungError'
  }
}

function isTooYoungMessage(message: string): boolean {
  return /24 hours old/i.test(message)
}

/**
 * Convierte una respuesta de error de la Graph API en una excepción.
 * Lanza `InstagramAuthError` cuando el problema es el token, para que quien
 * llama pueda distinguirlo de un fallo puntual de una imagen o de la red.
 */
function throwGraphError(context: string, payload: unknown): never {
  const err = (payload as any)?.error ?? payload
  const code = Number((err as any)?.code)
  const detail = JSON.stringify(err)

  if (AUTH_ERROR_CODES.has(code)) {
    throw new InstagramAuthError(`${context}: ${detail}`, code)
  }
  throw new Error(`${context}: ${detail}`)
}

/**
 * Token vigente: primero el renovado en DB, si no el de la variable de entorno.
 *
 * La variable de entorno es el arranque (se pone a mano una vez); a partir de la
 * primera renovación automática la DB manda. Si la DB no responde, cae de vuelta
 * a la variable de entorno en lugar de dejar el canal muerto.
 */
export async function getAccessToken(): Promise<string> {
  try {
    const stored = await getStoredToken(PROVIDER)
    if (stored?.accessToken) return stored.accessToken
  } catch (err) {
    log.warn({ err }, 'could not read stored Instagram token, using env var')
  }
  return config.instagram.accessToken
}

export interface TokenStatus {
  /** Fecha de expiración conocida, o null si nunca se ha renovado por acá. */
  expiresAt: Date | null
  /** Días que faltan para expirar. null cuando no se conoce la fecha. */
  daysLeft: number | null
  source: 'db' | 'env'
}

/** Estado del token para el job de renovación y el panel de administración. */
export async function getTokenStatus(): Promise<TokenStatus> {
  const stored = await getStoredToken(PROVIDER)
  if (!stored) return { expiresAt: null, daysLeft: null, source: 'env' }

  const daysLeft = stored.expiresAt
    ? Math.floor((stored.expiresAt.getTime() - Date.now()) / 86_400_000)
    : null

  return { expiresAt: stored.expiresAt, daysLeft, source: 'db' }
}

/**
 * Renueva el token largo por otros 60 días y lo guarda.
 *
 * La API exige un token vigente con al menos 24 h de vida: un token ya expirado
 * no se puede resucitar, hay que generar uno nuevo a mano en el Meta Developer
 * Console. Por eso el job llama a esto con holgura y no al filo del vencimiento.
 */
export async function refreshAccessToken(): Promise<TokenStatus> {
  const current = await getAccessToken()
  if (!current) {
    throw new Error('Instagram access token not configured, nothing to refresh.')
  }

  const params = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: current,
  })

  const res = await fetch(`${GRAPH_BASE}/refresh_access_token?${params}`)
  const data = await res.json() as { access_token?: string; expires_in?: number; error?: unknown }

  if (!res.ok || data.error || !data.access_token) {
    const detail = JSON.stringify(data.error ?? data)
    const message = String((data.error as any)?.message ?? '')

    if (isTooYoungMessage(message)) {
      // No es un fallo: el token recién se creó. Se reintenta mañana.
      throw new InstagramTokenTooYoungError(message)
    }

    await recordTokenError(PROVIDER, detail).catch(() => {})
    throwGraphError('Failed to refresh Instagram token', data)
  }

  const lifetimeMs = typeof data.expires_in === 'number'
    ? data.expires_in * 1000
    : config.instagram.tokenRefresh.lifetimeDays * 86_400_000
  const expiresAt = new Date(Date.now() + lifetimeMs)

  await saveToken(PROVIDER, data.access_token, expiresAt)

  const daysLeft = Math.floor(lifetimeMs / 86_400_000)
  log.info({ expiresAt, daysLeft }, 'Instagram token refreshed')

  return { expiresAt, daysLeft, source: 'db' }
}

export interface CreatePostResult {
  id: string
  permalink?: string
}

/**
 * Publica un carrusel de imágenes en Instagram.
 * Paso 1: Crear contenedor para cada imagen
 * Paso 2: Crear contenedor del carrusel
 * Paso 3: Publicar el carrusel
 */
export async function createCarouselPost(
  imageUrls: string[],
  caption: string,
): Promise<CreatePostResult> {
  if (!isConfigured()) {
    throw new Error('Instagram credentials not configured.')
  }

  return withRetry(
    async () => {
      const { userId } = config.instagram
      const accessToken = await getAccessToken()
      const baseUrl = `${GRAPH_BASE}/${GRAPH_VERSION}`

      log.info({ captionLength: caption.length, slideCount: imageUrls.length }, 'creating Instagram carousel')

      // Paso 1: Crear contenedor para cada imagen
      const childIds: string[] = []

      for (const imageUrl of imageUrls) {
        const params = new URLSearchParams({
          image_url: imageUrl,
          is_carousel_item: 'true',
          media_type: 'IMAGE',
          access_token: accessToken,
        })
        const res = await fetch(`${baseUrl}/${userId}/media?${params}`, {
          method: 'POST',
        })

        const data = await res.json() as any

        if (!res.ok || data.error) {
          throwGraphError('Failed to create carousel item', data)
        }

        childIds.push(data.id)
        log.info({ containerId: data.id }, 'carousel item created')

        // Esperar 3 segundos entre cada imagen
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }

      // Paso 2: Crear contenedor del carrusel
      const carouselParams = new URLSearchParams({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption,
        access_token: accessToken,
      })

      const carouselRes = await fetch(`${baseUrl}/${userId}/media?${carouselParams}`, {
        method: 'POST',
      })

      const carouselData = await carouselRes.json() as any

      if (!carouselRes.ok || carouselData.error) {
        throwGraphError('Failed to create carousel container', carouselData)
      }

      const carouselId = carouselData.id
      log.info({ carouselId }, 'carousel container created')

      // Esperar 3 segundos antes de publicar
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Paso 3: Publicar el carrusel
      const publishParams = new URLSearchParams({
        creation_id: carouselId,
        access_token: accessToken,
      })

      const publishRes = await fetch(`${baseUrl}/${userId}/media_publish?${publishParams}`, {
        method: 'POST',
      })

      const publishData = await publishRes.json() as any

      if (!publishRes.ok || publishData.error) {
        throwGraphError('Failed to publish carousel', publishData)
      }

      const postId = publishData.id
      log.info({ postId }, 'Instagram carousel published')

      return { id: postId, permalink: `https://www.instagram.com/p/${postId}/` }
    },
    { retries: 2, baseDelayMs: 3000 },
  )
}

export interface PostMetrics {
  likeCount: number
  commentCount: number
}

/**
 * Fetch engagement metrics for a published Instagram post.
 * Uses the basic media fields — no special insights permission required.
 */
export async function getPostMetrics(instagramPostId: string): Promise<PostMetrics> {
  if (!isConfigured()) {
    throw new Error('Instagram credentials not configured.')
  }

  return withRetry(
    async () => {
      const accessToken = await getAccessToken()
      const params = new URLSearchParams({
        fields: 'like_count,comments_count',
        access_token: accessToken,
      })
      const res = await fetch(
        `${GRAPH_BASE}/${GRAPH_VERSION}/${instagramPostId}?${params}`,
      )
      const data = await res.json() as any

      if (!res.ok || data.error) {
        throwGraphError('Instagram metrics error', data)
      }

      return {
        likeCount: data.like_count ?? 0,
        commentCount: data.comments_count ?? 0,
      }
    },
    { retries: 2, baseDelayMs: 2000 },
  )
}

/**
 * Publica una imagen sencilla en Instagram (sin carrusel).
 * No requiere R2 — la imagen debe ser una URL pública permanente.
 */
export async function createSingleImagePost(
  imageUrl: string,
  caption: string,
): Promise<CreatePostResult> {
  if (!isConfigured()) {
    throw new Error('Instagram credentials not configured.')
  }

  return withRetry(
    async () => {
      const { userId } = config.instagram
      const accessToken = await getAccessToken()
      const baseUrl = `${GRAPH_BASE}/${GRAPH_VERSION}`

      log.info({ captionLength: caption.length, imageUrl }, 'creating Instagram single-image post')

      // Paso 1: Crear contenedor de la imagen
      const params = new URLSearchParams({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      })
      const res = await fetch(`${baseUrl}/${userId}/media?${params}`, { method: 'POST' })
      const data = await res.json() as { id?: string; error?: unknown }

      if (!res.ok || data.error) {
        throwGraphError('Failed to create media container', data)
      }

      const containerId = data.id!
      log.info({ containerId }, 'media container created')

      // Esperar 3 segundos antes de publicar
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Paso 2: Publicar
      const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      })
      const publishRes = await fetch(`${baseUrl}/${userId}/media_publish?${publishParams}`, { method: 'POST' })
      const publishData = await publishRes.json() as { id?: string; error?: unknown }

      if (!publishRes.ok || publishData.error) {
        throwGraphError('Failed to publish post', publishData)
      }

      const postId = publishData.id!
      log.info({ postId }, 'Instagram single-image post published')

      return { id: postId, permalink: `https://www.instagram.com/p/${postId}/` }
    },
    { retries: 2, baseDelayMs: 3000 },
  )
}

export { isConfigured as isInstagramConfigured }
