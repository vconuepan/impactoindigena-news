/**
 * retema-historias.ts
 *
 * Reclasifica por asunto central las historias de un tema que quedo actuando de
 * cajon de descarte.
 *
 * EL PROBLEMA QUE REPARA. Ver `seed-tema-cultura.ts`: sin un tema para la
 * lengua, el arte y el patrimonio, ese material se archivo durante meses en
 * Economias Indigenas. Medido el 1-sep-2026 sobre las 200 historias mas
 * recientes de la seccion: 107 no eran economicas. Este script las manda al
 * tema que les corresponde ahora que existe.
 *
 * QUE HACE. Toma las historias del tema de origen, se las muestra al modelo
 * junto con TODOS los temas de asunto —incluido el de cultura, que antes no
 * existia— y escribe el que devuelve.
 *
 * QUE NO HACE. Solo escribe `issue_id`. No toca el pais, ni el estado, ni el
 * titulo, ni la relevancia, ni la etiqueta emocional. Una historia publicada
 * sigue publicada, con la misma puntuacion, y solo cambia de seccion.
 *
 * Correr:
 *   npm run migration:retema --prefix server                      # simulacion
 *   npm run migration:retema --prefix server -- --limit 30        # muestra
 *   npm run migration:retema:apply --prefix server                # aplica
 *
 * Deshacer una corrida (no llama al modelo, lee el registro que dejo):
 *   npm run migration:retema --prefix server -- --revertir retema-2026-09-03....jsonl
 *   npm run migration:retema:apply --prefix server -- --revertir retema-2026-09-03....jsonl
 *
 * Por tandas, si la conexion a la base es fragil:
 *   npm run migration:retema:apply --prefix server -- --limit 50
 *   npm run migration:retema:apply --prefix server -- --offset 30 --limit 50
 *
 * Otros temas de origen:
 *   npm run migration:retema --prefix server -- --from derechos-indigenas
 *
 * La simulacion es el modo por defecto a proposito: esto escribe sobre la base
 * de produccion y cuesta llamadas al modelo.
 */
import 'dotenv/config'
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { HumanMessage } from '@langchain/core/messages'
import { getMediumLLM, rateLimitDelay } from '../../services/llm.js'
import {
  CLASSIFICATION_BLOCK,
  UNTRUSTED_CONTENT_GUARD,
  formatIssuesBlock,
  sanitizeUntrustedContent,
  type IssueForPrompt,
} from '../../prompts/shared.js'
import { z } from 'zod'
import { withRetry } from '../../lib/retry.js'
import { safeParseJson } from '../../services/issue.js'
import { GEOGRAPHIC_ISSUE_SLUGS } from '../../lib/country-focus.js'

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : undefined
/**
 * Desde donde empezar, para correr por tandas.
 *
 * Existe porque el conjunto a reclasificar se define por `issueId = origen`, y
 * las historias que el modelo CONFIRMA en su tema se quedan ahi: en la corrida
 * siguiente vuelven a entrar y se pagan otra vez. Con `--offset` cada tanda
 * arranca donde termino la anterior y no se reprocesa lo ya revisado. Hace
 * falta cuando la conexion a la base es fragil —un hotspot, por ejemplo— y una
 * corrida de 461 historias no sobrevive entera.
 */
const offsetArg = process.argv.indexOf('--offset')
const OFFSET = offsetArg !== -1 ? parseInt(process.argv[offsetArg + 1], 10) : 0
/**
 * Archivo de reversion.
 *
 * POR QUE EXISTE. La primera version escribia `issue_id` encima sin guardar el
 * valor anterior: la corrida del 3-sep-2026 movio 337 historias y esa
 * informacion se perdio. Para 337 fue tolerable; para el archivo completo no,
 * porque la unica salida seria volver a clasificar con el modelo y confiar en
 * que acierte igual.
 *
 * Cada escritura deja una linea {storyId, from, to, ts} ANTES de tocar la base.
 * `--revertir <archivo>` la lee al reves y devuelve cada historia a su tema
 * anterior, sin llamar al modelo y sin depender de su criterio.
 */
const revertirArg = process.argv.indexOf('--revertir')
const REVERTIR = revertirArg !== -1 ? process.argv[revertirArg + 1] : null

const fromArg = process.argv.indexOf('--from')
const FROM_SLUG = fromArg !== -1 ? process.argv[fromArg + 1] : 'desarrollo-sostenible-y-autodeterminado'
/**
 * Cinco y no diez.
 *
 * Con diez articulos de 4.000 caracteres por llamada, la respuesta del modelo
 * se truncaba y el esquema la rechazaba: medido el 3-sep-2026 sobre una muestra
 * de 30, CUATRO quedaron irresolubles (13%) con "Failed to parse". La biseccion
 * las aislaba pero no las salvaba. Cinco articulos de 2.500 caracteres cuesta el
 * doble de llamadas y no pierde trabajo.
 */
const BATCH_SIZE = 5

/** Caracteres de contenido por articulo. Ver la nota de BATCH_SIZE. */
const CONTENT_MAX = 2_500

/**
 * Estados que se reclasifican.
 *
 * Igual criterio que `backfill-country-focus.ts`: los rechazados y descartados
 * quedan fuera. Se conservan como registro historico, nadie los lee, y
 * reclasificarlos multiplicaria por veinte el costo en llamadas al modelo.
 */
const LIVE_STATUSES = ['published', 'selected', 'analyzed', 'pre_analyzed'] as const
const INCLUDE_REJECTED = process.argv.includes('--include-rejected')

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

/** Ruta del registro de esta corrida. Un archivo por corrida, con marca de tiempo. */
const DIR_LOG = '../.migraciones-log'
mkdirSync(DIR_LOG, { recursive: true })
const LOG_REVERSION = `${DIR_LOG}/retema-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`

/**
 * Prompt propio: pide SOLO el tema.
 *
 * No reusa `buildReclassifyPrompt` porque ese pide ademas etiqueta emocional y
 * encuadre narrativo, y este script no escribe ninguno de los dos. Un articulo
 * al que el modelo responda un valor invalido en un campo que aca ni se mira
 * invalidaria el lote entero — la leccion salio del backfill de pais. Las
 * REGLAS son las mismas de produccion: vienen de CLASSIFICATION_BLOCK.
 */
function buildRetemaPrompt(
  stories: { id: string; title: string; content: string }[],
  issues: IssueForPrompt[],
): string {
  const articles = stories
    .map(
      s => `<ARTICLE id="${s.id}">\n<TITLE>${sanitizeUntrustedContent(s.title)}</TITLE>\n<CONTENT>${sanitizeUntrustedContent(s.content.slice(0, CONTENT_MAX))}</CONTENT>\n</ARTICLE>`,
    )
    .join('\n')

  return `<ROLE>
Clasificas articulos de prensa sobre pueblos indigenas por su asunto central.
</ROLE>

<GOAL>
Para cada articulo devuelve exactamente un dato: el slug del tema que le corresponde. Nada mas.

El tema que estos articulos tienen hoy NO es informacion: fue asignado cuando el tema de cultura y conocimientos ancestrales todavia no existia. Clasificalos por su asunto central, sin tomarlo como pista ni a favor ni en contra. Algunos estaran bien donde estan y otros no; no hay una proporcion esperada.
</GOAL>

${formatIssuesBlock(issues)}

${CLASSIFICATION_BLOCK}

<ARTICLES>
${UNTRUSTED_CONTENT_GUARD}
${articles}
</ARTICLES>`
}

/**
 * Deshace una corrida leyendo su registro al reves.
 *
 * No llama al modelo: cada linea dice exactamente a que tema volver. Recorre de
 * atras hacia adelante para que, si una historia se movio dos veces en la misma
 * corrida, gane el valor mas antiguo.
 */
async function revertir(archivo: string) {
  if (!existsSync(archivo)) {
    console.error(`No existe el registro: ${archivo}`)
    process.exitCode = 1
    return
  }
  const lineas = readFileSync(archivo, 'utf8').split('\n').filter(Boolean)
  type Entrada = { storyId: string; from: string | null; to: string }
  const entradas = lineas.map(l => JSON.parse(l) as Entrada).reverse()

  // Una historia movida dos veces vuelve al tema que tenia ANTES de la primera.
  const destino = new Map<string, string | null>()
  for (const e of entradas) destino.set(e.storyId, e.from)

  console.log(APPLY ? '== REVIRTIENDO ==\n' : '== SIMULACION DE REVERSION (no escribe) ==\n')
  console.log(`Registro: ${archivo}`)
  console.log(`Escrituras registradas: ${entradas.length}`)
  console.log(`Historias distintas a revertir: ${destino.size}\n`)

  let hechas = 0
  for (const [storyId, issueId] of destino) {
    if (APPLY) await prisma.story.update({ where: { id: storyId }, data: { issueId } })
    hechas++
  }
  console.log(APPLY ? `Revertidas: ${hechas}` : `Se revertirian: ${hechas}`)
  if (!APPLY) {
    console.log(`\nPara aplicar:  npm run migration:retema:apply --prefix server -- --revertir ${archivo}`)
  }
}

async function main() {
  if (REVERTIR) return revertir(REVERTIR)

  console.log(APPLY ? '== APLICANDO CAMBIOS ==\n' : '== SIMULACION (no escribe) ==\n')

  const issues = (
    await prisma.issue.findMany({
      select: { id: true, slug: true, name: true, description: true, evaluationCriteria: true },
    })
  ).map(i => ({ ...i, evaluationCriteria: safeParseJson<string[]>(i.evaluationCriteria, []) }))

  const origen = issues.find(i => i.slug === FROM_SLUG)
  if (!origen) {
    console.error(`No existe el tema de origen: ${FROM_SLUG}`)
    process.exitCode = 1
    return
  }

  // Mismo filtro que produccion: el clasificador no ve las secciones
  // geograficas, porque su criterio es el pais y no el asunto.
  const topicIssues = issues.filter(i => !GEOGRAPHIC_ISSUE_SLUGS.includes(i.slug as never))
  const idToSlug = new Map(issues.map(i => [i.id, i.slug]))
  const slugToId = new Map(topicIssues.map(i => [i.slug, i.id]))

  if (!slugToId.has('cultura-y-conocimientos-ancestrales')) {
    console.error('No existe el tema de cultura todavia. Corre primero:')
    console.error('  npm run migration:seed-cultura:apply --prefix server')
    process.exitCode = 1
    return
  }

  const where = {
    issueId: origen.id,
    ...(INCLUDE_REJECTED ? {} : { status: { in: [...LIVE_STATUSES] } }),
  }

  const [all, totalConIssue] = await Promise.all([
    prisma.story.findMany({
      where,
      select: { id: true, sourceTitle: true, sourceContent: true, issueId: true, status: true },
      orderBy: { datePublished: 'desc' },
    }),
    prisma.story.count({ where: { issueId: origen.id } }),
  ])

  // Publicadas primero: son las que el lector ve, asi que una muestra con
  // --limit debe salir de ellas.
  const ORDER: Record<string, number> = { published: 0, selected: 1, analyzed: 2, pre_analyzed: 3 }
  all.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9))
  const desdeOffset = all.slice(OFFSET)
  const stories = LIMIT ? desdeOffset.slice(0, LIMIT) : desdeOffset

  const excluidas = totalConIssue - all.length
  if (excluidas > 0) {
    console.log(`Excluidas por estado (rechazadas o descartadas): ${excluidas}`)
    console.log('  Se conservan como registro historico. Para incluirlas: --include-rejected\n')
  }
  console.log(`Tema de origen: ${origen.name} (${FROM_SLUG})`)
  if (OFFSET > 0) console.log(`Saltadas por --offset: ${OFFSET} (de ${all.length} en la seccion)`)
  console.log(`Historias a reclasificar: ${stories.length}`)
  console.log(`Temas de asunto disponibles: ${topicIssues.map(i => i.slug).join(', ')}\n`)

  const llm = getMediumLLM()

  // `issueSlug` va como ENUM y no como string libre: medido en el backfill de
  // pais, el string libre dejaba sin tema a 351 de 449 historias porque el
  // modelo respondia "". El costo del enum es que un solo valor invalido tumba
  // el lote de 10, y eso se resuelve con la biseccion de `clasificarLote`.
  const slugs = topicIssues.map(i => i.slug) as [string, ...string[]]
  const retemaSchema = z.object({
    articles: z.array(
      z.object({
        articleId: z.string(),
        issueSlug: z.enum(slugs).describe('Slug del tema, tomado de la lista <ISSUES>'),
      }),
    ),
  })
  const structured = llm.withStructuredOutput(retemaSchema, { method: 'functionCalling' })

  type Item = { articleId: string; issueSlug: string }
  type Story = (typeof stories)[number]

  /**
   * Clasifica un grupo y, si el modelo devuelve algo que el esquema rechaza, lo
   * parte en dos y reintenta cada mitad. Un grupo de 1 que falla es el articulo
   * irresoluble: se deja como esta, porque mover a ciegas es peor que no mover.
   */
  async function clasificarLote(grupo: Story[]): Promise<{ items: Item[]; perdidas: Story[] }> {
    const prompt = buildRetemaPrompt(
      grupo.map(s => ({ id: s.id, title: s.sourceTitle, content: s.sourceContent })),
      topicIssues,
    )

    await rateLimitDelay()
    try {
      const response = await withRetry(() => structured.invoke([new HumanMessage(prompt)]))
      return { items: response.articles as Item[], perdidas: [] }
    } catch (err) {
      if (grupo.length === 1) {
        const motivo = err instanceof Error ? err.message.split('\n')[0] : String(err)
        console.log(`  ${grupo[0].id} · IRRESOLUBLE: ${motivo.slice(0, 90)}`)
        return { items: [], perdidas: grupo }
      }
      const mitad = Math.floor(grupo.length / 2)
      const [a, b] = await Promise.all([
        clasificarLote(grupo.slice(0, mitad)),
        clasificarLote(grupo.slice(mitad)),
      ])
      return { items: [...a.items, ...b.items], perdidas: [...a.perdidas, ...b.perdidas] }
    }
  }

  const tally = new Map<string, number>()
  let movidas = 0
  let quedan = 0
  let irresolubles = 0
  let unresolved = 0

  for (let i = 0; i < stories.length; i += BATCH_SIZE) {
    const batch = stories.slice(i, i + BATCH_SIZE)
    const { items, perdidas } = await clasificarLote(batch)
    irresolubles += perdidas.length

    const byId = new Map(batch.map(s => [s.id, s]))
    for (const item of items) {
      const story = byId.get(item.articleId)
      if (!story) continue

      const newIssueId = slugToId.get(item.issueSlug)
      if (!newIssueId) {
        unresolved++
        console.log(`  ${story.id} · SIN RESOLVER (tema desconocido: ${item.issueSlug})`)
        continue
      }

      tally.set(item.issueSlug, (tally.get(item.issueSlug) ?? 0) + 1)

      if (newIssueId === story.issueId) {
        quedan++
        continue
      }

      movidas++
      console.log(`  ${idToSlug.get(story.issueId ?? '') ?? '?'} → ${item.issueSlug}`)
      console.log(`    ${story.sourceTitle.slice(0, 88)}`)

      if (APPLY) {
        // El registro va ANTES de la escritura, no despues: si el proceso muere
        // entre las dos, sobra una linea en el archivo (revertir a lo que ya
        // era es inocuo) en vez de faltar una historia movida sin registro.
        appendFileSync(
          LOG_REVERSION,
          JSON.stringify({ storyId: story.id, from: story.issueId, to: newIssueId, ts: new Date().toISOString() }) + '\n',
        )
        await prisma.story.update({
          where: { id: story.id },
          data: { issueId: newIssueId },
        })
      }
    }

    console.log(`  -- lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(stories.length / BATCH_SIZE)} --`)
  }

  if (APPLY && movidas > 0) {
    console.log(`\nRegistro de reversion: ${LOG_REVERSION}`)
    console.log(`  Para deshacer esta corrida:  npm run migration:retema --prefix server -- --revertir ${LOG_REVERSION}`)
  }

  console.log(`\nHistorias movidas de tema: ${movidas}`)
  console.log(`Se quedan donde estaban: ${quedan}`)
  if (irresolubles > 0) {
    console.log(`Irresolubles (quedaron intactas): ${irresolubles}`)
  }
  if (unresolved > 0) console.log(`Sin resolver (se quedan como estaban): ${unresolved}`)
  console.log('\nReparto final del lote revisado:')
  for (const [slug, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slug.padEnd(42)} ${n}`)
  }

  if (!APPLY && movidas > 0) {
    console.log('\nRevisa el reparto de arriba. Si convence, corre:')
    console.log('  npm run migration:retema:apply --prefix server')
  }

  // La tanda siguiente arranca despues de las que se quedaron donde estaban:
  // las movidas ya salieron del conjunto, porque este se define por el tema de
  // origen. Sumar `quedan` evita volver a pagar por las que ya se confirmaron.
  if (LIMIT && stories.length === LIMIT) {
    console.log(`\nPara seguir con la tanda siguiente:  --offset ${OFFSET + quedan} --limit ${LIMIT}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
