import { config } from '../config.js'
import { createLogger } from './logger.js'
import { getStoredToken, saveToken, recordTokenError } from './socialToken.js'

const log = createLogger('linkedin')

const PROVIDER = 'linkedin'
const OAUTH_BASE = 'https://www.linkedin.com/oauth/v2'

export function isLinkedInConfigured(): boolean {
  return !!(config.linkedin.accessToken && config.linkedin.authorUrn)
}

/** Las credenciales de la app, necesarias para introspeccionar y reautorizar. */
export function isLinkedInOAuthConfigured(): boolean {
  return !!(config.linkedin.clientId && config.linkedin.clientSecret)
}

/**
 * Error de autenticación de la API de LinkedIn: el token expiró, fue revocado o
 * no sirve. Se distingue del resto porque reintentar no arregla nada — hay que
 * reautorizar. Permite cortar en seco los bucles que recorren varios slides o
 * varios posts, en vez de fallar una vez por cada uno.
 *
 * En junio de 2026 la falta de esta distinción produjo 8 líneas de error por un
 * solo intento de publicar: los 5 slides del carrusel, el post y dos cascadas.
 */
export class LinkedInAuthError extends Error {
  readonly status: number
  readonly serviceErrorCode?: number

  constructor(message: string, status: number, serviceErrorCode?: number) {
    super(message)
    this.name = 'LinkedInAuthError'
    this.status = status
    this.serviceErrorCode = serviceErrorCode
  }
}

/**
 * Convierte una respuesta de error de LinkedIn en excepción.
 *
 * Solo el 401 se trata como problema de token. Un 403 suele ser un permiso que
 * falta (scope), que no se arregla reautorizando con los mismos scopes, así que
 * no debe disparar la alerta de token muerto.
 */
function throwLinkedInError(context: string, status: number, body: string): never {
  if (status === 401) {
    let serviceErrorCode: number | undefined
    try {
      serviceErrorCode = Number(JSON.parse(body)?.serviceErrorCode) || undefined
    } catch {
      // Cuerpo no-JSON: el 401 alcanza para saber que el token no sirve.
    }
    throw new LinkedInAuthError(`${context}: ${body}`, status, serviceErrorCode)
  }
  throw new Error(`${context} ${status}: ${body}`)
}

/**
 * Token vigente: primero el reautorizado en base de datos, si no el de la
 * variable de entorno.
 *
 * La variable de entorno es el arranque (se pone a mano una vez); desde la
 * primera reautorización por el panel manda la base de datos. Si la base no
 * responde, cae a la variable de entorno en lugar de dejar el canal muerto.
 *
 * OJO al rotar a mano: si hay fila en `social_tokens`, el valor de la base le
 * gana a la variable de entorno. Hay que borrarla
 * (`DELETE FROM social_tokens WHERE provider='linkedin'`) o reautorizar por el
 * panel, que es lo que la reemplaza.
 */
export async function getAccessToken(): Promise<string> {
  try {
    const stored = await getStoredToken(PROVIDER)
    if (stored?.accessToken) return stored.accessToken
  } catch (err) {
    log.warn({ err }, 'could not read stored LinkedIn token, using env var')
  }
  return config.linkedin.accessToken
}

export interface TokenIntrospection {
  active: boolean
  /** `active`, `expired` o `revoked` según LinkedIn. Ausente en tokens ajenos. */
  status?: string
  expiresAt: Date | null
  /** Días hasta la expiración. Negativo si ya expiró, null si no se sabe. */
  daysLeft: number | null
  scopes: string[]
  authType?: string
  /** De dónde salió el token que se inspeccionó. */
  source: 'db' | 'env'
}

/**
 * Pregunta a LinkedIn por el estado real del token.
 *
 * Se usa `/introspectToken` en vez de una llamada cualquiera a la API porque
 * autentica con las credenciales de la app, no con los scopes del token: sirve
 * igual aunque el token solo tenga permiso para publicar. Y devuelve la fecha
 * exacta de expiración, que es lo que permite avisar ANTES de que se caiga.
 *
 * Esto es lo que faltaba: `linkedin_update_metrics` nunca llega a la API cuando
 * el autor es un perfil personal (ver `getOrgPostMetrics`), así que hasta ahora
 * ninguna ruta automática ejercía el token y un token muerto podía pasar
 * inadvertido indefinidamente.
 */
export async function introspectToken(): Promise<TokenIntrospection> {
  if (!isLinkedInOAuthConfigured()) {
    throw new Error(
      'LinkedIn app credentials not configured: set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.',
    )
  }

  // Se resuelve por `getAccessToken()` a propósito, en vez de repetir acá la
  // precedencia DB→env: este job existe para vigilar EL token que se usaría para
  // publicar. Duplicar la lógica abre la puerta a que divergan y el chequeo
  // termine dando por sano un token que no es el que se usa.
  const token = await getAccessToken()
  const stored = await getStoredToken(PROVIDER).catch(() => null)
  const source: 'db' | 'env' = stored?.accessToken === token ? 'db' : 'env'

  if (!token) {
    throw new Error('LinkedIn access token not configured, nothing to introspect.')
  }

  const res = await fetch(`${OAUTH_BASE}/introspectToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.linkedin.clientId,
      client_secret: config.linkedin.clientSecret,
      token,
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    // 400 = client_id o token inválidos; 401 = client_secret inválido. Ninguno
    // se arregla reautorizando al miembro, así que no es LinkedInAuthError.
    throw new Error(`LinkedIn token introspection failed ${res.status}: ${text}`)
  }

  const data = JSON.parse(text) as {
    active?: boolean
    status?: string
    expires_at?: number
    scope?: string
    auth_type?: string
  }

  const expiresAt = typeof data.expires_at === 'number' ? new Date(data.expires_at * 1000) : null
  const daysLeft = expiresAt
    ? Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000)
    : null

  return {
    active: data.active === true,
    status: data.status,
    expiresAt,
    daysLeft,
    scopes: data.scope ? data.scope.split(',').map((s) => s.trim()).filter(Boolean) : [],
    authType: data.auth_type,
    source,
  }
}

// ---------------------------------------------------------------------------
// Reautorización — flujo de código de autorización
//
// LinkedIn no permite renovar sin un humano: los refresh tokens programáticos
// existen solo para partners aprobados del Marketing Developer Platform, así que
// no hay equivalente al /refresh_access_token de Instagram. Cada ~60 días
// alguien tiene que autorizar de nuevo. Lo que sí se puede es reducir eso a un
// clic, en vez de un trámite manual con copiado de tokens a App Service.
// ---------------------------------------------------------------------------

/** URL a la que se manda al admin para que autorice. El `state` va firmado. */
export function buildAuthorizationUrl(state: string): string {
  if (!isLinkedInOAuthConfigured()) {
    throw new Error(
      'LinkedIn app credentials not configured: set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.',
    )
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.linkedin.clientId,
    redirect_uri: config.linkedin.redirectUri,
    state,
    scope: config.linkedin.scopes.join(' '),
  })
  return `${OAUTH_BASE}/authorization?${params}`
}

export interface ExchangedToken {
  expiresAt: Date
  daysLeft: number
  /** LinkedIn solo lo entrega a partners MDP aprobados; normalmente ausente. */
  hasRefreshToken: boolean
}

/**
 * Canjea el código del callback por un token y lo guarda en `social_tokens`.
 *
 * El token nuevo queda en la base, no en la variable de entorno: el proceso no
 * puede reescribir su propia configuración en App Service, y era justamente ese
 * paso manual el que dejó el canal caído.
 */
export async function exchangeCodeForToken(code: string): Promise<ExchangedToken> {
  if (!isLinkedInOAuthConfigured()) {
    throw new Error(
      'LinkedIn app credentials not configured: set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.',
    )
  }

  const res = await fetch(`${OAUTH_BASE}/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.linkedin.clientId,
      client_secret: config.linkedin.clientSecret,
      redirect_uri: config.linkedin.redirectUri,
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    // Sin el cuerpo: puede traer el código de autorización usado.
    await recordTokenError(PROVIDER, `authorization_code exchange failed (${res.status})`).catch(() => {})
    throw new Error(`LinkedIn token exchange failed ${res.status}`)
  }

  const data = JSON.parse(text) as {
    access_token?: string
    expires_in?: number
    refresh_token?: string
  }

  if (!data.access_token) {
    throw new Error('LinkedIn token exchange returned no access_token')
  }

  const lifetimeMs = typeof data.expires_in === 'number'
    ? data.expires_in * 1000
    : config.linkedin.tokenCheck.lifetimeDays * 86_400_000
  const expiresAt = new Date(Date.now() + lifetimeMs)

  await saveToken(PROVIDER, data.access_token, expiresAt)

  const daysLeft = Math.floor(lifetimeMs / 86_400_000)
  log.info({ expiresAt, daysLeft }, 'LinkedIn token reauthorized and stored')

  return { expiresAt, daysLeft, hasRefreshToken: !!data.refresh_token }
}

// ---------------------------------------------------------------------------
// Image upload — uploads an external image to LinkedIn so it appears reliably
// in posts without depending on LinkedIn's OG scraping.
// ---------------------------------------------------------------------------

async function uploadImageAsset(imageUrl: string): Promise<string | null> {
  const accessToken = await getAccessToken()
  try {
    // 1. Download the image from the source URL
    const imgRes = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VocesIndigenas/1.0)' },
    })
    if (!imgRes.ok) {
      log.warn({ imageUrl, status: imgRes.status }, 'could not download image for LinkedIn upload')
      return null
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'

    // 2. Register the upload with LinkedIn
    const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: config.linkedin.authorUrn,
          serviceRelationships: [
            { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
          ],
        },
      }),
    })
    if (!regRes.ok) {
      const errText = await regRes.text()
      log.warn({ status: regRes.status, body: errText }, 'LinkedIn registerUpload failed')
      // Un 401 no es un problema de esta imagen: es el token. Cortar en seco, o
      // se repite el mismo 401 en cada slide restante y otra vez al crear el
      // post, como pasó el 11-jun-2026 (8 líneas de error por un intento).
      // El resto de los códigos sí puede ser puntual: devolver null y que el
      // post salga en modo ARTICLE es mejor que no publicar nada.
      if (regRes.status === 401) {
        throwLinkedInError('LinkedIn registerUpload failed', regRes.status, errText)
      }
      return null
    }
    const regData = (await regRes.json()) as {
      value: {
        uploadMechanism: {
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: string }
        }
        asset: string
      }
    }
    const uploadUrl =
      regData.value.uploadMechanism[
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
      ].uploadUrl
    const assetUrn = regData.value.asset

    // 3. Upload the image binary
    const upRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
      },
      body: buffer,
    })
    // LinkedIn returns 201 Created on success (not 200)
    if (!upRes.ok && upRes.status !== 201) {
      log.warn({ status: upRes.status }, 'LinkedIn image upload PUT failed')
      if (upRes.status === 401) {
        throwLinkedInError('LinkedIn image upload failed', upRes.status, '')
      }
      return null
    }

    log.info({ assetUrn }, 'image uploaded to LinkedIn')
    return assetUrn
  } catch (err) {
    // El fallback a ARTICLE es para fallos de esta imagen. Un token muerto no se
    // arregla publicando sin imágenes, así que sube y detiene la publicación.
    if (err instanceof LinkedInAuthError) throw err
    log.warn({ err }, 'LinkedIn image upload error — will fall back to ARTICLE mode')
    return null
  }
}

// ---------------------------------------------------------------------------
// UGC post creation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Post metrics — organization pages only
// ---------------------------------------------------------------------------

export interface PostMetrics {
  likeCount: number
  commentCount: number
  impressionCount: number
}

/**
 * Fetch engagement metrics for a published LinkedIn post.
 * Only works when authorUrn is an organization (urn:li:organization:...).
 * For personal profiles LinkedIn does not expose post stats via the API.
 */
export async function getOrgPostMetrics(
  postUrn: string,
  authorUrn: string,
): Promise<PostMetrics | null> {
  // Only attempt for organization URNs
  if (!authorUrn.includes('organization')) {
    log.debug({ authorUrn }, 'LinkedIn metrics only available for organization accounts, skipping')
    return null
  }

  try {
    const encodedOrg = encodeURIComponent(authorUrn)
    // Use shares[0]= for urn:li:share:... and ugcPosts[0]= for urn:li:ugcPost:...
    const postParam = postUrn.startsWith('urn:li:share:')
      ? `shares[0]=${encodeURIComponent(postUrn)}`
      : `ugcPosts[0]=${encodeURIComponent(postUrn)}`
    const url =
      `https://api.linkedin.com/v2/organizationalEntityShareStatistics` +
      `?q=organizationalEntity&organizationalEntity=${encodedOrg}&${postParam}`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    })

    if (!res.ok) {
      const text = await res.text()
      log.warn({ status: res.status, body: text, postUrn }, 'LinkedIn metrics fetch failed')
      // Igual que arriba: un token muerto no es un problema de este post. Sube
      // para que el bucle de métricas corte y el job falle a la vista, en vez de
      // acumular un warn por post y terminar "OK" (el patrón que tuvo Instagram
      // 12 días caído sin una sola alerta).
      if (res.status === 401) {
        throwLinkedInError('LinkedIn metrics fetch failed', res.status, text)
      }
      return null
    }

    const data = (await res.json()) as {
      elements?: Array<{
        totalShareStatistics?: {
          likeCount?: number
          commentCount?: number
          impressionCount?: number
        }
      }>
    }

    const stats = data.elements?.[0]?.totalShareStatistics
    if (!stats) return null

    return {
      likeCount: stats.likeCount ?? 0,
      commentCount: stats.commentCount ?? 0,
      impressionCount: stats.impressionCount ?? 0,
    }
  } catch (err) {
    if (err instanceof LinkedInAuthError) throw err
    log.warn({ err, postUrn }, 'LinkedIn metrics fetch error')
    return null
  }
}

export async function createUgcPost(
  text: string,
  articleUrl: string,
  articleTitle: string,
  articleDescription: string,
  imageUrls?: string | string[] | null,
): Promise<{ id: string; permalink: string }> {
  // Normalize to an array. Upload each image; LinkedIn renders multiple
  // images in one UGC post as a swipeable multi-image gallery (up to 9).
  const urls = (Array.isArray(imageUrls) ? imageUrls : imageUrls ? [imageUrls] : []).slice(0, 9)
  const assetUrns: string[] = []
  for (const url of urls) {
    const urn = await uploadImageAsset(url)
    if (urn) assetUrns.push(urn)
  }

  let shareContent: object

  if (assetUrns.length > 0) {
    // IMAGE mode: images uploaded directly — always show, no OG scrape needed.
    // Append article URL to post text so readers can click through.
    const finalText = text.includes(articleUrl)
      ? text
      : `${text}\n\n${articleUrl}`

    shareContent = {
      shareCommentary: { text: finalText },
      shareMediaCategory: 'IMAGE',
      media: assetUrns.map((urn, i) => ({
        status: 'READY',
        media: urn,
        title: { text: articleTitle },
        // First image carries the description; LinkedIn ignores it on the rest.
        ...(i === 0 ? { description: { text: articleDescription } } : {}),
      })),
    }
  } else {
    // ARTICLE mode: fallback — LinkedIn scrapes originalUrl for thumbnail.
    shareContent = {
      shareCommentary: { text },
      shareMediaCategory: 'ARTICLE',
      media: [
        {
          status: 'READY',
          description: { text: articleDescription },
          originalUrl: articleUrl,
          title: { text: articleTitle },
        },
      ],
    }
  }

  const body = {
    author: config.linkedin.authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': shareContent,
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  }

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorText = await res.text()
    log.error({ status: res.status, body: errorText }, 'LinkedIn API error')
    throwLinkedInError('LinkedIn API error', res.status, errorText)
  }

  const data = (await res.json()) as { id: string }
  const permalink = `https://www.linkedin.com/feed/update/${data.id}/`
  return { id: data.id, permalink }
}
