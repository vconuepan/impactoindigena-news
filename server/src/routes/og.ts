import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'

const router = Router()
const log = createLogger('og-proxy')

const SITE_URL = 'https://vocesindigenas.org'
const FALLBACK_IMAGE = `${SITE_URL}/images/og-image.png`

const BOT_UA = /bot|crawler|spider|crawling|facebookexternalhit|linkedinbot|twitterbot|slackbot|telegrambot|whatsapp|discordbot|curl|wget|python|java\/|go-http/i

function isBotRequest(req: import('express').Request): boolean {
  return BOT_UA.test(req.headers['user-agent'] || '')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Escape a JSON string for safe embedding inside a <script> element, so story
// content (crawled/LLM-generated) can't break out of the JSON-LD script context.
function escapeJsonForScript(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

// URLs in og:image content= must NOT have & encoded as &amp; —
// LinkedIn and many OG parsers use the raw attribute value as a URL
// without HTML-decoding it, so &amp; breaks the request.
// Only escape " and < > which could break the attribute context.
function escapeAttrUrl(url: string): string {
  return url.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E')
}

// ---------------------------------------------------------------------------
// /story-html — primary serving path for /stories/* on Azure SWA.
// staticwebapp.config.json rewrites /stories/* here; SWA forwards the original
// URL in the x-ms-original-url header (rewrites can't carry path params).
// Serves the React shell with story-specific OG tags, canonical, and JSON-LD
// to EVERY request (humans hydrate the app normally; crawlers read the meta).
// This covers all stories — including ones published minutes ago — unlike
// build-time prerendering, which went stale on every new publish.
// ---------------------------------------------------------------------------

let shellCache: { html: string; fetchedAt: number } | null = null
const SHELL_TTL_MS = 10 * 60 * 1000

/**
 * El shell cacheado apunta a un bundle con hash, y ese hash cambia en cada
 * despliegue del frontend. Mientras el cache no expira, estas paginas piden un
 * archivo que ya se borro: el script da 404, React no arranca y el lector se
 * queda con el titular, el resumen y NADA en que hacer clic — sin relacionadas
 * y sin navegacion. Medido el 5-sep-2026 justo despues de un despliegue:
 * /stories/* servia `index-8meAqMSo.js`, que devolvia 404, mientras la portada
 * ya servia `index-WU4o-CB2.js`.
 *
 * Se comprueba que el bundle exista antes de dar el shell por bueno. Si no
 * existe, se vuelve a pedir el shell saltando el cache del CDN.
 */
async function bundleVive(html: string): Promise<boolean> {
  const m = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/)
  if (!m) return true // sin bundle que verificar, no hay nada que invalidar
  try {
    const r = await fetch(`${SITE_URL}${m[1]}`, { method: 'HEAD' })
    return r.ok
  } catch {
    return true // un fallo de red no es prueba de que el bundle no este
  }
}

/**
 * El shell es el index.html de la PORTADA, y el build le hornea dos preloads que
 * son suyos: la imagen de su hero con `fetchpriority="high"` y el snapshot
 * `homepage.json` (ver el plugin de prerender en client/vite.config.ts, que solo
 * los emite para la ruta '/').
 *
 * En una pagina de historia ninguno de los dos se usa jamas, y el de la imagen
 * es peor que inutil: pide con prioridad alta una foto que no se va a mostrar,
 * compitiendo por el ancho de banda con la que si mide el LCP. Medido con
 * Lighthouse el 5-sep-2026 sobre una historia en movil, la pagina precargaba
 * `oghero-eeefd92b...jpg` —el hero de la portada— mientras su LCP real era
 * `storycard-78790b57...`, que no llevaba preload alguno. Lighthouse cifro la
 * perdida en 963 ms.
 *
 * Los preloads de fuentes se conservan: sirven en cualquier pagina del sitio.
 */
function quitarPreloadsDePortada(html: string): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) =>
    /rel=["']preload["']/i.test(tag) && /\bas=["'](?:image|fetch)["']/i.test(tag) ? '' : tag,
  )
}

let comprobacionEnVuelo = false

/**
 * Comprueba el bundle SIN bloquear la respuesta.
 *
 * La primera version esperaba el HEAD antes de servir, y ese HEAD sale del App
 * Service en Chile Central hacia el CDN: medido el 6-sep-2026, entre 533 y 763
 * ms. Es decir, para cerrar una ventana de 10-15 minutos que se abre una vez por
 * despliegue, se le cobraba media ida y vuelta de red a CADA lector, siempre. Un
 * mal negocio: cambia un problema raro y transitorio por un costo permanente.
 *
 * Asi que la comprobacion se dispara en segundo plano y, si el bundle murio,
 * invalida el cache para la peticion SIGUIENTE. El precio es que una sola
 * peticion tras cada despliegue puede llevarse el bundle viejo, en vez de diez
 * minutos de peticiones. La guarda evita que mil peticiones concurrentes lancen
 * mil HEAD.
 */
function comprobarBundleEnSegundoPlano(cacheDelMomento: { html: string }): void {
  if (comprobacionEnVuelo) return
  comprobacionEnVuelo = true
  void bundleVive(cacheDelMomento.html)
    .then((vive) => {
      // Solo se invalida si el cache sigue siendo el mismo que se comprobo: entre
      // medio pudo refrescarse solo, y descartar el nuevo seria un bucle.
      if (!vive && shellCache?.html === cacheDelMomento.html) {
        log.info('shell cacheado apunta a un bundle inexistente, se descarta')
        shellCache = null
      }
    })
    .catch(() => {})
    .finally(() => {
      comprobacionEnVuelo = false
    })
}

async function getShell(): Promise<string> {
  if (shellCache && Date.now() - shellCache.fetchedAt < SHELL_TTL_MS) {
    comprobarBundleEnSegundoPlano(shellCache)
    return shellCache.html
  }
  try {
    // `cache: no-store` y un parametro unico: el shell se pide a traves del CDN,
    // que puede devolver la version anterior justo despues de un despliegue.
    const res = await fetch(`${SITE_URL}/?shell=${Date.now()}`, { cache: 'no-store' })
    const html = await res.text()
    if (res.ok && html.includes('<div id="root">')) {
      shellCache = { html, fetchedAt: Date.now() }
      return html
    }
  } catch {
    /* fall through */
  }
  return shellCache?.html || ''
}

function slugFromRequest(req: import('express').Request): string | null {
  // Azure SWA sends the original URL of the rewritten request in this header.
  const original = req.headers['x-ms-original-url']
  const raw = typeof original === 'string' ? original : (req.query.slug as string | undefined)
  if (!raw) return null
  if (!raw.includes('/stories/')) return typeof req.query.slug === 'string' ? req.query.slug : null
  try {
    const path = raw.startsWith('http') ? new URL(raw).pathname : raw
    const match = path.match(/\/stories\/([^/?#]+)/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

router.get('/story-html', async (req, res) => {
  const slug = slugFromRequest(req)
  const shell = await getShell()

  const sendShell = (status: number) => {
    res.status(status)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.send(shell || '<!DOCTYPE html><html lang="es"><head><meta http-equiv="refresh" content="0;url=/" /></head><body></body></html>')
  }

  if (!slug) {
    sendShell(200)
    return
  }

  try {
    const story = await prisma.story.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        titleLabel: true,
        summary: true,
        imageUrl: true,
        datePublished: true,
        status: true,
      },
    })

    if (!story || story.status !== 'published') {
      // Unknown or unpublished (rejected/trashed/archived) story: return 404 so
      // crawlers de-index it. Serving 200 here made Google flag de-published
      // stories as Soft 404 (they returned 200 with the generic home shell).
      // The React app still renders its own not-found state on the client.
      sendShell(404)
      return
    }

    if (!shell) {
      // Story is live but the home shell fetch failed transiently. Don't 404 a
      // published article over a transient upstream hiccup; serve the fallback
      // with 200 so the client can still hydrate.
      sendShell(200)
      return
    }

    const title = escapeHtml(story.title || story.slug || '')
    const titleLabel = story.titleLabel ? escapeHtml(story.titleLabel) : null
    const fullTitle = titleLabel ? `${titleLabel}: ${title}` : title
    const description = escapeHtml(story.summary?.slice(0, 200) || fullTitle)
    const image = escapeAttrUrl(story.imageUrl || FALLBACK_IMAGE)
    const storyUrl = `${SITE_URL}/stories/${story.slug}`

    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: story.title || story.slug,
      description: story.summary?.slice(0, 200) || undefined,
      image: story.imageUrl ? [story.imageUrl] : undefined,
      datePublished: story.datePublished?.toISOString(),
      mainEntityOfPage: storyUrl,
      publisher: {
        '@type': 'Organization',
        name: 'Voces Indígenas',
        url: SITE_URL,
      },
    })

    const headTags = `
  <title>${fullTitle} - Voces Indígenas</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${storyUrl}" />
  <meta property="og:title" content="${fullTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${storyUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Voces Indígenas" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${fullTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />${story.imageUrl ? `
  <link rel="preload" href="${image}" as="image" fetchpriority="high" />` : ''}
  <script type="application/ld+json">${escapeJsonForScript(jsonLd)}</script>`

    // Strip the shell's own title/meta (the home may be prerendered with full
    // content), clear the prerendered root so React mounts cleanly, then inject.
    const html = quitarPreloadsDePortada(shell)
      .replace(/<title>[^<]*<\/title>/gi, '')
      .replace(/<meta[^>]+(property=["']og:[^"']*["']|name=["']twitter:[^"']*["'])[^>]*\/?>/gi, '')
      .replace(/<meta[^>]+name=["']description["'][^>]*\/?>/gi, '')
      .replace(/<link[^>]+rel=["']canonical["'][^>]*\/?>/gi, '')
      .replace('<head>', `<head>${headTags}`)
      .replace(/<div id="root">[\s\S]*?<\/div>(?=\s*<script)/, '<div id="root"></div>')

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(html)
  } catch (err) {
    log.error({ err, slug }, 'story-html error')
    sendShell(200)
  }
})

router.get('/stories/:slug', async (req, res) => {
  const { slug } = req.params

  try {
    const story = await prisma.story.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        titleLabel: true,
        summary: true,
        imageUrl: true,
        datePublished: true,
        status: true,
      },
    })

    // Only expose metadata for published stories — a story that was published
    // (got a slug) and later rejected/trashed must not leak title/summary/image.
    if (!story || story.status !== 'published') {
      res.redirect(302, `${SITE_URL}/stories/${slug}`)
      return
    }

    // Regular browsers get a fast HTTP redirect to the React app.
    // Only serve OG HTML to crawlers (LinkedIn, Twitter, etc.).
    // If _r=1 is already present the Render route still hits this proxy —
    // break the loop by falling through and serving the shell (React loads fine).
    const storyUrl = `${SITE_URL}/stories/${story.slug}`
    const isRetry = req.query._r === '1'
    if (!isBotRequest(req) && !isRetry) {
      res.redirect(302, `${storyUrl}?_r=1`)
      return
    }

    const title = escapeHtml(story.title || story.slug || '')
    const titleLabel = story.titleLabel ? escapeHtml(story.titleLabel) : null
    const fullTitle = titleLabel ? `${titleLabel}: ${title}` : title
    const description = escapeHtml(story.summary?.slice(0, 200) || fullTitle)
    const image = escapeAttrUrl(story.imageUrl || FALLBACK_IMAGE)
    const url = storyUrl

    // Fetch the frontend shell to preserve React scripts (cached, 10-min TTL —
    // avoids an outbound origin fetch on every bot request).
    const shell = await getShell()
    if (!shell) {
      log.warn({ slug }, 'could not fetch frontend shell, using minimal HTML')
    }

    let html: string

    if (shell) {
      // Inject story OG tags right after <head> — LinkedIn uses first occurrence
      const ogTags = `
  <title>${fullTitle} - Voces Indígenas</title>
  <meta property="og:title" content="${fullTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Voces Indígenas" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${fullTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />${story.imageUrl ? `
  <link rel="preload" href="${image}" as="image" fetchpriority="high" />` : ''}`

      // Strip pre-existing title and OG/twitter tags from the shell so we don't
      // end up with two sets of meta tags. LinkedIn (and other parsers) get confused
      // by duplicate og:image tags even when the correct one appears first.
      const cleanShell = quitarPreloadsDePortada(shell)
        .replace(/<title>[^<]*<\/title>/gi, '')
        .replace(/<meta[^>]+(property=["']og:[^"']*["']|name=["']twitter:[^"']*["'])[^>]*\/?>/gi, '')

      // Inject story OG tags right after <head> and clear prerendered root content
      // (avoids React hydration mismatch when shell was prerendered as homepage)
      html = cleanShell
        .replace('<head>', `<head>${ogTags}`)
        .replace(/<div id="root">[\s\S]*?<\/div>(?=\s*<script)/, '<div id="root"></div>')
    } else {
      // Minimal fallback HTML
      html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${fullTitle} - Voces Indígenas</title>
  <meta property="og:title" content="${fullTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Voces Indígenas" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${image}" />
  <meta http-equiv="refresh" content="0;url=${url}" />
</head>
<body><script>window.location.replace('${url}')</script></body>
</html>`
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    // Scoped CSP for this bot-facing OG proxy page. We can't use 'self' alone
    // because the React shell's scripts and assets come from SITE_URL, which
    // may differ from the backend origin (Static Web App fronting the API).
    // Permissive enough for the shell to hydrate; more restrictive than no CSP.
    res.setHeader('Content-Security-Policy',
      `default-src 'self' ${SITE_URL}; script-src 'self' ${SITE_URL}; style-src 'self' ${SITE_URL} 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; font-src 'self' ${SITE_URL} https:`)
    res.removeHeader('Cross-Origin-Resource-Policy')
    res.send(html)
  } catch (err) {
    log.error({ err, slug }, 'og proxy error')
    res.redirect(302, `${SITE_URL}/stories/${slug}`)
  }
})

export default router
