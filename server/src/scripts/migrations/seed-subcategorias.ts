/**
 * Crea las subcategorias de las seis categorias con volumen para sostenerlas.
 *
 * DE DONDE SALEN. No se inventaron: cada categoria ya declaraba TRES criterios
 * de evaluacion en su pagina, y esos criterios son sus tres ejes. Convertirlos
 * en subcategorias navegables no agrega una taxonomia nueva, hace visible la que
 * ya estaba escrita.
 *
 * POR QUE SEIS Y NO OCHO. Una subcategoria util necesita material propio.
 * Economias (134 publicadas) y Mujeres (146) partidas en tres darian secciones
 * de unas cuarenta historias, que se leen como estantes vacios. Se quedan
 * enteras hasta que crezcan.
 *
 * NO ROMPEN NADA AL NACER. `IssuePage` solo lista las hijas que tienen
 * historias publicadas, asi que mientras esten vacias son invisibles. Y
 * `buildIssueCondition` ya incluye `{ parent: { slug } }`: una historia dentro
 * de una subcategoria sigue apareciendo en su madre y en la portada.
 *
 *   npx tsx src/scripts/migrations/seed-subcategorias.ts           # simula
 *   npx tsx src/scripts/migrations/seed-subcategorias.ts --apply
 */
import { PrismaClient } from '@prisma/client'

const APLICAR = process.argv.includes('--apply')
const prisma = new PrismaClient()

interface Sub {
  name: string
  slug: string
  description: string
}

/** Madre -> sus tres ejes. El slug lleva el prefijo de la madre: es unico y se lee en la URL. */
const SUBCATEGORIAS: Record<string, Sub[]> = {
  'territorio-y-tierras': [
    {
      name: 'Titulación y restitución',
      slug: 'territorio-titulacion',
      description: 'Demarcación, titulación, restitución y ampliación de territorios, y las sentencias que las ordenan o las niegan',
    },
    {
      name: 'Despojo y desalojo',
      slug: 'territorio-despojo',
      description: 'Ocupación, desalojo e invasión de tierras indígenas, y los proyectos extractivos y de infraestructura que las atraviesan',
    },
    {
      name: 'Gobierno del territorio',
      slug: 'territorio-gobierno',
      description: 'Autonomías, cogestión de áreas protegidas y ordenamiento territorial propio',
    },
  ],
  'cambio-climatico': [
    {
      name: 'Bosques y conservación',
      slug: 'clima-bosques',
      description: 'Deforestación, restauración, áreas protegidas y la biodiversidad que sostienen los territorios indígenas',
    },
    {
      name: 'Crisis climática y energía',
      slug: 'clima-crisis',
      description: 'Efectos del cambio climático, transición energética, mercados de carbono y los acuerdos internacionales que los rigen',
    },
    {
      name: 'Saberes ecológicos',
      slug: 'clima-saberes',
      description: 'Conocimiento ecológico tradicional aplicado a la conservación y la adaptación, y su reconocimiento por la ciencia y las instituciones',
    },
  ],
  'consulta-y-consentimiento': [
    {
      name: 'Procesos de consulta',
      slug: 'consulta-procesos',
      description: 'Consultas previas y procesos de consentimiento: su apertura, su desarrollo, su resultado o su ausencia',
    },
    {
      name: 'Fallos y decisiones',
      slug: 'consulta-fallos',
      description: 'Decisiones judiciales y administrativas que anulan, ordenan o interpretan una consulta',
    },
    {
      name: 'Protocolos propios',
      slug: 'consulta-protocolos',
      description: 'Protocolos de consulta que las comunidades adoptan y hacen valer, y los estándares internacionales que los respaldan',
    },
  ],
  'derechos-indigenas': [
    {
      name: 'Salud y servicios',
      slug: 'derechos-salud',
      description: 'Salud intercultural, vivienda, agua, educación y el acceso a los servicios del Estado',
    },
    {
      name: 'Justicia y tribunales',
      slug: 'derechos-justicia',
      description: 'Sentencias, precedentes y mecanismos de rendición de cuentas, incluida la jurisprudencia interamericana',
    },
    {
      name: 'Reconocimiento y política',
      slug: 'derechos-reconocimiento',
      description: 'Reconocimiento constitucional, legislación, representación política e institucionalidad indígena',
    },
  ],
  'defensores-y-proteccion': [
    {
      name: 'Violencia y agresiones',
      slug: 'defensores-violencia',
      description: 'Asesinatos, amenazas, desapariciones y agresiones contra personas defensoras de territorios y derechos',
    },
    {
      name: 'Criminalización',
      slug: 'defensores-criminalizacion',
      description: 'Detenciones, juicios, leyes antiterroristas y estados de excepción aplicados a la protesta y la defensa territorial',
    },
    {
      name: 'Protección y reparación',
      slug: 'defensores-proteccion',
      description: 'Medidas cautelares, el Acuerdo de Escazú, mecanismos nacionales, y la impunidad o la condena de los responsables',
    },
  ],
  'cultura-y-conocimientos-ancestrales': [
    {
      name: 'Lenguas',
      slug: 'cultura-lenguas',
      description: 'Vitalidad, riesgo y revitalización de las lenguas indígenas, y su lugar en la educación y los medios',
    },
    {
      name: 'Arte y creación',
      slug: 'cultura-arte',
      description: 'Literatura, cine, música, artes visuales, arquitectura, gastronomía y deporte tradicional creados por personas y comunidades indígenas',
    },
    {
      name: 'Saberes y transmisión',
      slug: 'cultura-saberes',
      description: 'Patrimonio, memoria, medicina y ciencia propia, educación intercultural y repatriación de bienes y restos ancestrales',
    },
  ],
}

const EVAL_INTRO =
  'Es una subsección: sus historias aparecen también en la categoría madre. Entra cuando el eje del artículo es este:'

async function main(): Promise<void> {
  console.log(APLICAR ? '=== APLICANDO ===\n' : '=== SIMULACION (sin --apply no escribe) ===\n')
  let creadas = 0

  for (const [slugMadre, subs] of Object.entries(SUBCATEGORIAS)) {
    const madre = await prisma.issue.findUnique({ where: { slug: slugMadre }, select: { id: true, name: true } })
    if (!madre) {
      console.error(`la categoria madre "${slugMadre}" no existe`)
      process.exit(1)
    }
    const publicadas = await prisma.story.count({ where: { status: 'published', issueId: madre.id } })
    console.log(`${madre.name} · ${publicadas} publicadas`)

    for (const s of subs) {
      const existe = await prisma.issue.findUnique({ where: { slug: s.slug }, select: { id: true } })
      console.log(`  ${existe ? 'actualiza' : APLICAR ? 'crea     ' : 'crearia  '} ${s.name.padEnd(28)} /${s.slug}`)
      if (!APLICAR) continue
      creadas += existe ? 0 : 1
      const datos = {
        name: s.name,
        description: s.description,
        parentId: madre.id,
        evaluationIntro: EVAL_INTRO,
        evaluationCriteria: JSON.stringify([s.description]),
      }
      await prisma.issue.upsert({
        where: { slug: s.slug },
        update: datos,
        create: { ...datos, slug: s.slug, makeADifference: '[]' },
      })
    }
  }

  const total = await prisma.issue.count({ where: { parentId: { not: null } } })
  console.log(`\n${creadas} creadas · ${total} subcategorias en total`)
  console.log('Nacen vacias, y IssuePage solo lista las hijas con historias: no se ven hasta que se pueblen.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
