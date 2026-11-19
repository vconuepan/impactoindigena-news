import { config } from '../config.js'
import { createLogger } from './logger.js'
import { getStoredToken, saveToken, recordTokenError } from './socialToken.js'
import { downloadExternalImage } from './imageStorage.js'
import { carruselEnPdf } from './storyCarouselRender.js'

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
    // 1. Download the image from the source URL, through the SSRF guard. `fetch`
    // seguia las redirecciones solo y no validaba el destino, y esta URL puede ser
    // la imagen de una nota que viene de la pagina de un tercero.
    const dl = await downloadExternalImage(imageUrl)
    if (!dl) {
      log.warn({ imageUrl }, 'could not download image for LinkedIn upload (blocked, not an image, or failed)')
      return null
    }
    const buffer = dl.buffer
    const contentType = dl.contentType

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
      body: new Uint8Array(buffer),
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
// Carrusel como documento (PDF)
//
// Por qué: una galería de fotos en LinkedIn se muestra como grilla — una foto
// grande a la izquierda y tres chicas con «+N» — y LinkedIn RECORTA cada mosaico
// a su forma. Las láminas son 1080×1350 (4:5) y la grande sale más angosta: se
// pierde el borde izquierdo de la portada, que es donde va el logo, y el comienzo
// de cada línea del titular. Lo vio el director el 19-nov-2026.
//
// Un documento PDF es el carrusel nativo de LinkedIn: se desliza lámina por
// lámina, entera, sin recorte. Si cualquier paso falla (permiso, versión de la
// API vencida, procesamiento), se devuelve null y el post sale como galería,
// que es lo que había antes. Solo el 401 corta, como en el resto del archivo.
// ---------------------------------------------------------------------------

function restHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': config.linkedin.apiVersion,
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

/**
 * El texto del post en formato «little», que exige la API REST de posts: los
 * caracteres reservados van con barra invertida o LinkedIn corta el texto desde
 * ahí (un paréntesis sin escapar se come el resto del post). Un `#Palabra` al
 * comienzo de una palabra se deja tal cual: es un hashtag.
 */
export function aLittleText(texto: string): string {
  return texto.replace(/[\\|{}@[\]()<>#*_~]/g, (c, i: number, s: string) => {
    if (c === '#') {
      const antes = i === 0 ? '' : s[i - 1]
      const despues = s[i + 1] ?? ''
      if ((antes === '' || /\s/.test(antes)) && /[\p{L}\p{N}]/u.test(despues)) return c
    }
    return `\\${c}`
  })
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function subirDocumento(pdf: Buffer, accessToken: string): Promise<string | null> {
  const initRes = await fetch('https://api.linkedin.com/rest/documents?action=initializeUpload', {
    method: 'POST',
    headers: restHeaders(accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner: config.linkedin.authorUrn } }),
  })
  if (!initRes.ok) {
    const errText = await initRes.text()
    log.warn({ status: initRes.status, body: errText }, 'LinkedIn document initializeUpload failed')
    if (initRes.status === 401) throwLinkedInError('LinkedIn document initializeUpload failed', 401, errText)
    return null
  }
  const { value } = (await initRes.json()) as { value: { uploadUrl: string; document: string } }

  const upRes = await fetch(value.uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/pdf' },
    body: new Uint8Array(pdf),
  })
  if (!upRes.ok) {
    log.warn({ status: upRes.status }, 'LinkedIn document upload PUT failed')
    if (upRes.status === 401) throwLinkedInError('LinkedIn document upload failed', 401, '')
    return null
  }

  // El post se crea cuando el documento está procesado. Si no llega a tiempo se
  // intenta igual: LinkedIn suele aceptarlo en PROCESSING y lo termina solo.
  const { waitMs, pollMs } = config.linkedin.document
  const hasta = Date.now() + waitMs
  for (;;) {
    const res = await fetch(
      `https://api.linkedin.com/rest/documents/${encodeURIComponent(value.document)}`,
      { headers: restHeaders(accessToken) },
    )
    if (res.ok) {
      const { status } = (await res.json()) as { status?: string }
      if (status === 'AVAILABLE') break
      if (status === 'PROCESSING_FAILED') {
        log.warn({ document: value.document }, 'LinkedIn could not process the carousel PDF')
        return null
      }
    } else if (res.status === 401) {
      throwLinkedInError('LinkedIn document status failed', 401, await res.text())
    }
    if (Date.now() + pollMs > hasta) {
      log.warn({ document: value.document }, 'LinkedIn document still processing — posting anyway')
      break
    }
    await esperar(pollMs)
  }

  return value.document
}

/**
 * Publica el carrusel como documento. Devuelve null ante cualquier fallo que no
 * sea de token, para que `createUgcPost` siga con la galería de fotos.
 */
async function publicarComoDocumento(
  text: string,
  articleUrl: string,
  articleTitle: string,
  imageUrls: string[],
): Promise<{ id: string; permalink: string } | null> {
  try {
    // Las láminas primero: si alguna no baja, no se deja un documento huérfano.
    const laminas: Buffer[] = []
    for (const url of imageUrls) {
      const dl = await downloadExternalImage(url)
      if (!dl) {
        log.warn({ url }, 'carousel slide did not download — LinkedIn post goes as a gallery')
        return null
      }
      laminas.push(dl.buffer)
    }
    const pdf = await carruselEnPdf(laminas)

    const accessToken = await getAccessToken()
    const documentUrn = await subirDocumento(pdf, accessToken)
    if (!documentUrn) return null

    const commentary = text.includes(articleUrl) ? text : `${text}\n\n${articleUrl}`
    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: restHeaders(accessToken),
      body: JSON.stringify({
        author: config.linkedin.authorUrn,
        commentary: aLittleText(commentary),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        // El título es la cabecera del visor del documento.
        content: { media: { title: articleTitle.slice(0, 200), id: documentUrn } },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      log.warn({ status: res.status, body: errText }, 'LinkedIn document post failed — falling back to gallery')
      if (res.status === 401) throwLinkedInError('LinkedIn document post failed', 401, errText)
      return null
    }
    const id = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id')
    if (!id) {
      // Creado pero sin id: NO se reintenta como galería, o saldría dos veces.
      log.error('LinkedIn document post created without an id header')
      return { id: '', permalink: '' }
    }
    log.info({ id, laminas: laminas.length }, 'LinkedIn carousel published as a document')
    return { id, permalink: `https://www.linkedin.com/feed/update/${id}/` }
  } catch (err) {
    if (err instanceof LinkedInAuthError) throw err
    log.warn({ err }, 'LinkedIn document carousel failed — falling back to gallery')
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
  const todas = Array.isArray(imageUrls) ? imageUrls : imageUrls ? [imageUrls] : []

  // Un carrusel (más de una lámina) va primero como documento: sin recorte.
  if (todas.length > 1) {
    const doc = await publicarComoDocumento(text, articleUrl, articleTitle, todas)
    if (doc) return doc
  }

  const urls = todas.slice(0, 9)
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
