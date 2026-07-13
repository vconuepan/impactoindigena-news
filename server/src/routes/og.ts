import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'

const router = Router()
const log = createLogger('og-proxy')

const SITE_URL = 'https://impactoindigena.news'
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

async function getShell(): Promise<string> {
  if (shellCache && Date.now() - shellCache.fetchedAt < SHELL_TTL_MS) {
    return shellCache.html
  }
  try {
    const res = await fetch(`${SITE_URL}/`)
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
        name: 'Impacto Indígena',
        url: SITE_URL,
      },
    })

    const headTags = `
  <title>${fullTitle} - Impacto Indígena</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${storyUrl}" />
  <meta property="og:title" content="${fullTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${storyUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Impacto Indígena" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${fullTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
  <script type="application/ld+json">${escapeJsonForScript(jsonLd)}</script>`

    // Strip the shell's own title/meta (the home may be prerendered with full
    // content), clear the prerendered root so React mounts cleanly, then inject.
    const html = shell
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
  <title>${fullTitle} - Impacto Indígena</title>
  <meta property="og:title" content="${fullTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Impacto Indígena" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${fullTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />`

      // Strip pre-existing title and OG/twitter tags from the shell so we don't
      // end up with two sets of meta tags. LinkedIn (and other parsers) get confused
      // by duplicate og:image tags even when the correct one appears first.
      const cleanShell = shell
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
  <title>${fullTitle} - Impacto Indígena</title>
  <meta property="og:title" content="${fullTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Impacto Indígena" />
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
    // may differ from the backend origin (Render.com multi-service setup).
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
