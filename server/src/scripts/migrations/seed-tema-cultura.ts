/**
 * seed-tema-cultura.ts
 *
 * Crea el tema "Cultura y Conocimientos Ancestrales" y acota "Economias
 * Indigenas" a lo que su nombre dice.
 *
 * EL PROBLEMA QUE REPARA. El clasificador recibia tres temas de asunto —clima,
 * derechos y economias— y el prompt de pre-assessment le pide puntuar alto la
 * lengua, el arte, la literatura, el patrimonio y la arqueologia. Ese material
 * entra al sitio todos los dias y no tenia tema propio, asi que caia en
 * Economias, el unico cuya descripcion lo admitia: su primer criterio decia
 * "Impacto economico Y SOCIAL en comunidades indigenas". Medido el 1-sep-2026
 * sobre las 200 historias mas recientes de esa seccion: 62 eran economicas, 31
 * limitrofes y 107 no lo eran (poesia, museos, powwows, cine, deporte).
 *
 * QUE HACE. Dos escrituras, las dos idempotentes:
 *   1. Crea el issue de cultura si no existe (si existe, actualiza sus textos).
 *   2. Reescribe descripcion y criterios de Economias para que el clasificador
 *      lea "actividad economica" donde antes leia "impacto social".
 *
 * QUE NO HACE. No mueve ninguna historia. Eso es el paso siguiente y vive en
 * `retema-historias.ts`, que necesita que este tema exista para poder correr.
 *
 * Correr:
 *   npm run migration:seed-cultura --prefix server           # simulacion
 *   npm run migration:seed-cultura:apply --prefix server     # aplica
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

export const CULTURA_SLUG = 'cultura-y-conocimientos-ancestrales'
export const ECONOMIAS_SLUG = 'desarrollo-sostenible-y-autodeterminado'

const CULTURA = {
  name: 'Cultura y Conocimientos Ancestrales',
  slug: CULTURA_SLUG,
  description:
    'Lenguas, arte, literatura, patrimonio, memoria y conocimiento ancestral de los pueblos indígenas',
  intro:
    'Los pueblos indígenas sostienen una parte decisiva de la diversidad lingüística y del conocimiento vivo del planeta: lenguas que no se escriben en ningún otro lugar, medicina y agricultura que se corrigen generación tras generación, y una producción contemporánea de literatura, cine, música y arte que no es herencia sino obra en curso. Esta sección cubre esa producción y ese saber.',
  evaluationIntro: 'Evaluamos la relevancia de las noticias de esta categoría según tres criterios:',
  evaluationCriteria: [
    'Vitalidad o riesgo de una lengua, un saber, una práctica o un patrimonio indígena',
    'Obra creada por personas o comunidades indígenas: literatura, cine, música, artes visuales, arquitectura, gastronomía y deporte tradicional',
    'Transmisión del conocimiento ancestral: educación intercultural, medicina y ciencia propia, y su reconocimiento por instituciones',
  ],
  makeADifference: [] as { label: string; url: string }[],
}

/**
 * Criterios nuevos de Economias.
 *
 * El cambio que hace el trabajo es sacar la palabra "social" del primer
 * criterio: ese adjetivo bastaba para que un festival o un museo entraran, y
 * los criterios SI llegan al clasificador (`formatIssuesBlock`). Los tres
 * hablan ahora de ingreso, empleo, mercado y financiamiento, que es lo que la
 * seccion promete.
 */
const ECONOMIAS = {
  description:
    'Empresas, cooperativas y emprendimiento de los pueblos indígenas: empleo, comercio, financiamiento y cadenas de suministro',
  evaluationCriteria: [
    'Impacto económico medible en comunidades indígenas: ingreso, empleo, ventas, acceso a financiamiento o a mercados',
    'Innovación en modelos de negocio que integran valores culturales y gestión comunitaria',
    'Políticas, compras públicas o marcos de cadena de suministro que facilitan o dificultan el emprendimiento indígena',
  ],
}

async function main() {
  console.log(APPLY ? '== APLICANDO CAMBIOS ==\n' : '== SIMULACION (no escribe) ==\n')

  const existente = await prisma.issue.findUnique({ where: { slug: CULTURA_SLUG } })
  console.log(existente ? `Tema de cultura: YA EXISTE (${existente.id}) — se actualizan sus textos` : 'Tema de cultura: se CREA')
  console.log(`  nombre: ${CULTURA.name}`)
  console.log(`  slug:   ${CULTURA.slug}`)
  for (const c of CULTURA.evaluationCriteria) console.log(`  criterio: ${c}`)

  const economias = await prisma.issue.findUnique({ where: { slug: ECONOMIAS_SLUG } })
  if (!economias) {
    console.error(`\nNo existe el tema ${ECONOMIAS_SLUG}. Abortando: el slug cambio y hay que revisarlo a mano.`)
    process.exitCode = 1
    return
  }
  console.log(`\nTema de economias: ${economias.name} (${economias.id})`)
  console.log(`  descripcion ANTES:  ${economias.description}`)
  console.log(`  descripcion DESPUES: ${ECONOMIAS.description}`)
  console.log(`  criterios ANTES:  ${economias.evaluationCriteria}`)
  console.log(`  criterios DESPUES: ${JSON.stringify(ECONOMIAS.evaluationCriteria)}`)

  if (!APPLY) {
    console.log('\nSi convence, corre:')
    console.log('  npm run migration:seed-cultura:apply --prefix server')
    return
  }

  const data = {
    name: CULTURA.name,
    description: CULTURA.description,
    intro: CULTURA.intro,
    evaluationIntro: CULTURA.evaluationIntro,
    evaluationCriteria: JSON.stringify(CULTURA.evaluationCriteria),
    makeADifference: JSON.stringify(CULTURA.makeADifference),
  }
  const creado = await prisma.issue.upsert({
    where: { slug: CULTURA_SLUG },
    create: { slug: CULTURA_SLUG, ...data },
    update: data,
  })
  console.log(`\nTema de cultura listo: ${creado.id}`)

  await prisma.issue.update({
    where: { slug: ECONOMIAS_SLUG },
    data: {
      description: ECONOMIAS.description,
      evaluationCriteria: JSON.stringify(ECONOMIAS.evaluationCriteria),
    },
  })
  console.log('Economias Indigenas acotada a actividad economica.')
  console.log('\nPaso siguiente — mover las historias mal ubicadas:')
  console.log('  npm run migration:retema --prefix server              # simulacion')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
