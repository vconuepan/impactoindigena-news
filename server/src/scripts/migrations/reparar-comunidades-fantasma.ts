/**
 * Repara los `issueIds` de las comunidades que apuntan a temas inexistentes.
 *
 * EL PROBLEMA. `Community.issueIds` es un array de strings sin llave foranea,
 * asi que nada impidio que quedaran dos identificadores de una taxonomia que
 * ya no existe. Medido el 5-sep-2026:
 *
 *   issue-paz-004    en 8 comunidades   (el viejo "Conflictos, Reconciliacion y Paz")
 *   issue-chile-005  en 6 comunidades   (el viejo "Chile Intercultural")
 *
 * Once de las dieciseis comunidades tenian al menos uno. El sintoma se tapo en
 * agosto dandoles palabras clave, porque `buildCommunityCondition` las prefiere
 * cuando existen; la causa siguio ahi, y las comunidades sin palabras clave
 * -"reconciliacion-y-paz" entre ellas- quedaron mudas.
 *
 * LOS DESTINOS. `issue-paz-004` va a DEFENSORES Y PROTECCION, que es su
 * heredero: el tema de la violencia, la criminalizacion y la proteccion de
 * quienes defienden territorio, que es de lo que trataba aquella seccion.
 * `issue-chile-005` va al Chile Intercultural que existe hoy.
 *
 *   npx tsx src/scripts/migrations/reparar-comunidades-fantasma.ts           # simula
 *   npx tsx src/scripts/migrations/reparar-comunidades-fantasma.ts --apply
 */
import { PrismaClient } from '@prisma/client'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const APLICAR = process.argv.includes('--apply')
const prisma = new PrismaClient()

/** Identificador muerto -> slug del tema que lo hereda. */
const HERENCIA: Record<string, string> = {
  'issue-paz-004': 'defensores-y-proteccion',
  'issue-chile-005': 'chile-indigena',
}

async function main(): Promise<void> {
  const issues = await prisma.issue.findMany({ select: { id: true, slug: true, name: true } })
  const porSlug = new Map(issues.map((i) => [i.slug, i]))
  const idsReales = new Set(issues.map((i) => i.id))

  for (const slug of Object.values(HERENCIA)) {
    if (!porSlug.has(slug)) {
      console.error(`el tema heredero "${slug}" no existe`)
      process.exit(1)
    }
  }

  const comunidades = await prisma.community.findMany({
    select: { id: true, slug: true, name: true, issueIds: true, keywords: true },
    orderBy: { slug: 'asc' },
  })

  const logDir = path.resolve(process.cwd(), '.migraciones-log')
  mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, `comunidades-fantasma-${Date.now()}.jsonl`)

  console.log(APLICAR ? '=== APLICANDO ===\n' : '=== SIMULACION (sin --apply no escribe) ===\n')

  let tocadas = 0
  const huerfanos = new Set<string>()

  for (const c of comunidades) {
    const nuevos: string[] = []
    let cambio = false

    for (const id of c.issueIds) {
      if (idsReales.has(id)) {
        nuevos.push(id)
        continue
      }
      const heredero = HERENCIA[id]
      if (!heredero) {
        // Un identificador muerto sin herencia declarada: se deja como esta y
        // se reporta. Borrarlo en silencio perderia la unica pista de que
        // existio.
        huerfanos.add(id)
        nuevos.push(id)
        continue
      }
      const destino = porSlug.get(heredero)!
      if (!nuevos.includes(destino.id)) nuevos.push(destino.id)
      cambio = true
      console.log(`  ${c.slug.padEnd(24)} ${id.padEnd(18)} -> ${destino.name}`)
    }

    if (!cambio) continue
    tocadas++
    if (!APLICAR) continue
    appendFileSync(logFile, JSON.stringify({ id: c.id, slug: c.slug, antes: c.issueIds }) + '\n')
    await prisma.community.update({ where: { id: c.id }, data: { issueIds: nuevos } })
  }

  console.log(`\n${tocadas} comunidades reparadas de ${comunidades.length}`)
  if (huerfanos.size) {
    console.log(`identificadores muertos SIN herencia declarada: ${[...huerfanos].join(', ')}`)
  }
  const sinVia = comunidades.filter((c) => c.keywords.length === 0 && c.issueIds.length === 0)
  if (sinVia.length) {
    console.log(`comunidades sin palabras clave NI temas (quedan mudas): ${sinVia.map((c) => c.slug).join(', ')}`)
  }
  if (APLICAR) console.log(`registro: ${logFile}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
