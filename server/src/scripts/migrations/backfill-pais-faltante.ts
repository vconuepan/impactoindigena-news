/**
 * backfill-pais-faltante.ts
 *
 * Marca el pais de las historias que quedaron sin el.
 *
 * EL PROBLEMA QUE REPARA. El backfill de agosto (`backfill-country-focus.ts`)
 * solo miro las historias que estaban DENTRO de la seccion geografica: las que
 * ya vivian en un tema de asunto con el pais vacio nunca se tocaron. Medido el
 * 3-sep-2026: de 3.180 publicadas, solo 871 tienen pais — el 72,6% no lo tiene.
 * El efecto visible es que la seccion de Chile muestra 363 historias cuando
 * deberia mostrar mas: se detectaron 47 chilenas repartidas en las otras
 * secciones con el campo vacio.
 *
 * QUE HACE. Dos pasadas.
 *
 *   1. DETERMINISTA, sin modelo. `detectarPais` lee el titular y el resumen y
 *      reconoce el pais cuando esta escrito: una institucion nacional (CONADI
 *      solo existe en Chile), un gentilicio, un toponimo o el nombre del pais.
 *      Validado contra las 871 historias que ya tenian pais: resuelve el 77,2%
 *      con 97,9% de precision, y cuesta cero llamadas.
 *
 *   2. EL MODELO, solo para lo que la primera no resolvio — sobre todo las
 *      ambiguas (dos paises en el mismo texto) y las que nombran el lugar de
 *      un modo que la tabla no cubre.
 *
 * El orden importa: la primera pasada es gratis, auditable y mas precisa que la
 * segunda. Medido sobre las 2.309 sin pais, se lleva 1.440 y le deja 869 al
 * modelo, que baja de 231 llamadas a unas 87.
 *
 * Solo escribe `country_focus`. Nada mas.
 *
 * QUE NO HACE. No toca el tema, ni el estado, ni el titulo, ni la relevancia.
 * Una historia sigue en su seccion tematica y ademas aparece en la de su pais,
 * que es el reparto en dos ejes que ya rige desde agosto.
 *
 * Correr:
 *   npm run migration:pais --prefix server                        # simulacion
 *   npm run migration:pais --prefix server -- --limit 30           # muestra
 *   npm run migration:pais:apply --prefix server -- --limit 200    # aplica una tanda
 *   npm run migration:pais:apply --prefix server                   # aplica todo
 *
 * Deshacer (vuelve a dejar el pais vacio en las que marco esta corrida):
 *   npm run migration:pais:apply --prefix server -- --revertir pais-2026-....jsonl
 */
import 'dotenv/config'
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { getMediumLLM, rateLimitDelay } from '../../services/llm.js'
import { UNTRUSTED_CONTENT_GUARD, sanitizeUntrustedContent } from '../../prompts/shared.js'
import { withRetry } from '../../lib/retry.js'
import { normalizeCountry, BY_NAME } from '../../lib/country-focus.js'
import { detectarPais } from '../../lib/country-detect.js'

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : undefined
const offsetArg = process.argv.indexOf('--offset')
const OFFSET = offsetArg !== -1 ? parseInt(process.argv[offsetArg + 1], 10) : 0
const revertirArg = process.argv.indexOf('--revertir')
const REVERTIR = revertirArg !== -1 ? process.argv[revertirArg + 1] : null

/**
 * Diez por llamada, y SIN el cuerpo crawleado.
 *
 * POR QUE NO VA EL CUERPO, que es el hallazgo que costo la tarde del
 * 3-sep-2026. La primera version mandaba titulo + 2.000 caracteres de
 * `sourceContent` y el modelo devolvia el pais VACIO en 27 de 30 historias,
 * incluidas "In Ghana, larger-than-life coffins" y "China's new cotton law".
 * Aislado por biseccion del prompt sobre las mismas tres historias:
 *
 *   titulo solo ................................ India · Ghana · Ghana
 *   titulo + reglas, sin cuerpo ................ (vacio) · Ghana · Ghana
 *   titulo + reglas + CUERPO ................... (vacio) · (vacio) · (vacio)
 *   titulo + reglas + cuerpo + guard ........... error de parseo (truncamiento)
 *
 * El cuerpo crawleado es ruido —menus, avisos de cookies, texto de
 * navegacion— y diluye la señal que el titular da limpia. Mas contexto
 * empeoro el resultado, que es al reves de lo que uno espera.
 *
 * Se usan en cambio los tres campos limpios que el propio pipeline ya produjo:
 * el titular traducido, el titular de la fuente y el resumen. Siguen derivando
 * de contenido no confiable, asi que conservan el guard y la sanitizacion.
 */
const BATCH_SIZE = 10

/** Rechazados y descartados quedan fuera: nadie los lee y multiplican el costo. */
const LIVE_STATUSES = ['published', 'selected', 'analyzed', 'pre_analyzed'] as const

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
const DIR_LOG = '../.migraciones-log'
mkdirSync(DIR_LOG, { recursive: true })
const LOG_REVERSION = `${DIR_LOG}/pais-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`

/**
 * Prompt propio: pide SOLO el pais.
 *
 * CORTO A PROPOSITO. Una version anterior agregaba ejemplos resueltos ("In
 * Ghana... es Ghana", "Ladakh... es India") y un parrafo advirtiendo que las
 * dos reglas tiran en direcciones opuestas. Con esa version el modelo devolvia
 * vacio en 25 de 30 historias, incluidas las que llevaban el pais en el
 * titular. Medido sobre las MISMAS diez historias, el prompt de abajo acierta
 * 6 y deja vacias 4 que son global o regional de verdad. Los ejemplos
 * resueltos no ayudaron: volvieron cauto al modelo.
 *
 * No reusa el prompt del backfill de agosto porque ese pide tambien el tema, y
 * este script no escribe el tema. Un articulo al que el modelo devuelva un tema
 * invalido no debe costar el pais de sus nueve companeros de lote.
 *
 * Las reglas son las mismas que rigen en produccion (bloque <PAIS> de
 * `CLASSIFICATION_BLOCK`), incluida la mas importante: vacio es una respuesta
 * correcta y frecuente. Marcar mal manda una historia a la seccion de otro
 * pais; no marcar solo la deja fuera de la suya.
 */
function buildPrompt(stories: { id: string; title: string; sourceTitle: string; summary: string }[]): string {
  const articles = stories
    .map(s => `<ARTICLE id="${s.id}">\n<TITLE>${sanitizeUntrustedContent(s.title)}</TITLE>\n<SOURCE_TITLE>${sanitizeUntrustedContent(s.sourceTitle)}</SOURCE_TITLE>\n<SUMMARY>${sanitizeUntrustedContent(s.summary)}</SUMMARY>\n</ARTICLE>`)
    .join('\n')

  return `<GOAL>
Para cada articulo devuelve el pais de los hechos.
</GOAL>

<PAIS>
REGLA PRINCIPAL: si el titulo o el resumen nombran un pais, una ciudad o una region administrativa, ESE es el pais. No lo dejes vacio.

Deja el campo VACIO solo cuando de verdad no hay un pais: el articulo es global, compara varios paises, o trata de una region que cruza fronteras (la Amazonia, el Pacifico, el Artico).

El nombre de un pueblo NO decide el pais: el mapuche vive en Chile Y en Argentina.
</PAIS>

<ARTICLES>
${UNTRUSTED_CONTENT_GUARD}
${articles}
</ARTICLES>`
}

const schema = z.object({
  articles: z.array(
    z.object({
      articleId: z.string(),
      // SIN `.describe()`. El texto de `.describe()` viaja en la definicion de
      // la funcion, que el modelo lee con MAS peso que el prompt: la version
      // anterior decia "vacio si el articulo no trata de un pais" y devolvia
      // vacio en 30 de 30. Se probo tambien un `.describe()` "neutro"
      // ("Pais de los hechos...") y, medido el 4-sep-2026 sobre las mismas 10
      // historias reales que la prueba suelta clasifica bien, seguia dando
      // vacio en 10 de 10 -- el describe pesa incluso sin mencionar "vacio".
      // Quitarlo del todo (como hace la prueba que funciona) es lo que hizo
      // volver las respuestas. La regla de cuando dejarlo vacio vive en el
      // prompt, no en el esquema.
      country: z.string(),
    }),
  ),
})

async function revertir(archivo: string) {
  if (!existsSync(archivo)) {
    console.error(`No existe el registro: ${archivo}`)
    process.exitCode = 1
    return
  }
  const ids = readFileSync(archivo, 'utf8').split('\n').filter(Boolean).map(l => (JSON.parse(l) as { storyId: string }).storyId)
  const unicos = [...new Set(ids)]
  console.log(APPLY ? '== REVIRTIENDO ==\n' : '== SIMULACION DE REVERSION ==\n')
  console.log(`Historias a dejar sin pais: ${unicos.length}`)
  if (APPLY) {
    await prisma.story.updateMany({ where: { id: { in: unicos } }, data: { countryFocus: null } })
    console.log('Revertidas.')
  } else {
    console.log(`\nPara aplicar:  npm run migration:pais:apply --prefix server -- --revertir ${archivo}`)
  }
}

async function main() {
  if (REVERTIR) return revertir(REVERTIR)

  console.log(APPLY ? '== APLICANDO CAMBIOS ==\n' : '== SIMULACION (no escribe) ==\n')

  const where = { status: { in: [...LIVE_STATUSES] }, countryFocus: null }
  const all = await prisma.story.findMany({
    where,
    select: { id: true, sourceTitle: true, title: true, summary: true, status: true },
    orderBy: { datePublished: 'desc' },
  })

  // Publicadas primero: son las que el lector ve, asi que una muestra con
  // --limit sale de ellas y no de lo recien crawleado.
  const ORDER: Record<string, number> = { published: 0, selected: 1, analyzed: 2, pre_analyzed: 3 }
  all.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9))
  const stories = LIMIT ? all.slice(OFFSET, OFFSET + LIMIT) : all.slice(OFFSET)

  console.log(`Historias vivas sin pais: ${all.length}`)
  if (OFFSET > 0) console.log(`Saltadas por --offset: ${OFFSET}`)
  console.log(`A procesar en esta corrida: ${stories.length}\n`)
  if (stories.length === 0) return

  // ---- Pasada 1: determinista ----
  const tally = new Map<string, number>()
  const porSenal = new Map<string, number>()
  let marcadas = 0
  const pendientes: typeof stories = []

  for (const story of stories) {
    const texto = `${story.title ?? ''} · ${story.sourceTitle} · ${story.summary ?? ''}`
    const det = detectarPais(texto, BY_NAME)
    if (!det.pais) { pendientes.push(story); continue }

    tally.set(det.pais, (tally.get(det.pais) ?? 0) + 1)
    porSenal.set(det.senal, (porSenal.get(det.senal) ?? 0) + 1)
    marcadas++
    if (process.env.DIAG === '1') {
      console.log(`  [codigo] ${det.pais} (${det.senal}: ${det.termino}) · ${(story.title ?? story.sourceTitle).slice(0, 58)}`)
    }
    if (APPLY) {
      appendFileSync(LOG_REVERSION, JSON.stringify({ storyId: story.id, to: det.pais, via: det.senal, ts: new Date().toISOString() }) + '\n')
      await prisma.story.update({ where: { id: story.id }, data: { countryFocus: det.pais } })
    }
  }

  console.log(`Pasada 1 (codigo, sin modelo): ${marcadas} marcadas · ${pendientes.length} quedan para el modelo`)
  for (const [senal, n] of [...porSenal.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${senal.padEnd(12)} ${n}`)
  console.log('')

  if (pendientes.length === 0) {
    console.log('Nada que pedirle al modelo.')
    return
  }

  // ---- Pasada 2: el modelo, solo para lo que quedo ----
  const llm = getMediumLLM()
  const structured = llm.withStructuredOutput(schema, { method: 'functionCalling' })

  type Item = { articleId: string; country: string }
  type Story = (typeof stories)[number]

  /** Si el esquema rechaza la respuesta, parte el grupo y reintenta cada mitad. */
  async function clasificar(grupo: Story[]): Promise<{ items: Item[]; perdidas: Story[] }> {
    const prompt = buildPrompt(grupo.map(s => ({ id: s.id, title: s.title ?? '', sourceTitle: s.sourceTitle, summary: s.summary ?? '' })))
    await rateLimitDelay()
    try {
      const res = await withRetry(() => structured.invoke([new HumanMessage(prompt)]))
      return { items: res.articles as Item[], perdidas: [] }
    } catch (err) {
      if (grupo.length === 1) {
        const motivo = err instanceof Error ? err.message.split('\n')[0] : String(err)
        // El filtro de contenido de Azure rechaza lotes enteros por un solo
        // articulo sensible (paso con una nota sobre confiscacion de tierras en
        // Palestina). No es un fallo del esquema ni del articulo: es politica
        // del proveedor, y la biseccion lo aisla igual que a los demas.
        const filtrado = motivo.includes('content management policy')
        console.log(`  ${grupo[0].id} · ${filtrado ? 'FILTRADO POR AZURE' : 'IRRESOLUBLE'}: ${motivo.slice(0, 70)}`)
        return { items: [], perdidas: grupo }
      }
      const mitad = Math.floor(grupo.length / 2)
      const [a, b] = await Promise.all([clasificar(grupo.slice(0, mitad)), clasificar(grupo.slice(mitad))])
      return { items: [...a.items, ...b.items], perdidas: [...a.perdidas, ...b.perdidas] }
    }
  }

  let sinPais = 0
  let irresolubles = 0
  let porModelo = 0

  for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
    const batch = pendientes.slice(i, i + BATCH_SIZE)
    const { items, perdidas } = await clasificar(batch)
    irresolubles += perdidas.length

    const byId = new Map(batch.map(s => [s.id, s]))
    for (const item of items) {
      const story = byId.get(item.articleId)
      if (!story) continue

      const pais = normalizeCountry(item.country)
      if (process.env.DIAG === '1') {
        console.log(`  [diag] crudo="${item.country}" -> ${pais ?? 'NULL'}  · ${(story.title ?? story.sourceTitle).slice(0, 62)}`)
      }
      if (!pais) { sinPais++; continue }

      tally.set(pais, (tally.get(pais) ?? 0) + 1)
      marcadas++
      porModelo++

      if (APPLY) {
        appendFileSync(LOG_REVERSION, JSON.stringify({ storyId: story.id, to: pais, via: 'modelo', ts: new Date().toISOString() }) + '\n')
        await prisma.story.update({ where: { id: story.id }, data: { countryFocus: pais } })
      }
    }
    const lote = Math.floor(i / BATCH_SIZE) + 1
    const total = Math.ceil(pendientes.length / BATCH_SIZE)
    console.log(`  -- lote ${lote}/${total} · el modelo marco ${porModelo} · sin pais ${sinPais} --`)
  }

  console.log(`\nCon pais asignado: ${marcadas}  (codigo ${marcadas - porModelo} · modelo ${porModelo})`)
  console.log(`Sin pais (global o regional, se dejan vacias): ${sinPais}`)
  if (irresolubles > 0) console.log(`Irresolubles (quedaron intactas): ${irresolubles}`)
  console.log('\nReparto por pais:')
  for (const [p, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${p}  ${n}`)

  if (APPLY && marcadas > 0) {
    console.log(`\nRegistro de reversion: ${LOG_REVERSION}`)
    console.log(`  Para deshacer:  npm run migration:pais:apply --prefix server -- --revertir ${LOG_REVERSION}`)
  }
  if (!APPLY && marcadas > 0) {
    console.log('\nRevisa el reparto. Si convence:')
    console.log('  npm run migration:pais:apply --prefix server -- --limit 200')
  }
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
