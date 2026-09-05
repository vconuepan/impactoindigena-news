/**
 * Crea las cinco secciones geograficas que faltan para cubrir el mundo.
 *
 * El eje geografico tenia tres escalas -Wallmapu, Chile, Abya Yala- y despues
 * un salto al vacio: las 529 historias publicadas fuera de America no tenian
 * donde vivir. Estas cinco cierran el mapa.
 *
 * LA NOMENCLATURA. Los nombres siguen a los grupos regionales de la ONU donde
 * describen bien lo que contienen (Africa, Asia y el Pacifico, Europa
 * Oriental) y se apartan donde no. Medido el 5-sep-2026 sobre las 2.850
 * historias con pais, adoptar los cinco grupos tal cual dejaba 711 historias
 * de pueblos indigenas -inuit, Primeras Naciones, nativos de Estados Unidos,
 * aborigenes australianos, maories y sami- en una seccion llamada "Europa
 * Occidental y otros Estados". De ahi que Australia y Aotearoa y Sapmi salgan
 * de ese "otros", y que Abya Yala no se parta en GRULAC mas WEOG.
 *
 * Los paises de cada una viven en `REGIONS`, en el codigo, y se conectan por
 * `GEOGRAPHIC_ISSUE_COUNTRIES`.
 *
 *   npx tsx src/scripts/migrations/seed-secciones-geograficas.ts           # simula
 *   npx tsx src/scripts/migrations/seed-secciones-geograficas.ts --apply
 */
import { PrismaClient } from '@prisma/client'
import { REGIONS } from '../../lib/country-focus.js'

const APLICAR = process.argv.includes('--apply')
const prisma = new PrismaClient()

const EVAL_INTRO =
  'Esta seccion agrupa por geografia, no por tema. Una historia entra cuando los hechos ocurren en la region:'

interface Seccion {
  name: string
  slug: string
  description: string
  intro: string
  criterios: string[]
  paises: readonly string[]
}

const SECCIONES: Seccion[] = [
  {
    name: 'África',
    slug: 'africa',
    description: 'Pueblos indígenas y comunidades locales del continente africano',
    intro:
      'Los pueblos indígenas de África —san, khoi, ogiek, maasai, batwa, amazigh, hadza, entre muchos otros— son en buena parte pastores, cazadores recolectores y comunidades cuyo derecho a la tierra choca con las fronteras heredadas de la colonia y con la conservación que los expulsa de los parques. Esta sección reúne lo que ocurre en el continente.',
    criterios: [
      'Los hechos ocurren en un país del continente africano',
      'Cada historia conserva su tema: aparece aquí y en su sección temática a la vez',
      'La Comisión Africana de Derechos Humanos y de los Pueblos es la referencia regional del sistema de derechos',
    ],
    paises: REGIONS.africa,
  },
  {
    name: 'Asia y el Pacífico',
    slug: 'asia-pacifico',
    description: 'Pueblos indígenas y tribales de Asia y de las islas del Pacífico',
    intro:
      'Asia concentra la mayor población indígena del planeta: los adivasi de India, los pueblos de las cordilleras de Filipinas, los dayak de Borneo, los ainu de Japón, los montañeses del sudeste asiático. A ellos se suman las naciones de las islas del Pacífico, cuyos pueblos enfrentan la desaparición física de su territorio por el alza del mar. Esta sección reúne las dos realidades, como lo hace el grupo regional de la ONU.',
    criterios: [
      'Los hechos ocurren en un país de Asia o en una nación insular del Pacífico',
      'Cada historia conserva su tema: aparece aquí y en su sección temática a la vez',
      'Australia y Aotearoa tienen sección propia y no entran aquí',
    ],
    paises: REGIONS.asiaPacifico,
  },
  {
    name: 'Australia y Aotearoa',
    slug: 'australia-aotearoa',
    description:
      'Pueblos aborígenes, isleños del Estrecho de Torres y maoríes',
    intro:
      'Los pueblos aborígenes y los isleños del Estrecho de Torres sostienen la cultura viva más antigua documentada del planeta, y el pueblo maorí de Aotearoa cuenta con un tratado fundacional, el de Waitangi, cuya interpretación sigue disputándose. Aotearoa es el nombre maorí de Nueva Zelandia. Esta sección los reúne porque comparten la misma pregunta abierta: qué obliga a un Estado el acuerdo que firmó con el pueblo al que llegó.',
    criterios: [
      'Los hechos ocurren en Australia o en Aotearoa / Nueva Zelandia',
      'Cada historia conserva su tema: aparece aquí y en su sección temática a la vez',
      'La sección existe porque el grupo regional de la ONU los coloca en «Europa Occidental y otros Estados», que no describe a estos pueblos',
    ],
    paises: REGIONS.australiaAotearoa,
  },
  {
    name: 'Sápmi',
    slug: 'sapmi',
    description: 'El pueblo sami y su territorio, que cruza Noruega, Suecia y Finlandia',
    intro:
      'El pueblo sami es el único pueblo indígena reconocido dentro de la Unión Europea. Su territorio, Sápmi, atraviesa Noruega, Suecia, Finlandia y la península de Kola sin coincidir con ninguna frontera estatal, y sus parlamentos propios negocian con tres Estados a la vez sobre pastoreo de renos, minería y energía eólica. La sección se nombra por el territorio del pueblo, con el mismo criterio que Wallmapu.',
    criterios: [
      'Los hechos ocurren en Noruega, Suecia o Finlandia',
      'Cada historia conserva su tema: aparece aquí y en su sección temática a la vez',
      'Una historia sami de la península de Kola aparece también en Europa Oriental, porque el territorio cruza esa frontera',
    ],
    paises: REGIONS.sapmi,
  },
  {
    name: 'Europa Occidental',
    slug: 'europa-occidental',
    description: 'Pueblos indígenas de Europa occidental y los Estados que administran territorios indígenas',
    intro:
      'Europa occidental aparece en esta cobertura por dos vías. Una es propia: el pueblo sami vive en el norte de Noruega, Suecia y Finlandia. La otra es de arrastre: varios Estados europeos administran todavía territorios indígenas lejos de sus fronteras, o guardan en sus museos lo que se llevaron de ellos. Esta sección reúne ambas.',
    criterios: [
      'Los hechos ocurren en un país de Europa occidental',
      'Cada historia conserva su tema: aparece aquí y en su sección temática a la vez',
      'Es el grupo WEOG de la ONU sin América ni Oceanía, que tienen secciones propias; Noruega, Suecia y Finlandia aparecen también en Sápmi',
    ],
    paises: REGIONS.europaOccidental,
  },
  {
    name: 'Europa Oriental',
    slug: 'europa-oriental',
    description: 'Pueblos indígenas y minorías del este de Europa y el norte de Asia',
    intro:
      'Los pueblos indígenas del norte de Rusia y de Siberia —nenets, evenki, chukchi, khanty, entre más de cuarenta reconocidos como «pueblos poco numerosos»— viven sobre las reservas de gas y de níquel que sostienen buena parte de esa economía. Esta sección sigue lo que ocurre en la región, con el alcance que le da el grupo regional de la ONU.',
    criterios: [
      'Los hechos ocurren en un país de Europa oriental, el Cáucaso o Asia central postsoviética',
      'Cada historia conserva su tema: aparece aquí y en su sección temática a la vez',
      'El territorio sami de la península de Kola aparece también en Sápmi',
    ],
    paises: REGIONS.europaOriental,
  },
]

async function main(): Promise<void> {
  const existentes = new Set((await prisma.issue.findMany({ select: { slug: true } })).map((i) => i.slug))
  console.log(APLICAR ? '=== APLICANDO ===\n' : '=== SIMULACION (sin --apply no escribe) ===\n')

  for (const s of SECCIONES) {
    const cuantas = await prisma.story.count({
      where: { status: 'published', countryFocus: { in: [...s.paises] } },
    })
    if (existentes.has(s.slug)) {
      console.log(`  YA EXISTE  ${s.name}`)
      continue
    }
    console.log(
      `  ${APLICAR ? 'creando ' : 'crearia '} ${s.name.padEnd(22)} ${String(cuantas).padStart(5)} historias · ${s.paises.length} paises`,
    )
    if (!APLICAR) continue
    await prisma.issue.create({
      data: {
        name: s.name,
        slug: s.slug,
        description: s.description,
        intro: s.intro,
        evaluationIntro: EVAL_INTRO,
        evaluationCriteria: JSON.stringify(s.criterios),
        makeADifference: '[]',
      },
    })
  }

  const sinSeccion = await prisma.story.count({
    where: {
      status: 'published',
      countryFocus: { not: null },
      NOT: { countryFocus: { in: SECCIONES.flatMap((s) => [...s.paises]).concat([...REGIONS.abyaYala]) } },
    },
  })
  console.log(`\n${sinSeccion} historias publicadas con pais quedan fuera de toda seccion geografica`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
