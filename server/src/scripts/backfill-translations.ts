/**
 * backfill-translations.ts
 *
 * Re-traduce al ingles las noticias publicadas que lo necesitan:
 *   - las que no tienen ningun campo en ingles (anteriores al 11-abr-2026,
 *     cuando nacio la traduccion; nunca se hizo backfill), y
 *   - las que tienen el "ingles" identico al español: del 10-may al 12-oct-2026
 *     el esquema del traductor pedia los campos con el mismo nombre que la
 *     entrada y gpt-4o-mini los devolvia copiados (3131 de 3958 el 12-oct).
 *
 * Usa translateStory(), que desde el 12-oct rechaza una copia sin escribirla,
 * asi que una re-traduccion que vuelva a fallar deja la noticia como estaba.
 *
 * Correr:
 *   npm run translations:backfill                 # simulacion: cuenta y lista, no llama al modelo, no escribe
 *   npm run translations:backfill:apply           # traduce y escribe, de la mas reciente a la mas antigua
 *   npm run translations:backfill:apply -- --limit 20   # solo las 20 mas recientes, para probar
 *
 * La simulacion es el modo por defecto a proposito: escribe sobre la base de
 * produccion y cada noticia es una llamada al modelo.
 */
import 'dotenv/config'
import prisma from '../lib/prisma.js'
import { translateStory, isUntranslated, TranslationUnchangedError } from '../services/translation.js'

const APPLY = process.argv.includes('--apply')
const limitIdx = process.argv.indexOf('--limit')
const LIMIT = limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity

async function main() {
  console.log(APPLY ? '== APLICANDO (llama al modelo y escribe) ==' : '== SIMULACION (no llama al modelo, no escribe) ==')

  const stories = await prisma.story.findMany({
    where: { status: 'published', OR: [{ title: { not: null } }, { summary: { not: null } }] },
    select: { id: true, slug: true, datePublished: true, title: true, titleEn: true, summary: true, summaryEn: true },
    orderBy: { datePublished: 'desc' },
  })

  const sinIngles = stories.filter(s => !s.titleEn)
  const copiadas = stories.filter(
    s => s.titleEn && (isUntranslated(s.title, s.titleEn) || isUntranslated(s.summary, s.summaryEn)),
  )
  const pendientes = stories
    .filter(s => sinIngles.includes(s) || copiadas.includes(s))
    .slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined)

  console.log(`Publicadas: ${stories.length} · sin ingles: ${sinIngles.length} · copiadas: ${copiadas.length} · a traducir ahora: ${pendientes.length}`)

  if (!APPLY) {
    console.log('\nPrimeras 10 que se traducirian:')
    for (const s of pendientes.slice(0, 10)) {
      const motivo = s.titleEn ? 'copiada' : 'sin ingles'
      console.log(`  ${s.datePublished?.toISOString().slice(0, 10)} · ${motivo} · ${s.slug}`)
    }
    return
  }

  let ok = 0
  let rechazadas = 0
  let fallidas = 0
  const inicio = Date.now()

  for (const [i, s] of pendientes.entries()) {
    try {
      await translateStory(s.id)
      ok++
    } catch (err) {
      if (err instanceof TranslationUnchangedError) {
        rechazadas++
        console.error(`  rechazada (volvio copiada): ${s.slug} [${err.fields.join(', ')}]`)
      } else {
        fallidas++
        console.error(`  fallo: ${s.slug}:`, err instanceof Error ? err.message : err)
      }
    }
    if ((i + 1) % 50 === 0 || i + 1 === pendientes.length) {
      const min = ((Date.now() - inicio) / 60000).toFixed(1)
      console.log(`  ${i + 1}/${pendientes.length} · ok ${ok} · rechazadas ${rechazadas} · fallidas ${fallidas} · ${min} min`)
    }
  }

  console.log(`\nListo: ${ok} traducidas · ${rechazadas} rechazadas por volver copiadas · ${fallidas} fallidas`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
