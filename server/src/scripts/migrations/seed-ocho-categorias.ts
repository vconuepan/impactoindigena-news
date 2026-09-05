/**
 * Crea las cuatro categorias que faltan para completar las ocho.
 *
 * El eje tematico tenia seis entradas, y dos de ellas -Chile y Abya Yala- son
 * geograficas: viven en la barra de verticales, no entre los temas. Quedaban
 * cuatro temas reales para 3.100 historias, y por eso Derechos Indigenas
 * acumulaba 2.049, dos tercios del archivo. Un tema que contiene todo no
 * ordena nada.
 *
 * Las ocho: Territorio, Clima, Consulta, Economias, Derechos, Defensores,
 * Mujeres y Cultura. Los slugs y los colores ya estaban fijados en DESIGN.md y
 * en client/src/lib/category-colors.ts; esto crea las cuatro que faltaban.
 *
 * Los criterios de cada una se escriben con la regla de corte explicita, para
 * que la reclasificacion no vuelva a mandar todo al cajon de Derechos.
 *
 *   npx tsx src/scripts/migrations/seed-ocho-categorias.ts           # simula
 *   npx tsx src/scripts/migrations/seed-ocho-categorias.ts --apply
 */
import { PrismaClient } from '@prisma/client'

const APLICAR = process.argv.includes('--apply')
const prisma = new PrismaClient()

interface Categoria {
  name: string
  slug: string
  description: string
  intro: string
  evaluationIntro: string
  evaluationCriteria: string[]
}

const EVAL_INTRO = 'Evaluamos la relevancia de las noticias de esta categoría según tres criterios:'

const NUEVAS: Categoria[] = [
  {
    name: 'Territorio y Tierras',
    slug: 'territorio-y-tierras',
    description:
      'Demarcación, titulación, restitución y despojo de tierras indígenas, y los conflictos por su uso',
    intro:
      'Los pueblos indígenas ocupan alrededor de una cuarta parte de la superficie terrestre del planeta y sostienen en ella la mayor parte de la biodiversidad que queda. Casi nada de eso está titulado a su nombre. Esta sección sigue lo que ocurre con esa tierra: quién la reclama, quién la reconoce, quién la ocupa y con qué consecuencias.',
    evaluationIntro: EVAL_INTRO,
    evaluationCriteria: [
      'Demarcación, titulación, restitución o ampliación de territorios indígenas, y las sentencias que las ordenan o las niegan',
      'Despojo, ocupación, desalojo o invasión de tierras indígenas, incluidos los proyectos extractivos y de infraestructura que las atraviesan',
      'Gobierno del territorio por sus propios pueblos: autonomías, cogestión de áreas protegidas y ordenamiento propio',
    ],
  },
  {
    name: 'Consulta y Consentimiento',
    slug: 'consulta-y-consentimiento',
    description:
      'Consulta previa, consentimiento libre, previo e informado, y los procesos donde se decide sobre los pueblos',
    intro:
      'El Convenio 169 de la OIT obliga a los Estados a consultar a los pueblos indígenas antes de adoptar medidas que los afecten, y la Declaración de la ONU exige su consentimiento libre, previo e informado. Entre lo que la norma dice y lo que los procesos hacen hay una distancia que esta sección documenta caso por caso.',
    evaluationIntro: EVAL_INTRO,
    evaluationCriteria: [
      'Procesos de consulta previa o de consentimiento libre, previo e informado: su apertura, su desarrollo, su resultado o su ausencia',
      'Decisiones judiciales o administrativas que anulan, ordenan o interpretan una consulta',
      'Protocolos propios de consulta que las comunidades adoptan y hacen valer, y los estándares que los organismos internacionales fijan',
    ],
  },
  {
    name: 'Defensores y Protección',
    slug: 'defensores-y-proteccion',
    description:
      'Quienes defienden territorios y derechos indígenas, y la violencia, criminalización y protección que enfrentan',
    intro:
      'Defender un territorio indígena es una de las actividades más peligrosas del mundo: cada año se cuentan por cientos las personas asesinadas por hacerlo, y una parte desproporcionada de ellas son indígenas. Esta sección sigue a quienes lo hacen, la violencia que enfrentan y los mecanismos que deberían protegerlas.',
    evaluationIntro: EVAL_INTRO,
    evaluationCriteria: [
      'Asesinatos, amenazas, desapariciones o agresiones contra personas defensoras de territorios y derechos indígenas',
      'Criminalización: detenciones, juicios, leyes antiterroristas y estados de excepción aplicados a la protesta y la defensa territorial',
      'Protección y reparación: medidas cautelares, acuerdos como Escazú, mecanismos nacionales y la impunidad o la condena de los responsables',
    ],
  },
  {
    name: 'Mujeres Indígenas',
    slug: 'mujeres-indigenas',
    description:
      'Liderazgo, derechos, violencias y organización de las mujeres y niñas indígenas',
    intro:
      'Las mujeres indígenas sostienen buena parte del liderazgo territorial, de la transmisión de la lengua y de la economía de sus comunidades, y cargan a la vez con formas de violencia que se acumulan por ser mujeres y por ser indígenas. Esta sección cubre su organización y lo que enfrentan, como tema propio y no como nota al pie de otro.',
    evaluationIntro: EVAL_INTRO,
    evaluationCriteria: [
      'Liderazgo y organización de mujeres indígenas: cargos, candidaturas, federaciones propias y representación en instancias de decisión',
      'Violencias específicas contra mujeres y niñas indígenas, incluidas la desaparición, la trata, la esterilización forzada y la violencia sexual en contextos de conflicto o extractivismo',
      'Derechos y condiciones materiales: salud materna e intercultural, educación, trabajo, tierra a su nombre y acceso a la justicia',
    ],
  },
]

async function main(): Promise<void> {
  const existentes = await prisma.issue.findMany({ select: { slug: true, name: true } })
  const conocidos = new Set(existentes.map((i) => i.slug))

  console.log(`${existentes.length} categorias hoy: ${existentes.map((i) => i.name).join(' · ')}\n`)
  console.log(APLICAR ? '=== APLICANDO ===' : '=== SIMULACION (sin --apply no escribe) ===\n')

  let creadas = 0
  for (const c of NUEVAS) {
    if (conocidos.has(c.slug)) {
      console.log(`  YA EXISTE  ${c.slug}`)
      continue
    }
    console.log(`  ${APLICAR ? 'creando  ' : 'crearia  '} ${c.name}  (${c.slug})`)
    creadas++
    if (!APLICAR) continue
    await prisma.issue.create({
      data: {
        name: c.name,
        slug: c.slug,
        description: c.description,
        intro: c.intro,
        evaluationIntro: c.evaluationIntro,
        evaluationCriteria: JSON.stringify(c.evaluationCriteria),
        makeADifference: '[]',
      },
    })
  }

  const total = await prisma.issue.count()
  console.log(`\n${creadas} creadas · ${total} categorias en total`)
  if (total !== 10) {
    console.log(
      `  ojo: se esperan 10 filas — las ocho tematicas mas Chile y Abya Yala, que son geograficas`,
    )
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
