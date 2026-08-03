import { config } from '../config.js'
import { createLogger } from './logger.js'
import { withRetry } from './retry.js'
import { getStoredToken, saveToken, recordTokenError } from './socialToken.js'

const log = createLogger('facebook')

const PROVIDER = 'facebook'
const GRAPH_BASE = 'https://graph.facebook.com'
const GRAPH_VERSION = 'v21.0'

/**
 * Publicación en una PÁGINA de Facebook vía Graph API.
 *
 * Ojo con la confusión fácil: Instagram vive en `graph.instagram.com` con un
 * token de usuario de Instagram, y esto vive en `graph.facebook.com` con un token
 * de Página. Son credenciales distintas y no se pueden intercambiar, aunque la
 * app de Meta sea la misma.
 *
 * Grupos no: Meta cerró la Groups API en abril de 2024. Solo Páginas.
 */

export function isFacebookConfigured(): boolean {
  return Boolean(config.facebook.accessToken || config.facebook.pageId)
    && Boolean(config.facebook.pageId)
    && Boolean(config.facebook.accessToken)
}

/** La introspección necesita las credenciales de la app, no solo el token. */
export function isFacebookAppConfigured(): boolean {
  return Boolean(config.facebook.appId && config.facebook.appSecret)
}

/**
 * El token de Página ya no sirve (expirado, revocado, o la Página perdió el
 * permiso). Se distingue de un fallo puntual porque reintentar no arregla nada:
 * hay que reautorizar. Mismos códigos de OAuth que Instagram, porque es el mismo
 * proveedor.
 */
export class FacebookAuthError extends Error {
  readonly code: number

  constructor(message: string, code: number) {
    super(message)
    this.name = 'FacebookAuthError'
    this.code = code
  }
}

const AUTH_ERROR_CODES = new Set([190, 102, 463, 467, 200])

function throwGraphError(context: string, payload: unknown): never {
  const err = (payload as any)?.error ?? payload
  const code = Number((err as any)?.code)
  const detail = JSON.stringify(err)

  if (AUTH_ERROR_CODES.has(code)) {
    throw new FacebookAuthError(`${context}: ${detail}`, code)
  }
  throw new Error(`${context}: ${detail}`)
}

/**
 * Token vigente: primero el guardado en DB, si no el de la configuración.
 * Misma precedencia que Instagram y LinkedIn. Si la DB no responde, cae a la
 * variable en vez de dejar el canal muerto.
 */
export async function getAccessToken(): Promise<string> {
  try {
    const stored = await getStoredToken(PROVIDER)
    if (stored?.accessToken) return stored.accessToken
  } catch (err) {
    log.warn({ err }, 'could not read stored Facebook token, using env var')
  }
  return config.facebook.accessToken
}

export interface TokenIntrospection {
  isValid: boolean
  /** null = el token no expira (típico de un system user token). */
  expiresAt: Date | null
  daysLeft: number | null
  scopes: string[]
  source: 'db' | 'env'
}

/**
 * Introspecciona el token vía `/debug_token`.
 *
 * Se usa este endpoint en vez de cualquier llamada normal a la API porque se
 * autentica con `app_id|app_secret` y devuelve la fecha exacta de expiración,
 * así que funciona sobre un token que solo tiene permisos de publicación y no
 * hace falta gastar una publicación para saber si sirve.
 */
export async function introspectToken(): Promise<TokenIntrospection> {
  if (!isFacebookAppConfigured()) {
    throw new Error('Facebook app credentials not configured, cannot introspect.')
  }

  // Se resuelve por getAccessToken() a propósito, en vez de repetir la
  // precedencia acá: si divergen, se inspecciona un token distinto del que
  // publica y el chequeo deja de significar nada.
  const token = await getAccessToken()
  const stored = await getStoredToken(PROVIDER).catch(() => null)
  const source: 'db' | 'env' = stored?.accessToken ? 'db' : 'env'

  if (!token) {
    throw new Error('Facebook access token not configured, nothing to introspect.')
  }

  const params = new URLSearchParams({
    input_token: token,
    access_token: `${config.facebook.appId}|${config.facebook.appSecret}`,
  })

  const res = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/debug_token?${params}`)
  const body = await res.json() as {
    data?: { is_valid?: boolean; expires_at?: number; scopes?: string[]; error?: { message?: string } }
    error?: unknown
  }

  if (!res.ok || body.error || !body.data) {
    // Un fallo de la introspección no es un fallo del token: puede ser la app
    // mal configurada. No se marca como FacebookAuthError.
    throw new Error(`Facebook token introspection failed ${res.status}: ${JSON.stringify(body.error ?? body)}`)
  }

  const data = body.data
  // expires_at = 0 significa "no expira" en la Graph API.
  const expiresAt = data.expires_at && data.expires_at > 0
    ? new Date(data.expires_at * 1000)
    : null
  const daysLeft = expiresAt
    ? Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000)
    : null

  return {
    isValid: Boolean(data.is_valid),
    expiresAt,
    daysLeft,
    scopes: data.scopes ?? [],
    source,
  }
}

/** Guarda un token de Página puesto a mano o traído por una reautorización. */
export async function storePageToken(token: string, expiresAt: Date | null): Promise<void> {
  await saveToken(PROVIDER, token, expiresAt)
}

export interface CreatePostResult {
  id: string
  permalink?: string
}

/**
 * Publica en el muro de la Página: texto + enlace.
 *
 * Facebook arma la tarjeta con la og:image del artículo, así que no se sube
 * ninguna imagen. Publicar la imagen como foto daría una foto que al hacer clic
 * no lleva al artículo, que es justo lo contrario de lo que sirve a un medio.
 */
export async function createPagePost(message: string, link: string): Promise<CreatePostResult> {
  if (!isFacebookConfigured()) {
    throw new Error('Facebook credentials not configured.')
  }

  return withRetry(
    async () => {
      const accessToken = await getAccessToken()
      const { pageId } = config.facebook

      const params = new URLSearchParams({ message, link, access_token: accessToken })
      const res = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${pageId}/feed?${params}`, {
        method: 'POST',
      })
      const data = await res.json() as { id?: string; error?: unknown }

      if (!res.ok || data.error || !data.id) {
        throwGraphError('Failed to create Facebook Page post', data)
      }

      const postId = data.id
      log.info({ postId, messageLength: message.length }, 'Facebook Page post published')

      // El id viene como "{pageId}_{postId}"; el permalink se arma con él.
      return { id: postId, permalink: `https://www.facebook.com/${postId.replace('_', '/posts/')}` }
    },
    { retries: 2, baseDelayMs: 2000 },
  )
}

export interface PostMetrics {
  likeCount: number
  commentCount: number
  shareCount: number
}

/** Métricas públicas del post. No requiere permisos de Insights. */
export async function getPostMetrics(facebookPostId: string): Promise<PostMetrics> {
  if (!isFacebookConfigured()) {
    throw new Error('Facebook credentials not configured.')
  }

  return withRetry(
    async () => {
      const accessToken = await getAccessToken()
      const params = new URLSearchParams({
        fields: 'likes.summary(true),comments.summary(true),shares',
        access_token: accessToken,
      })
      const res = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${facebookPostId}?${params}`)
      const data = await res.json() as {
        likes?: { summary?: { total_count?: number } }
        comments?: { summary?: { total_count?: number } }
        shares?: { count?: number }
        error?: unknown
      }

      if (!res.ok || data.error) {
        throwGraphError('Facebook metrics error', data)
      }

      return {
        likeCount: data.likes?.summary?.total_count ?? 0,
        commentCount: data.comments?.summary?.total_count ?? 0,
        // `shares` viene ausente cuando nadie compartió, no en cero.
        shareCount: data.shares?.count ?? 0,
      }
    },
    { retries: 2, baseDelayMs: 2000 },
  )
}

/** Deja rastro del motivo de un fallo de token, para el panel. */
export async function recordFacebookTokenError(error: string): Promise<void> {
  await recordTokenError(PROVIDER, error)
}
