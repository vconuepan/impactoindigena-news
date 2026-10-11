import { createLogger } from './logger.js'
import { withRetry } from './retry.js'
import { safeAxiosGet } from './safeHttp.js'

const log = createLogger('extract-og-image')

/**
 * Decodes the HTML entities that appear inside a meta tag's content attribute.
 * og:image URLs are routinely stored HTML-escaped in the source markup
 * (e.g. `...?id=abc&amp;width=1200`), and using the raw value verbatim yields
 * an invalid URL with a literal `&amp;` that 4xxs on fetch — leaving the story
 * with a broken hero image on the site and in Google Discover. Numeric refs are
 * decoded before named ones so `&amp;` isn't clobbered mid-pass.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Tope de lo que se lee de la pagina: del og:image solo se necesita el <head>. */
const MAX_HTML_BYTES = 5 * 1024 * 1024

/**
 * Fetches a URL and extracts the og:image meta tag value.
 * Returns null if not found or on any error.
 *
 * Pasa por `safeAxiosGet`, que valida con la guardia SSRF la URL inicial y CADA
 * redireccion. Antes usaba `fetch` a secas, que sigue las redirecciones solo y no
 * resuelve el DNS contra nada: la URL de la nota se habia validado al rastrearla,
 * pero esta consulta ocurre horas o dias despues (al publicar, o cuando un lector
 * abre una nota sin imagen) y la pagina del tercero puede responder entonces con
 * un 302 hacia 127.0.0.1 o 169.254.x.x, o tener un DNS que ahora resuelve hacia
 * adentro. Es la misma clase de hueco que la sonda de robots.txt, cerrada en agosto.
 */
export async function fetchOgImage(sourceUrl: string): Promise<string | null> {
  try {
    const html = await withRetry(async () => {
      // safeAxiosGet lanza ante un 4xx/5xx o un destino bloqueado: cae en el catch.
      const res = await safeAxiosGet(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; VocesIndigenasCrawler/1.0)',
          Accept: 'text/html',
        },
        responseType: 'text',
        timeout: 10_000,
        maxContentLength: MAX_HTML_BYTES,
      })
      return typeof res.data === 'string' ? res.data : String(res.data ?? '')
    })

    // Match og:image — handle both property= and name= forms, single or double quotes
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)

    if (!match) return null

    const url = decodeHtmlEntities(match[1].trim())
    // Basic sanity check — must look like an absolute URL
    if (!url.startsWith('http')) return null

    return url
  } catch (err) {
    log.warn({ sourceUrl, err }, 'could not extract og:image')
    return null
  }
}
