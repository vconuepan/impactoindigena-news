/**
 * backfill-country-focus.ts
 *
 * Reparte en dos ejes las historias que hoy tienen el pais guardado como tema.
 *
 * EL PROBLEMA QUE REPARA. Hasta el 15-ago-2026 "Chile Intercultural" competia
 * con los temas de asunto por la unica ranura que hay (`issue_id`), asi que una
 * nota chilena sobre derechos territoriales caia en Chile y desaparecia de
 * Derechos Indigenas. Medido sobre las 2000 historias publicadas: 94 con
 * marcador chileno estaban en las otras tres secciones y ausentes de la suya, y
 * las 367 de Chile no tenian tema de asunto.
 *
 * QUE HACE. Toma las historias cuyo issue es una seccion geografica, les pide
 * al clasificador el tema de asunto que les corresponde, y les escribe el pais
 * en `country_focus`. Al terminar, cada una esta en su tema Y en su seccion de
 * pais.
 *
 * QUE NO HACE. No toca la relevancia, ni el estado, ni el titulo, ni la
 * etiqueta emocional. Solo `issue_id` y `country_focus`. Una historia
 * publicada sigue publicada y con la misma puntuacion.
 *
 * Correr:
 *   npm run migration:backfill-country --prefix server              # simulacion
 *   npm run migration:backfill-country:apply --prefix server        # aplica
 *
 * La simulacion es el modo por defecto a proposito: esto escribe sobre la base
 * de produccion y cuesta llamadas al modelo. Conviene mirar la muestra primero
 * con `--limit 20` y recien despues soltarlo entero.
 */
import 'dotenv/config'
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
import { normalizeCountry, GEOGRAPHIC_ISSUE_SLUGS } from '../../lib/country-focus.js'

/**
 * Prompt propio del backfill: pide SOLO tema y pais.
 *
 * No se reusa `buildPreassessPrompt` porque ese pide ademas puntuar, etiquetar
 * la emocion y encuadrar la narrativa, y este script no escribe ninguna de las
 * tres. Al intentarlo, el modelo devolvia esos campos y omitia el tema — el
 * prompt hablaba de una tarea y el esquema de otra. Las REGLAS de
 * clasificacion son las mismas de produccion: vienen de CLASSIFICATION_BLOCK.
 *
 * El contenido crawleado sigue siendo dato no confiable: se sanitiza y se
 * precede del guard, igual que en produccion (.context/prompting.md).
 */
function buildBackfillPrompt(
  stories: { id: string; title: string; content: string }[],
  issues: IssueForPrompt[],
): string {
  const articles = stories
    .map(
      s => `<ARTICLE id="${s.id}">\n<TITLE>${sanitizeUntrustedContent(s.title)}</TITLE>\n<CONTENT>${sanitizeUntrustedContent(s.content.slice(0, 4000))}</CONTENT>\n</ARTICLE>`,
    )
    .join('\n')

  return `<ROLE>
Clasificas articulos de prensa sobre pueblos indigenas por su asunto central y por el pais del que tratan.
</ROLE>

<GOAL>
Para cada articulo devuelve exactamente dos datos: el slug del tema que le corresponde y el pais. Nada mas.
</GOAL>

${formatIssuesBlock(issues)}

${CLASSIFICATION_BLOCK}

<ARTICLES>
${UNTRUSTED_CONTENT_GUARD}
${articles}
</ARTICLES>`
}

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : undefined
const BATCH_SIZE = 10

/**
 * Estados que se reclasifican.
 *
 * `rejected` y `trashed` quedan FUERA, y esa exclusion es la diferencia entre
 * un backfill de minutos y uno absurdo. Medido en produccion el 16-ago-2026:
 * de las 12.827 historias con el issue de Chile, 12.351 estan rechazadas y
 * solo 416 publicadas. Reclasificar el archivo de rechazos serian ~1.240
 * llamadas al modelo para ordenar articulos que nadie va a leer — los
 * rechazados se conservan como registro historico, no como contenido.
 *
 * `--include-rejected` existe por si alguna vez hace falta, pero el default
 * correcto es este.
 */
// `fetched` tambien queda fuera: esas historias aun no pasan por el
// pre-assessment, asi que el pipeline nuevo — ya desplegado — les asignara
// tema y pais solo cuando les llegue el turno. Backfillearlas seria hacer el
// mismo trabajo dos veces.
const LIVE_STATUSES = ['published', 'selected', 'analyzed', 'pre_analyzed'] as const
const INCLUDE_REJECTED = process.argv.includes('--include-rejected')

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  console.log(APPLY ? '== APLICANDO CAMBIOS ==' : '== SIMULACION (no escribe) ==\n')

  const issues = (
    await prisma.issue.findMany({
      select: { id: true, slug: true, name: true, description: true, evaluationCriteria: true },
    })
  ).map(i => ({ ...i, evaluationCriteria: safeParseJson<string[]>(i.evaluationCriteria, []) }))

  const geographic = issues.filter(i => GEOGRAPHIC_ISSUE_SLUGS.includes(i.slug as never))
  const topicIssues = issues.filter(i => !GEOGRAPHIC_ISSUE_SLUGS.includes(i.slug as never))

  if (geographic.length === 0) {
    console.log('No hay secciones geograficas en la base. Nada que hacer.')
    return
  }
  if (topicIssues.length === 0) {
    console.error('No quedan temas de asunto a los que mover las historias. Abortando.')
    process.exitCode = 1
    return
  }

  const slugToId = new Map(topicIssues.map(i => [i.slug, i.id]))
  const where = {
    issueId: { in: geographic.map(i => i.id) },
    ...(INCLUDE_REJECTED ? {} : { status: { in: [...LIVE_STATUSES] } }),
  }

  const [all, totalConIssue] = await Promise.all([
    prisma.story.findMany({
      where,
      select: { id: true, sourceTitle: true, sourceContent: true, issueId: true, status: true },
      orderBy: { dateCrawled: 'desc' },
    }),
    prisma.story.count({ where: { issueId: { in: geographic.map(i => i.id) } } }),
  ])

  // Publicadas primero: son las que el lector ve, asi que una muestra con
  // --limit debe estar hecha de ellas y no de lo recien crawleado, que es
  // mayormente ruido de relevancia 1-2.
  const ORDER: Record<string, number> = { published: 0, selected: 1, analyzed: 2, pre_analyzed: 3 }
  all.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9))
  const stories = LIMIT ? all.slice(0, LIMIT) : all

  const excluidas = totalConIssue - all.length
  if (excluidas > 0) {
    console.log(`Excluidas por estado (rechazadas o descartadas): ${excluidas}`)
    console.log('  Se conservan como registro historico; no se muestran, no necesitan tema.')
    console.log('  Para incluirlas de todos modos: --include-rejected\n')
  }
  console.log(`Historias a reclasificar: ${stories.length}`)
  console.log(`Temas de asunto disponibles: ${topicIssues.map(i => i.slug).join(', ')}\n`)

  // El mismo modelo que usa el preassess de produccion (analysis.ts:199). El
  // chico se probo primero y devolvia narrativeFrame invalido en articulos de
  // relevancia 1-2, abortando el lote entero por validacion.
  const llm = getMediumLLM()

  // Esquema PROPIO del backfill: solo los dos campos que este script escribe.
  // El de produccion exige ademas rating, emotionTag y narrativeFrame, y con
  // el, UN articulo que respondiera narrativeFrame="calm" invalidaba el lote
  // entero de 10 por un campo que aca ni se mira — paso dos veces al simular.
  // `issueSlug` va como ENUM, y las dos alternativas se midieron sobre las 449
  // historias reales el 16-ago:
  //
  //   string libre → 98 resueltas, 351 sin tema (el modelo responde "" y se
  //                  descarta el articulo)
  //   enum         → 308 resueltas, pero 14 de 45 lotes caidos: un solo ""
  //                  invalida la respuesta entera y arrastra a sus 9 companeros
  //
  // El enum resuelve tres veces mas, asi que se queda, y el lote caido se
  // arregla partiendolo en dos hasta aislar al articulo culpable (ver
  // `clasificarLote`). Lo mejor de ambos: el modelo obligado a elegir, y la
  // perdida acotada al articulo que falla.
  const slugs = topicIssues.map(i => i.slug) as [string, ...string[]]
  const backfillSchema = z.object({
    articles: z.array(
      z.object({
        articleId: z.string(),
        issueSlug: z.enum(slugs).describe('Slug del tema, tomado de la lista <ISSUES>'),
        country: z.string().describe('Pais del que trata el articulo, en español; vacio si no trata de un pais'),
      }),
    ),
  })
  const structured = llm.withStructuredOutput(backfillSchema, { method: 'functionCalling' })

  const tally = new Map<string, number>()
  let moved = 0
  let countryKept = 0
  let unresolved = 0

  let irresolubles = 0

  type Item = { articleId: string; issueSlug: string; country: string }
  type Story = (typeof stories)[number]

  /**
   * Clasifica un grupo y, si el modelo devuelve algo que el esquema rechaza,
   * lo parte en dos y reintenta cada mitad.
   *
   * El enum obliga al modelo a elegir un tema real, pero basta UN articulo al
   * que responda "" para invalidar la respuesta completa. Sin biseccion eso
   * costaba las 10 historias del lote; con ella, la busqueda binaria aisla al
   * culpable en ~4 llamadas y las otras 9 se procesan igual. Un grupo de 1 que
   * falla es el articulo irresoluble: se deja como esta, porque mover a ciegas
   * es peor que no mover.
   */
  async function clasificarLote(grupo: Story[]): Promise<{ items: Item[]; perdidas: Story[] }> {
    const prompt = buildBackfillPrompt(
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

      // El pais lo decide el MODELO, que lee el articulo.
      //
      // La primera version heredaba el pais de la seccion de origen, con el
      // argumento de que esas historias "ya estaban clasificadas como de ese
      // pais". La simulacion del 16-ago refuto esa premisa en la primera
      // corrida: marcaba CL a "Renovaran comunidades indigenas ocho Consejos
      // Regionales de Puebla" y a una nota del Senado peruano. La evidencia ya
      // estaba en el diagnostico y no la lei bien — la seccion de Chile
      // contenia una nota sobre un puente en Costa Rica. Heredar el pais era
      // propagar precisamente el error que este trabajo viene a corregir.
      //
      // Si el modelo no reconoce pais, queda null: la historia no aparece en
      // ninguna seccion de pais, que es preferible a aparecer en la equivocada.
      const country = normalizeCountry(item.country)
      if (country) countryKept++

      tally.set(item.issueSlug, (tally.get(item.issueSlug) ?? 0) + 1)
      moved++
      console.log(`  ${story.id} · ${item.issueSlug} · ${country ?? 'sin pais'}`)
      console.log(`    ${story.sourceTitle.slice(0, 88)}`)

      if (APPLY) {
        await prisma.story.update({
          where: { id: story.id },
          data: { issueId: newIssueId, countryFocus: country },
        })
      }
    }

    console.log(`  -- lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(stories.length / BATCH_SIZE)} --`)
  }

  console.log(`\nHistorias movidas a un tema: ${moved}`)
  if (irresolubles > 0) {
    console.log(`Irresolubles (quedaron intactas): ${irresolubles}`)
    console.log('  El modelo no devolvio un tema valido ni al aislarlas de a una.')
  }
  console.log(`Con pais asignado: ${countryKept}`)
  if (unresolved > 0) console.log(`Sin resolver (se quedan como estaban): ${unresolved}`)
  console.log('\nReparto por tema:')
  for (const [slug, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slug.padEnd(42)} ${n}`)
  }

  if (!APPLY && moved > 0) {
    console.log('\nRevisa el reparto de arriba. Si convence, corre:')
    console.log('  npm run migration:backfill-country:apply --prefix server')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
