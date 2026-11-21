/**
 * Reenvío de Cloudflare Pages a la API de Voces Indígenas.
 *
 * Reemplaza lo que en Azure hacía Static Web Apps con su backend enlazado y las
 * reescrituras de `staticwebapp.config.json`:
 *
 *   /api/*             → ORIGIN/api/*                       (misma ruta y consulta)
 *   /stories/<slug>    → ORIGIN/api/og/story-html?slug=<slug> (vista previa en redes)
 *   /sitemap.xml       → ORIGIN/api/sitemap.xml
 *   /sitemap-news.xml  → ORIGIN/api/sitemap-news.xml
 *   /feed              → ORIGIN/api/feed
 *   /podcast/feed.xml  → ORIGIN/api/podcast/feed.xml
 *
 * Solo corre en esas rutas: `public/_routes.json` deja todo lo demás como
 * estático, así el sitio no gasta invocaciones de Functions en cada archivo.
 *
 * LA IP DEL LECTOR. La API cuenta la IP desde la derecha de X-Forwarded-For
 * (`CLIENT_IP_FROM_RIGHT=2`, server/src/lib/clientIp.ts). Con Static Web Apps la
 * cadena llegaba como `lector, salida-del-proxy`. Aquí se reproduce igual: se
 * REEMPLAZA X-Forwarded-For por `CF-Connecting-IP` (la IP que Cloudflare vio, que
 * el lector no puede falsificar) y el App Service agrega a la derecha la salida
 * de Cloudflare. Así el número de saltos no cambia.
 *
 * EL CANDADO. Si está configurado el secreto `ORIGIN_SECRET`, cada petición lleva
 * `X-Origin-Secret`; la API lo exige cuando Easy Auth deja de ser el candado.
 * Mientras ORIGIN apunte a Static Web Apps (etapa de prueba), no hace falta.
 */

interface Env {
  /** Origen al que se reenvía: la API directa o, en la etapa de prueba, Static Web Apps. */
  ORIGIN: string
  /** Secreto compartido con la API (opcional hasta el corte). */
  ORIGIN_SECRET?: string
}

interface Ctx {
  request: Request
  env: Env
  next: () => Promise<Response>
}

/** Las mismas cabeceras de seguridad que `_headers`, que no alcanza a las Functions. */
const CABECERAS_SEGURIDAD: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests",
  'X-XSS-Protection': '0',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

/** Cabeceras del lector que no se pasan a la API: las rehace el reenvío o son de Cloudflare. */
const NO_REENVIAR = new Set([
  'host',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'x-origin-secret',
  'x-ms-original-url',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'cf-worker',
  'cdn-loop',
])

const RUTAS_FIJAS: Record<string, string> = {
  '/sitemap.xml': '/api/sitemap.xml',
  '/sitemap-news.xml': '/api/sitemap-news.xml',
  '/feed': '/api/feed',
  '/podcast/feed.xml': '/api/podcast/feed.xml',
}

/** Ruta de destino en la API, o null si la petición no es de las que se reenvían. */
export function rutaDestino(url: URL): string | null {
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return url.pathname + url.search
  const fija = RUTAS_FIJAS[url.pathname]
  if (fija) return fija + url.search
  const historia = url.pathname.match(/^\/stories\/([^/]+)\/?$/)
  if (historia) return `/api/og/story-html?slug=${encodeURIComponent(decodeURIComponent(historia[1]))}`
  return null
}

export async function onRequest({ request, env, next }: Ctx): Promise<Response> {
  const url = new URL(request.url)
  const destino = rutaDestino(url)
  if (!destino) return next()

  const cabeceras = new Headers()
  for (const [nombre, valor] of request.headers) {
    if (!NO_REENVIAR.has(nombre.toLowerCase())) cabeceras.set(nombre, valor)
  }
  const ipLector = request.headers.get('cf-connecting-ip')
  if (ipLector) cabeceras.set('X-Forwarded-For', ipLector)
  cabeceras.set('X-Forwarded-Proto', 'https')
  cabeceras.set('X-Forwarded-Host', url.host)
  // La API lee la URL original de la historia de aquí (routes/og.ts); el slug
  // también va en ?slug=, que es lo que lee si esta cabecera no llega.
  if (url.pathname.startsWith('/stories/')) cabeceras.set('x-ms-original-url', url.href)
  if (env.ORIGIN_SECRET) cabeceras.set('X-Origin-Secret', env.ORIGIN_SECRET)

  const tieneCuerpo = request.method !== 'GET' && request.method !== 'HEAD'
  const respuesta = await fetch(env.ORIGIN.replace(/\/+$/, '') + destino, {
    method: request.method,
    headers: cabeceras,
    body: tieneCuerpo ? request.body : undefined,
    redirect: 'manual',
  })

  const salida = new Response(respuesta.body, respuesta)
  for (const [nombre, valor] of Object.entries(CABECERAS_SEGURIDAD)) {
    if (!salida.headers.has(nombre)) salida.headers.set(nombre, valor)
  }
  return salida
}
