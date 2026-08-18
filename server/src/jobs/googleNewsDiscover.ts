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
import { checkSourceAge } from '../lib/source-age.js'
import { config } from '../config.js'

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
  { query: 'indígena Araucanía',               region: 'CL:es' },
  // Español — Latinoamérica amplio
  { query: 'indígenas amazonia',               region: 'BR:pt-419' },
  { query: 'pueblos indígenas derechos',       region: 'MX:es' },
  // Inglés — global
  { query: 'indigenous peoples rights',        region: 'US:en' },
  { query: 'indigenous communities land',      region: 'US:en' },
  { query: 'indigenous climate change',        region: 'US:en' },
  { query: 'first nations rights',             region: 'CA:en' },
  // Economías indígenas — el descubrimiento no buscaba economía en absoluto.
  // De las 21 queries anteriores, CERO mencionaban empresa, emprendimiento,
  // comercio, empleo o financiamiento, y por eso Economías Indígenas era la
  // categoría más chica: no le faltaban fuentes, le faltaba que alguien la
  // buscara. Las seis se verificaron contra Bing News el 17-ago-2026 y todas
  // devuelven entre 6 y 12 resultados reales: "Corfo anuncia fondo para
  // empresas indígenas con línea de crédito", "CCIB Relaunches Indigenous
  // Procurement Marketplace", "Turismo indígena: Misiones avanza en
  // experiencias comunitarias".
  { query: 'empresas indígenas',                region: 'CL:es' },
  { query: 'emprendimiento indígena',           region: 'CL:es' },
  { query: 'economía indígena',                 region: 'CL:es' },
  { query: 'turismo indígena comunitario',      region: 'CL:es' },
  { query: 'indigenous business',               region: 'US:en' },
  { query: 'indigenous procurement',            region: 'CA:en' },
  // Vertical jurídico — Corte IDH, C169 OIT, UNDRIP
  // Vertical juridico CHILENO. Cubre el terreno que traia Diario
  // Constitucional (493 historias) hasta que empezo a responder 403 a los
  // crawlers, y El Libero (220) hasta que elimino su RSS. Las dos se
  // desactivaron el 17-ago-2026 y no son recuperables como feed.
  //
  // OJO: el operador `site:` NO funciona en Bing News — `site:ellibero.cl
  // indigena` devuelve CERO resultados, igual que las otras tres que se
  // probaron. La unica via es tematica, y estas cuatro se verificaron ese dia
  // con 5 a 11 resultados reales: "Corte Suprema falla en favor de comunidades
  // indigenas", "Tercer Tribunal Ambiental rechaza reclamacion de comunidad
  // indigena", "Suprema ordena someter a consulta indigena proyecto minero".
  { query: 'sentencia indígena Chile',              region: 'CL:es' },
  { query: 'Corte Suprema consulta indígena',       region: 'CL:es' },
  { query: 'tribunal ambiental comunidad indígena', region: 'CL:es' },
  { query: 'recurso de protección indígena',        region: 'CL:es' },
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
  let totalTooOld = 0

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

      // Descartar el material viejo ANTES de extraer: cada artículo que pasa de
      // acá cuesta una descarga, a veces una llamada a Diffbot y siempre una al
      // modelo. Este job NO aplicaba ningún filtro de fecha —crea las historias
      // con `prisma.story.create` directo, sin pasar por el guardia del
      // crawler—, y por eso publicó noticias de hasta 2011 como si fueran del
      // día: 30 de las 61 publicadas el 16 y 17 de agosto superaban los 18
      // meses. Bing News SÍ entrega `pubDate`; el dato estaba, nadie lo miraba.
      const fresh: typeof normalized = []
      let tooOldCount = 0
      for (const item of normalized) {
        const { tooOld, ageMonths } = checkSourceAge(item.fechaPublicacion)
        if (tooOld) {
          tooOldCount++
          log.debug({ url: item.url, ageMonths, query }, 'artículo más viejo que el techo, descartado')
          continue
        }
        fresh.push(item)
      }
      if (tooOldCount > 0) {
        log.info(
          { query, region, tooOld: tooOldCount, limitMonths: config.crawl.maxSourceAgeMonths },
          'descartados por antigüedad',
        )
        totalTooOld += tooOldCount
      }

      // Filtrar las que ya están en la DB
      const existingUrls = await getExistingUrls(fresh.map(r => r.url))
      const newItems = fresh.filter(r => !existingUrls.has(r.url))

      log.info({ query, region, found: results.length, fresh: fresh.length, new: newItems.length }, 'query processed')

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
              // El PR #49 agregó la atribución de autor en `createStory`, pero
              // este job escribe con `prisma.story.create` directo y se quedaba
              // sin ella. El art. 71 B pide mencionar fuente, título y autor.
              sourceAuthor: extracted.author,
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

  log.info({ totalNew, totalSkipped, totalTooOld, totalErrors }, 'discovery complete')
}
