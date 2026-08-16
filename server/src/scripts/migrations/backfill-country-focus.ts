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
import { getSmallLLM, rateLimitDelay } from '../../services/llm.js'
import { buildPreassessPrompt } from '../../prompts/preassess.js'
import { preAssessResultSchema } from '../../schemas/llm.js'
import { withRetry } from '../../lib/retry.js'
import { safeParseJson } from '../../services/issue.js'
import {
  normalizeCountry,
  GEOGRAPHIC_ISSUE_SLUGS,
  GEOGRAPHIC_ISSUE_COUNTRY,
} from '../../lib/country-focus.js'

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
const LIVE_STATUSES = ['published', 'selected', 'analyzed', 'pre_analyzed', 'fetched'] as const
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
  const countryByIssueId = new Map(
    geographic.map(i => [i.id, GEOGRAPHIC_ISSUE_COUNTRY[i.slug]]),
  )

  const where = {
    issueId: { in: geographic.map(i => i.id) },
    ...(INCLUDE_REJECTED ? {} : { status: { in: [...LIVE_STATUSES] } }),
  }

  const [stories, totalConIssue] = await Promise.all([
    prisma.story.findMany({
      where,
      select: { id: true, sourceTitle: true, sourceContent: true, issueId: true },
      orderBy: { dateCrawled: 'desc' },
      ...(LIMIT ? { take: LIMIT } : {}),
    }),
    prisma.story.count({ where: { issueId: { in: geographic.map(i => i.id) } } }),
  ])

  const excluidas = totalConIssue - (await prisma.story.count({ where }))
  if (excluidas > 0) {
    console.log(`Excluidas por estado (rechazadas o descartadas): ${excluidas}`)
    console.log('  Se conservan como registro historico; no se muestran, no necesitan tema.')
    console.log('  Para incluirlas de todos modos: --include-rejected\n')
  }
  console.log(`Historias a reclasificar: ${stories.length}`)
  console.log(`Temas de asunto disponibles: ${topicIssues.map(i => i.slug).join(', ')}\n`)

  const llm = getSmallLLM()
  const structured = llm.withStructuredOutput(preAssessResultSchema, { method: 'functionCalling' })

  const tally = new Map<string, number>()
  let moved = 0
  let countryKept = 0
  let unresolved = 0

  for (let i = 0; i < stories.length; i += BATCH_SIZE) {
    const batch = stories.slice(i, i + BATCH_SIZE)
    const prompt = buildPreassessPrompt(
      batch.map(s => ({ id: s.id, title: s.sourceTitle, content: s.sourceContent })),
      topicIssues,
    )

    await rateLimitDelay()
    const response = await withRetry(() => structured.invoke([new HumanMessage(prompt)]))

    const byId = new Map(batch.map(s => [s.id, s]))
    for (const item of response.articles) {
      const story = byId.get(item.articleId)
      if (!story) continue

      const newIssueId = slugToId.get(item.issueSlug)
      if (!newIssueId) {
        // El modelo devolvio un tema que no existe. Se deja como esta: mover a
        // ciegas es peor que no mover.
        unresolved++
        console.log(`  ${story.id} · SIN RESOLVER (tema desconocido: ${item.issueSlug})`)
        continue
      }

      // El pais sale de la seccion de la que viene la historia, no del modelo:
      // estas historias YA estaban clasificadas como de ese pais por un humano
      // o por el pipeline, y ese dato es mejor que una relectura. Si el modelo
      // ademas devuelve pais, solo se usa cuando la seccion no lo declara.
      const country = countryByIssueId.get(story.issueId!) ?? normalizeCountry(item.country)
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
