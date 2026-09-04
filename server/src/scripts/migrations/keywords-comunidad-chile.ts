/**
 * keywords-comunidad-chile.ts
 *
 * Le da palabras clave a la comunidad "Pueblos Indigenas de Chile", que no
 * tenia ninguna y por eso quedaba vacia.
 *
 * POR QUE. Desde el arreglo de `buildCommunityCondition`, una comunidad se
 * resuelve por como se la nombra y no por el cajon tematico donde cayo la nota.
 * Las comunidades de PUEBLO y TERRITORIO ya tenian sus palabras; esta se cargo
 * en el seed apuntando al tema `issue-chile-005`, que no existe, y con la lista
 * de palabras vacia. Resultado: cero historias.
 *
 * Simulado antes de aplicar: pasa de 0 a 424 historias publicadas.
 *
 * Correr:
 *   npm run migration:kw-chile --prefix server           # simulacion
 *   npm run migration:kw-chile:apply --prefix server     # aplica
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

/**
 * Los pueblos reconocidos en Chile, mas las instituciones y el territorio que
 * solo existen aca. NO va "chile" a secas: aparece en notas de cualquier pais
 * que lo mencionen de pasada, y para eso ya esta la seccion geografica, que
 * filtra por `countryFocus`.
 */
const KEYWORDS = [
  'mapuche', 'rapa nui', 'aymara', 'atacameño', 'likan antai', 'quechua',
  'colla', 'diaguita', 'kawésqar', 'yagán', 'chango', "selk'nam",
  'huilliche', 'lafkenche', 'pehuenche', 'conadi',
  'pueblos originarios de chile', 'araucanía',
]

async function main() {
  console.log(APPLY ? '== APLICANDO ==\n' : '== SIMULACION (no escribe) ==\n')

  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; keywords: string[] }>>`
    SELECT id, name, keywords FROM communities WHERE slug = 'chile-indigena' LIMIT 1`
  if (!rows.length) {
    console.error('No existe la comunidad chile-indigena.')
    process.exitCode = 1
    return
  }
  console.log(`Comunidad: ${rows[0].name}`)
  console.log(`  palabras ANTES:   ${(rows[0].keywords ?? []).length ? (rows[0].keywords ?? []).join(', ') : '(ninguna)'}`)
  console.log(`  palabras DESPUES: ${KEYWORDS.join(', ')}`)

  const alcance = await prisma.story.count({
    where: {
      status: 'published',
      relevance: { gte: 3 },
      OR: KEYWORDS.flatMap(kw => [
        { title: { contains: kw, mode: 'insensitive' as const } },
        { summary: { contains: kw, mode: 'insensitive' as const } },
        { sourceTitle: { contains: kw, mode: 'insensitive' as const } },
      ]),
    },
  })
  console.log(`  historias que mostraria: ${alcance}`)

  if (!APPLY) {
    console.log('\nSi convence:  npm run migration:kw-chile:apply --prefix server')
    return
  }
  await prisma.$executeRaw`UPDATE communities SET keywords = ${KEYWORDS}::text[] WHERE slug = 'chile-indigena'`
  console.log('\nAplicado.')
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
