/**
 * Backfill script — El Austral de Temuco, todas las ediciones de 2026.
 *
 * Itera cada día hábil (lunes–sábado) desde el 5 de enero de 2026 hasta hoy,
 * descarga las páginas PDF de cada edición, extrae el texto, filtra páginas
 * con contenido indígena, e inserta las historias en la tabla stories
 * (status = 'fetched', listas para el pipeline de pre-evaluación).
 *
 * Requiere la variable de entorno AUSTRAL_COOKIE con el valor del header
 * Cookie de una sesión autenticada en impresa.soy-chile.cl.
 *
 * Ejecutar desde el directorio server/:
 *   AUSTRAL_COOKIE="..." npx tsx src/scripts/backfill-austral-2026.ts
 *
 * O desde la raíz del proyecto:
 *   AUSTRAL_COOKIE="..." npx tsx src/scripts/backfill-austral-2026.ts --prefix server
 */
import 'dotenv/config'
import { scrapeAustralEdition } from '../services/australScraper.js'
import { createStory } from '../services/story.js'
import { getExistingUrls } from '../services/story.js'
import { createLogger } from '../lib/logger.js'
import { normalizeUrl } from '../utils/urlNormalization.js'

const log = createLogger('backfill-austral-2026')

// Feed ID para El Austral — se creará en la BD antes de ejecutar este script
// Busca el feed con URL 'https://www.australtemuco.cl/impresa/' en la BD
const AUSTRAL_FEED_ID = process.env.AUSTRAL_FEED_ID || ''

/** Genera todos los días lunes–sábado entre dos fechas (inclusive) */
function* weekdays(from: Date, to: Date): Generator<Date> {
  const cur = new Date(from)
  cur.setHours(12, 0, 0, 0)
  while (cur <= to) {
    const dow = cur.getDay() // 0=domingo, 6=sábado
    if (dow !== 0) yield new Date(cur)
    cur.setDate(cur.getDate() + 1)
  }
}

async function main() {
  if (!AUSTRAL_FEED_ID) {
    log.error('AUSTRAL_FEED_ID env var is required — add the feed to the DB first and set its ID')
    process.exit(1)
  }

  if (!process.env.AUSTRAL_COOKIE) {
    log.warn('AUSTRAL_COOKIE not set — PDFs may be inaccessible (subscription required)')
  }

  const START = new Date('2026-01-05')  // primer lunes del año
  const END = new Date()
  END.setHours(23, 59, 59, 999)

  const dates = [...weekdays(START, END)]
  log.info({ totalDays: dates.length }, 'starting El Austral 2026 backfill')

  let imported = 0
  let skipped = 0
  let noEdition = 0
  let failed = 0

  for (const date of dates) {
    const dateStr = date.toISOString().split('T')[0]

    try {
      const result = await scrapeAustralEdition(date)

      if (result.items.length === 0) {
        noEdition++
        log.debug({ date: dateStr }, 'no indigenous pages found (or no edition)')
        continue
      }

      for (const item of result.items) {
        const url = normalizeUrl(item.url)
        const existing = await getExistingUrls([url])
        if (existing.has(url)) {
          log.info({ url }, 'already in DB — skipping')
          skipped++
          continue
        }

        await createStory({
          sourceUrl: url,
          sourceTitle: item.title,
          sourceContent: item.description || item.title,
          feedId: AUSTRAL_FEED_ID,
          sourceDatePublished: item.datePublished ?? undefined,
          crawlMethod: 'readability',
        })

        log.info({ date: dateStr, url, title: item.title }, 'imported')
        imported++
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn({ date: dateStr, err: msg }, 'edition failed')
      failed++
    }

    // Pausa entre ediciones para no saturar el servidor
    await new Promise(r => setTimeout(r, 1200))
  }

  log.info(
    { imported, skipped, noEdition, failed, total: dates.length },
    'backfill complete',
  )
  process.exit(0)
}

main().catch(err => {
  log.error({ err }, 'fatal error')
  process.exit(1)
})
