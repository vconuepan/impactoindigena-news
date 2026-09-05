/**
 * Asigna a cada historia la subcategoria que le corresponde DENTRO de su
 * categoria actual.
 *
 * ES UN SEGUNDO PASO, y por eso existe aparte del retema. El clasificador
 * principal elige entre las ocho categorias madre; aqui el modelo ya sabe que
 * la historia es de Territorio y solo decide cual de sus tres ejes. Ofrecer las
 * veintiseis de una vez pondria al modelo a comparar cosas que no compiten:
 * "Territorio" contra "Consulta" es una pregunta, "Territorio" contra
 * "Titulacion y restitucion" es otra.
 *
 * NO SE PIERDE NADA AL MOVER. `buildIssueCondition` incluye
 * `{ parent: { slug } }`, asi que una historia dentro de una subcategoria
 * sigue apareciendo en su madre, en la portada y en la seccion geografica que
 * le toque por pais.
 *
 * PUEDE NO ELEGIR. El esquema admite `null`: una historia que no calza con
 * ninguno de los tres ejes se queda en la madre, que es lo correcto. Forzar
 * una subcategoria para todo llenaria las subsecciones de material que no les
 * pertenece.
 *
 *   npx tsx src/scripts/migrations/subclasificar-historias.ts --madre territorio-y-tierras --limit 30
 *   npx tsx src/scripts/migrations/subclasificar-historias.ts --madre territorio-y-tierras --apply
 *   npx tsx src/scripts/migrations/subclasificar-historias.ts --revertir <archivo.jsonl> --apply
 */
import { PrismaClient } from '@prisma/client'
import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { getMediumLLM, rateLimitDelay } from '../../services/llm.js'
import { withRetry } from '../../lib/retry.js'
import { sanitizeUntrustedContent, UNTRUSTED_CONTENT_GUARD } from '../../prompts/shared.js'

const args = process.argv.slice(2)
const APLICAR = args.includes('--apply')
const madreArg = args.indexOf('--madre')
const MADRE = madreArg !== -1 ? args[madreArg + 1] : null
const limitArg = args.indexOf('--limit')
const LIMITE = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : undefined
const revArg = args.indexOf('--revertir')
const REVERTIR = revArg !== -1 ? args[revArg + 1] : null

/** Cinco por llamada, como el retema: con diez la respuesta se truncaba. */
const LOTE = 5
const CONTENT_MAX = 2_500

const prisma = new PrismaClient()

async function revertir(archivo: string): Promise<void> {
  if (!existsSync(archivo)) {
    console.error(`no existe el registro: ${archivo}`)
    process.exit(1)
  }
  const filas = readFileSync(archivo, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { storyId: string; antes: string })
    .reverse() // si una historia se movio dos veces, gana el valor mas antiguo
  const vistas = new Set<string>()
  let n = 0
  for (const f of filas) {
    if (vistas.has(f.storyId)) continue
    vistas.add(f.storyId)
    console.log(`  ${APLICAR ? 'restaura' : 'restauraria'} ${f.storyId}`)
    if (APLICAR) {
      await prisma.story.update({ where: { id: f.storyId }, data: { issueId: f.antes } })
      n++
    }
  }
  console.log(`\n${APLICAR ? n : vistas.size} historias`)
}

function buildPrompt(
  stories: { id: string; title: string; content: string }[],
  madre: { name: string },
  hijas: { slug: string; name: string; description: string }[],
): string {
  const opciones = hijas
    .map((h) => `<SUBSECCION slug="${h.slug}">\n<NOMBRE>${h.name}</NOMBRE>\n<ALCANCE>${h.description}</ALCANCE>\n</SUBSECCION>`)
    .join('\n')
  const articles = stories
    .map(
      (s) =>
        `<ARTICLE id="${s.id}">\n<TITLE>${sanitizeUntrustedContent(s.title)}</TITLE>\n<CONTENT>${sanitizeUntrustedContent(s.content.slice(0, CONTENT_MAX))}</CONTENT>\n</ARTICLE>`,
    )
    .join('\n')

  return `<ROLE>
Ordenas articulos de prensa sobre pueblos indigenas dentro de una seccion que ya esta decidida.
</ROLE>

<GOAL>
Todos estos articulos pertenecen a la seccion "${madre.name}". Eso NO se discute y no es lo que se pregunta.

Para cada uno devuelve el slug de la subseccion que le corresponde, o null.

Devuelve null cuando el articulo pertenece a la seccion pero no encaja con claridad en ninguna de las subsecciones. Es una respuesta correcta y frecuente: la historia se queda en la seccion, que es donde debe estar. Forzar una subseccion para todo las llena de material que no les pertenece.

Elige por el EJE del articulo, no por las palabras que aparecen en el.
</GOAL>

<SUBSECCIONES>
${opciones}
</SUBSECCIONES>

<ARTICLES>
${UNTRUSTED_CONTENT_GUARD}
${articles}
</ARTICLES>`
}

async function main(): Promise<void> {
  if (REVERTIR) return revertir(REVERTIR)
  if (!MADRE) {
    console.error('falta --madre <slug>')
    process.exit(1)
  }

  const madre = await prisma.issue.findUnique({
    where: { slug: MADRE },
    select: { id: true, name: true, children: { select: { id: true, slug: true, name: true, description: true } } },
  })
  if (!madre) {
    console.error(`no existe la categoria "${MADRE}"`)
    process.exit(1)
  }
  if (!madre.children.length) {
    console.error(`"${MADRE}" no tiene subcategorias`)
    process.exit(1)
  }

  const stories = await withRetry(() => prisma.story.findMany({
    where: { issueId: madre.id, status: 'published' },
    select: { id: true, sourceTitle: true, sourceContent: true },
    orderBy: { datePublished: 'desc' },
    ...(LIMITE ? { take: LIMITE } : {}),
  }))

  console.log(`${madre.name} · ${stories.length} historias · ${madre.children.length} subsecciones`)
  console.log(`  ${madre.children.map((c) => c.slug).join(' · ')}`)
  console.log(APLICAR ? '\n=== APLICANDO ===\n' : '\n=== SIMULACION (sin --apply no escribe) ===\n')

  const porSlug = new Map(madre.children.map((c) => [c.slug, c]))
  const slugs = madre.children.map((c) => c.slug) as [string, ...string[]]
  const schema = z.object({
    articles: z.array(
      z.object({
        articleId: z.string(),
        // Nullable a proposito: ver la nota de cabecera.
        subSlug: z.enum(slugs).nullable(),
      }),
    ),
  })
  const structured = getMediumLLM().withStructuredOutput(schema, { method: 'functionCalling' })

  const logDir = path.resolve(process.cwd(), '.migraciones-log')
  mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, `subclasificar-${MADRE}-${Date.now()}.jsonl`)

  const reparto = new Map<string, number>()
  let movidas = 0
  let irresolubles = 0

  type Story = (typeof stories)[number]

  /** Biseca cuando el esquema rechaza la respuesta, igual que el retema. */
  async function clasificar(grupo: Story[]): Promise<{ articleId: string; subSlug: string | null }[]> {
    const prompt = buildPrompt(
      grupo.map((s) => ({ id: s.id, title: s.sourceTitle ?? '', content: s.sourceContent ?? '' })),
      madre!,
      madre!.children,
    )
    await rateLimitDelay()
    try {
      const r = await withRetry(() => structured.invoke([new HumanMessage(prompt)]))
      return r.articles
    } catch (err) {
      if (grupo.length === 1) {
        irresolubles++
        return []
      }
      const mitad = Math.floor(grupo.length / 2)
      const [a, b] = await Promise.all([clasificar(grupo.slice(0, mitad)), clasificar(grupo.slice(mitad))])
      return [...a, ...b]
    }
  }

  for (let i = 0; i < stories.length; i += LOTE) {
    const grupo = stories.slice(i, i + LOTE)
    const items = await clasificar(grupo)
    console.log(`  -- lote ${Math.floor(i / LOTE) + 1}/${Math.ceil(stories.length / LOTE)} --`)

    for (const it of items) {
      const destino = it.subSlug ? porSlug.get(it.subSlug) : null
      reparto.set(it.subSlug ?? '(se queda en la madre)', (reparto.get(it.subSlug ?? '(se queda en la madre)') ?? 0) + 1)
      if (!destino) continue
      const s = grupo.find((x) => x.id === it.articleId)
      console.log(`     ${destino.name.padEnd(28)} ${String(s?.sourceTitle ?? '').slice(0, 62)}`)
      movidas++
      if (!APLICAR) continue
      appendFileSync(logFile, JSON.stringify({ storyId: it.articleId, antes: madre.id, a: destino.slug }) + '\n')
      // Con reintento: la corrida completa dura mas de media hora y Azure
      // PostgreSQL cierra la conexion antes de terminar (P1017, "server has
      // closed the connection"). Paso el 5-sep-2026 con 78 de 2.894 movidas.
      // Reanudar es barato -el script solo toma historias que siguen en la
      // madre- pero perder el lote en curso no tiene por que pasar.
      await withRetry(() =>
        prisma.story.update({ where: { id: it.articleId }, data: { issueId: destino.id } }),
      )
    }
  }

  console.log(`\n${movidas} historias a una subseccion · ${irresolubles} irresolubles\n`)
  console.log('reparto:')
  for (const [k, n] of [...reparto].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`)
  if (APLICAR) console.log(`\nregistro: ${logFile}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
