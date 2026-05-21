/**
 * googleNewsSearch.ts
 *
 * Búsqueda de noticias usando el RSS público de Bing News.
 * No requiere API key ni costo.
 *
 * Endpoint:
 *   https://www.bing.com/news/search?q={query}&format=RSS&cc=CL&setlang=es-CL
 *
 * Las URLs en el feed de Bing News son del tipo:
 *   http://www.bing.com/news/apiclick.aspx?...&url=https%3a%2f%2farticulo-real.com%2f...
 * Se extrae la URL real del parámetro `url=` directamente — sin necesidad de resolver
 * redirecciones HTTP.
 *
 * El módulo mantiene la misma interfaz que la versión anterior (Google News)
 * para que googleNewsDiscover.ts no requiera cambios en su firma.
 */
import axios from 'axios'
import Parser from 'rss-parser'
import { createLogger } from './logger.js'

const log = createLogger('bing-news-search')

const parser = new Parser()

export interface GoogleNewsResult {
  titulo: string
  url: string
  fuente: string
  fechaPublicacion: Date | null
  resumen: string
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
}

/**
 * Extrae la URL real del artículo desde el link de apiclick de Bing News.
 *
 * Bing embeds the real article URL as the `url` query parameter:
 *   http://www.bing.com/news/apiclick.aspx?ref=FexRss&url=https%3a%2f%2freal-article.com%2f...
 *
 * Returns null if the URL cannot be extracted.
 */
function extractRealUrl(bingUrl: string): string | null {
  try {
    const u = new URL(bingUrl)
    const realUrl = u.searchParams.get('url')
    if (realUrl && (realUrl.startsWith('http://') || realUrl.startsWith('https://'))) {
      return realUrl
    }
  } catch {}
  return null
}

/**
 * Mapea el formato de región "CC:lang" (heredado de Google News) a los
 * parámetros de Bing News RSS.
 *
 * Ejemplos:
 *   "CL:es"     → { cc: "CL", setlang: "es-CL" }
 *   "MX:es"     → { cc: "MX", setlang: "es-MX" }
 *   "BR:pt-419" → { cc: "BR", setlang: "pt-BR" }
 *   "US:en"     → { cc: "US", setlang: "en-US" }
 *   "CA:en"     → { cc: "CA", setlang: "en-CA" }
 */
function regionToBing(region: string): { cc: string; setlang: string } {
  const [cc, langRaw] = region.split(':')
  // Normalize: "pt-419" → "pt", "es" → "es", "en" → "en"
  const lang = (langRaw ?? 'es').split('-')[0]
  return { cc: cc ?? 'CL', setlang: `${lang}-${cc ?? 'CL'}` }
}

/**
 * Busca noticias en Bing News RSS para la query dada.
 *
 * Las URLs retornadas son siempre URLs reales de artículos (no URLs de Bing).
 *
 * @param query         Términos de búsqueda (ej. "pueblos indígenas Chile")
 * @param maxResultados Máximo de resultados a retornar (default 20)
 * @param region        Código de región en formato "CC:lang" (default "CL:es")
 * @returns             Lista de resultados; lista vacía si hay error de red o parseo
 */
export async function buscarNoticias(
  query: string,
  maxResultados = 20,
  region = 'CL:es',
): Promise<GoogleNewsResult[]> {
  const { cc, setlang } = regionToBing(region)

  const feedUrl = new URL('https://www.bing.com/news/search')
  feedUrl.searchParams.set('q', query)
  feedUrl.searchParams.set('format', 'RSS')
  feedUrl.searchParams.set('cc', cc)
  feedUrl.searchParams.set('setlang', setlang)

  let xmlText: string
  try {
    const response = await axios.get<string>(feedUrl.toString(), {
      headers: BROWSER_HEADERS,
      timeout: 15_000,
      responseType: 'text',
    })
    xmlText = response.data
  } catch (err: any) {
    log.warn({ err: err?.message, query, region }, 'bing news fetch failed')
    return []
  }

  let feed: any
  try {
    feed = await parser.parseString(xmlText)
  } catch (err: any) {
    log.warn({ err: err?.message, query }, 'bing news xml parse failed')
    return []
  }

  const items: any[] = feed.items ?? []
  const results: GoogleNewsResult[] = []

  for (const item of items.slice(0, maxResultados)) {
    const rawLink: string = item.link ?? item.guid ?? ''

    // Bing News links go through apiclick — extract the real article URL
    const realUrl = extractRealUrl(rawLink) ?? rawLink

    // Skip if we couldn't resolve beyond bing.com
    if (!realUrl || realUrl.includes('bing.com')) {
      log.debug({ rawLink }, 'could not extract real url from bing apiclick, skipping')
      continue
    }

    let fechaPublicacion: Date | null = null
    if (item.pubDate || item.isoDate) {
      const d = new Date(item.isoDate ?? item.pubDate)
      if (!isNaN(d.getTime())) fechaPublicacion = d
    }

    const rawDesc: string = item.contentSnippet ?? item.summary ?? item.content ?? ''
    const resumen = rawDesc.replace(/<[^>]*>/g, '').trim().slice(0, 500)

    results.push({
      titulo: (item.title ?? '').trim(),
      url: realUrl,
      fuente: item.author ?? (feed.title ?? 'Desconocido'),
      fechaPublicacion,
      resumen,
    })
  }

  log.debug({ query, region, found: items.length, resolved: results.length }, 'bing news search done')
  return results
}
