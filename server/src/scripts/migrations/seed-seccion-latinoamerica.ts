/**
 * seed-seccion-latinoamerica.ts
 *
 * Crea la seccion geografica "Latinoamerica".
 *
 * QUE ES UNA SECCION GEOGRAFICA. Una que agrupa por pais y no por asunto. Se
 * alimenta de `Story.countryFocus`, no de `Story.issueId`, asi que una historia
 * entra aca SIN dejar su tema: una nota peruana de derechos esta en Derechos
 * Indigenas Y en Latinoamerica. El clasificador nunca la ve como opcion —
 * `GEOGRAPHIC_ISSUE_SLUGS` la filtra— porque ofrecerle un tema con forma de
 * pais mientras se le pide clasificar por asunto es una contradiccion.
 *
 * Los paises que la alimentan viven en `REGIONS.abyaYala`, en el codigo.
 *
 * Correr:
 *   npm run migration:seed-latam --prefix server           # simulacion
 *   npm run migration:seed-latam:apply --prefix server     # aplica
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { REGIONS } from '../../lib/country-focus.js'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

const LATAM = {
  // El slug se conserva: renombrar la seccion no justifica romper los enlaces
  // que ya existen ni montar un 301 para una ruta que sigue siendo descriptiva.
  name: 'Abya Yala',
  slug: 'latinoamerica',
  description: 'Pueblos indígenas del continente americano, de Alaska a Tierra del Fuego',
  intro:
    'Los pueblos indígenas de América Latina y el Caribe son más de ochocientos, hablan cientos de lenguas y sostienen algunos de los territorios mejor conservados del continente. Esta sección reúne lo que ocurre en la región completa: las mismas historias que aparecen en su tema, vistas desde el mapa.',
  evaluationIntro: 'Esta sección agrupa por geografía, no por tema. Una historia entra cuando los hechos ocurren en un país de la región:',
  evaluationCriteria: [
    'Los hechos ocurren en México, Centroamérica, el Caribe o Sudamérica',
    'Cada historia conserva su tema: aparece aquí y en su sección temática a la vez',
    'Las noticias globales o que cruzan varias regiones no entran, aunque mencionen la región',
  ],
  makeADifference: [] as { label: string; url: string }[],
}

async function main() {
  console.log(APPLY ? '== APLICANDO ==\n' : '== SIMULACION (no escribe) ==\n')

  const existente = await prisma.issue.findUnique({ where: { slug: LATAM.slug } })
  console.log(existente ? `Seccion: YA EXISTE (${existente.id}) — se actualizan sus textos` : 'Seccion: se CREA')
  console.log(`  nombre: ${LATAM.name}`)
  console.log(`  paises que la alimentan: ${REGIONS.abyaYala.length} — ${REGIONS.abyaYala.join(', ')}`)

  const alcance = await prisma.story.count({
    where: { status: 'published', slug: { not: null }, countryFocus: { in: [...REGIONS.abyaYala] } },
  })
  console.log(`  historias publicadas que mostraria: ${alcance}`)

  if (!APPLY) {
    console.log('\nSi convence:  npm run migration:seed-latam:apply --prefix server')
    return
  }

  const data = {
    name: LATAM.name,
    description: LATAM.description,
    intro: LATAM.intro,
    evaluationIntro: LATAM.evaluationIntro,
    evaluationCriteria: JSON.stringify(LATAM.evaluationCriteria),
    makeADifference: JSON.stringify(LATAM.makeADifference),
  }
  const creada = await prisma.issue.upsert({
    where: { slug: LATAM.slug },
    create: { slug: LATAM.slug, ...data },
    update: data,
  })
  console.log(`\nSeccion lista: ${creada.id}`)
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
