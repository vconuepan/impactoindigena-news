/**
 * googleNewsDiscover.ts
 *
 * Descubre artículos de noticias buscando en Bing News RSS con queries
 * sobre pueblos indígenas. Los artículos nuevos se insertan como stories
 * en estado `fetched` y pasan por el mismo pipeline que cualquier otra fuente.
 *
 * Las URLs de Bing News ya son URLs reales de artículos (el módulo
 * googleNewsSearch.ts las extrae del parámetro `url=` en los links apiclick),
 * por lo que no se requiere resolución de redirecciones.
 *
 * Requiere que exista un feed virtual "Google News" en la DB.
 * Ejecutar setup-google-news-feed.ts una vez antes de activar este job.
 */
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { buscarNoticias } from '../lib/googleNewsSearch.js'
import { extractContent } from '../services/extractor.js'
import { getExistingUrls } from '../services/story.js'
import { normalizeUrl } from '../utils/urlNormalization.js'
import { withRetry } from '../lib/retry.js'

const log = createLogger('google_news_discover')

/** URL usada como identificador del feed virtual en la DB */
export const GOOGLE_NEWS_VIRTUAL_RSS = 'https://news.google.com/rss/search'

/** Tiempo de espera entre queries para no sobrecargar Bing News */
const QUERY_DELAY_MS = 2_000

/** Mínimo de caracteres de contenido para considerar un artículo válido */
const MIN_CONTENT_LENGTH = 300

/**
 * Queries a ejecutar en cada ciclo de descubrimiento.
 * Cubren distintos temas y regiones/idiomas.
 */
const SEARCH_QUERIES: Array<{ query: string; region: string }> = [
  // Español — Chile y Latinoamérica
  { query: 'pueblos indígenas',                region: 'CL:es' },
  { query: 'derechos indígenas',               region: 'CL:es' },
  { query: 'comunidades indígenas',            region: 'CL:es' },
  { query: 'territorios indígenas',            region: 'CL:es' },
  { query: 'pueblos originarios Chile',        region: 'CL:es' },
  { query: 'CLPI consentimiento libre previo', region: 'CL:es' },
  { query: 'consulta indígena',                region: 'CL:es' },
  { query: 'mapuche',                          region: 'CL:es' },
  // Español — Latinoamérica amplio
  { query: 'indígenas amazonia',               region: 'BR:pt-419' },
  { query: 'pueblos indígenas derechos',       region: 'MX:es' },
  // Inglés — global
  { query: 'indigenous peoples rights',        region: 'US:en' },
  { query: 'indigenous communities land',      region: 'US:en' },
  { query: 'indigenous climate change',        region: 'US:en' },
  { query: 'first nations rights',             region: 'CA:en' },
  // Vertical jurídico — Corte IDH, C169 OIT, UNDRIP
  { query: 'Corte Interamericana Derechos Humanos indigena', region: 'CL:es' },
  { query: 'Convenio 169 OIT pueblos indígenas',             region: 'CL:es' },
  { query: 'UNDRIP declaration indigenous peoples rights',   region: 'US:en' },
  { query: 'Inter-American Court indigenous peoples',        region: 'US:en' },
  { query: 'ILO convention 169 indigenous rights',           region: 'US:en' },
]

export async function runGoogleNewsDiscover(): Promise<void> {
  // Buscar el feed virtual en la DB
  const feed = await prisma.feed.findFirst({
    where: { rssUrl: GOOGLE_NEWS_VIRTUAL_RSS },
  })

  if (!feed) {
    log.warn('Google News virtual feed not found in DB — run setup-google-news-feed.ts first')
    return
  }

  log.info({ feedId: feed.id, queries: SEARCH_QUERIES.length }, 'starting discovery')

  let totalNew = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const { query, region } of SEARCH_QUERIES) {
    try {
      const results = await buscarNoticias(query, 15, region)

      if (results.length === 0) {
        log.info({ query, region }, 'no results from Bing News')
        continue
      }

      // Normalizar URLs antes de dedup
      const normalized = results.map(r => ({
        ...r,
        url: normalizeUrl(r.url),
      }))

      // Filtrar las que ya están en la DB
      const existingUrls = await getExistingUrls(normalized.map(r => r.url))
      const newItems = normalized.filter(r => !existingUrls.has(r.url))

      log.info({ query, region, found: results.length, new: newItems.length }, 'query processed')

      for (const item of newItems) {
        try {
          // Extraer contenido del artículo (URL real del artículo)
          const extracted = await withRetry(() =>
            extractContent(item.url, { skipLocalExtraction: false }),
          )

          if (!extracted || extracted.content.length < MIN_CONTENT_LENGTH) {
            log.info({ url: item.url }, 'insufficient content, skipping')
            totalSkipped++
            continue
          }

          await prisma.story.create({
            data: {
              sourceUrl: item.url,
              sourceTitle: extracted.title || item.titulo,
              sourceContent: extracted.content,
              feedId: feed.id,
              sourceDatePublished: item.fechaPublicacion ?? null,
              crawlMethod: extracted.method,
            },
          })

          totalNew++
          log.info({ url: item.url, query }, 'story created')
        } catch (err: any) {
          // P2002 = unique constraint — insertado por otro proceso concurrente
          if (err?.code === 'P2002') {
            totalSkipped++
          } else {
            log.warn({ url: item.url, err: err?.message }, 'failed to process article')
            totalErrors++
          }
        }
      }
    } catch (err: any) {
      log.error({ query, region, err: err?.message }, 'query failed')
      totalErrors++
    }

    // Pausa entre queries
    await new Promise(r => setTimeout(r, QUERY_DELAY_MS))
  }

  // Actualizar timestamp del feed
  await prisma.feed.update({
    where: { id: feed.id },
    data: { lastCrawledAt: new Date(), lastSuccessfulCrawlAt: new Date() },
  })

  log.info({ totalNew, totalSkipped, totalErrors }, 'discovery complete')
}
