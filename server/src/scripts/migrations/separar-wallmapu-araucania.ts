/**
 * Separa Wallmapu de Araucanía en las verticales. Decisión del director,
 * 3-oct-2026: el ámbito de Voces Mapuche es el territorio ancestral entero,
 * Chile y Argentina, del Pacífico al Atlántico. Wallmapu es ese territorio y
 * pertenece a la vertical Pueblo Mapuche; la Araucanía es una región
 * administrativa chilena y es la vertical del territorio con todos sus actores.
 *
 * Hasta hoy la vertical `wallmapu-araucania` se llamaba «Wallmapu / Araucanía»
 * y tenía «wallmapu» entre sus palabras clave, igual que `mapuche`. Una nota
 * del Puelmapu que dijera Wallmapu caía en la vertical regional. Medido el
 * 3-oct-2026 sobre sus 115 notas: 8 entraban solo por «wallmapu» y las 8 eran
 * notas del pueblo (lengua, presos, Llaitul, tropas), no de la región.
 *
 * El slug se conserva: es la URL pública indexada desde septiembre. Cambian
 * nombre, descripción, región y palabras clave de las dos filas. La fuente de
 * verdad de los valores es `seed-communities.ts`, que este script importa; no
 * se duplican acá. El «antes» queda en `.migraciones-log/`.
 *
 *   npx tsx src/scripts/migrations/separar-wallmapu-araucania.ts           # simula
 *   npx tsx src/scripts/migrations/separar-wallmapu-araucania.ts --apply
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import { appendFileSync, mkdirSync } from 'node:fs'
import { communities } from '../seed-communities.js'
import { buildCommunityCondition } from '../../routes/public/communities.js'

const APLICAR = process.argv.includes('--apply')
const SLUGS = ['mapuche', 'wallmapu-araucania'] as const
const prisma = new PrismaClient()

async function publicadasQueEncajan(keywords: string[], issueIds: string[], temas: Set<string>): Promise<number> {
  const cond = buildCommunityCondition(keywords, issueIds, temas).where as Prisma.StoryWhereInput
  return prisma.story.count({ where: { status: 'published', ...cond } })
}

async function main() {
  console.log(APLICAR ? '=== APLICANDO ===\n' : '=== SIMULACION (sin --apply no escribe) ===\n')
  const temas = new Set((await prisma.issue.findMany({ select: { id: true } })).map((i) => i.id))
  const registro: object[] = []

  for (const slug of SLUGS) {
    const objetivo = communities.find((c) => c.slug === slug)
    if (!objetivo) throw new Error(`seed-communities.ts no define la comunidad ${slug}`)
    const actual = await prisma.community.findUnique({ where: { slug } })
    if (!actual) throw new Error(`la comunidad ${slug} no existe en la base`)

    const antes = await publicadasQueEncajan(actual.keywords, actual.issueIds, temas)
    const despues = await publicadasQueEncajan(objetivo.keywords, objetivo.issueIds, temas)

    console.log(slug)
    console.log(`  nombre:      ${actual.name}  ->  ${objetivo.name}`)
    console.log(`  region:      ${actual.region ?? '(sin region)'}  ->  ${objetivo.region ?? '(sin region)'}`)
    console.log(`  palabras:    ${actual.keywords.join(', ')}`)
    console.log(`           ->  ${objetivo.keywords.join(', ')}`)
    console.log(`  publicadas que encajan: ${antes}  ->  ${despues}\n`)

    registro.push({
      slug,
      antes: { name: actual.name, description: actual.description, region: actual.region, keywords: actual.keywords },
      publicadas: { antes, despues },
    })

    if (APLICAR) {
      await prisma.community.update({
        where: { slug },
        data: {
          name: objetivo.name,
          description: objetivo.description,
          region: objetivo.region,
          keywords: objetivo.keywords,
        },
      })
    }
  }

  if (APLICAR) {
    mkdirSync('.migraciones-log', { recursive: true })
    const archivo = `.migraciones-log/separar-wallmapu-araucania-${Date.now()}.jsonl`
    appendFileSync(archivo, registro.map((r) => JSON.stringify(r)).join('\n') + '\n')
    console.log(`el antes quedó registrado en ${archivo}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
