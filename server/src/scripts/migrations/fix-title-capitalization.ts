/**
 * fix-title-capitalization.ts
 *
 * Repara siglas y toponimos que quedaron en minusculas en titulos ya
 * publicados: "estudio de ufal revelo...", "conadi y corfo financian... en
 * chile", "mpf pide accion...".
 *
 * La causa estaba en el esquema del LLM, que pedia "en minusculas excepto
 * nombres propios" sin decir que las siglas cuentan como tales. Eso ya se
 * corrigio, pero solo afecta a lo que se genere de ahora en adelante; este
 * script arregla el archivo existente.
 *
 * Deliberadamente NO usa el LLM. Solo sustituye coincidencias exactas de una
 * lista blanca, asi que no puede inventar, reescribir ni cambiar el sentido de
 * un titular. Lo que no este en la lista se queda como esta.
 *
 * Correr:
 *   npm run migration:fix-title-caps          # simulacion, no escribe nada
 *   npm run migration:fix-title-caps:apply    # aplica los cambios
 *
 * La simulacion es el modo por defecto a proposito: escribe sobre la base de
 * produccion, asi que hay que ver la lista de cambios antes de confirmarla.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

/**
 * Siglas y acronimos del dominio, en su forma canonica.
 *
 * Solo entran los que no colisionan con una palabra comun del espanol: una
 * sustitucion ciega de "ine" o "sal" romperia texto legitimo. Ante la duda,
 * se deja fuera — este script prefiere no tocar antes que tocar de mas.
 */
const ACRONYMS = [
  'CONADI', 'CORFO', 'CONAF', 'SERNAPESCA', 'INDAP', 'INAI', 'INPI',
  'ONU', 'OIT', 'OEA', 'CIDH', 'CEPAL', 'UNESCO', 'UNICEF', 'ACNUR',
  'FAO', 'PNUD', 'OMS', 'BID', 'CLPI', 'FPIC', 'REDD',
  'MPF', 'CEDH', 'CNDH', 'FUNAI', 'INCRA', 'IBAMA', 'UFAL',
  'ONG', 'ONGs', 'EE', 'UU', 'GIZ', 'USAID', 'IPBES', 'COP',
]

/**
 * Toponimos y gentilicios propios. La forma canonica lleva la capitalizacion
 * correcta, incluidas las particulas ("La Araucania").
 */
const PROPER_NOUNS = [
  'Chile', 'Argentina', 'Bolivia', 'Peru', 'Perú', 'Ecuador', 'Colombia',
  'Brasil', 'Mexico', 'México', 'Guatemala', 'Honduras', 'Nicaragua',
  'Panama', 'Panamá', 'Paraguay', 'Uruguay', 'Venezuela', 'Canada', 'Canadá',
  'Sonora', 'Coahuila', 'Chihuahua', 'Oaxaca', 'Chiapas', 'Guerrero',
  'Hidalgo', 'Yucatan', 'Yucatán', 'Michoacan', 'Michoacán', 'Sinaloa',
  'Amazonia', 'Amazonía', 'Patagonia', 'Wallmapu', 'Araucania', 'Araucanía',
  'Temuco', 'Santiago', 'Bariloche', 'Nariño', 'Cauca', 'Vichada',
  'Mapuche', 'Aymara', 'Quechua', 'Rapa Nui', 'Yanomami', 'Guarani', 'Guaraní',
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Devuelve el texto con las siglas y nombres propios en su forma canonica.
 *
 * Compara sin distinguir mayusculas y exige limites de palabra, asi que
 * "chilena" o "conadiense" no se tocan. Si el texto ya trae la forma correcta,
 * la sustitucion es un no-op.
 */
export function fixCapitalization(text: string): string {
  let out = text

  for (const canonical of [...ACRONYMS, ...PROPER_NOUNS]) {
    const re = new RegExp(`\\b${escapeRegex(canonical)}\\b`, 'gi')
    out = out.replace(re, canonical)
  }

  // "La Araucania" tras el paso anterior puede haber quedado como "la Araucania".
  out = out.replace(/\bla (Araucan(?:i|í)a)\b/g, 'La $1')

  return out
}

interface StoryTitles {
  id: string
  title: string | null
  titleLabel: string | null
  titleEn: string | null
  titleLabelEn: string | null
}

const FIELDS = ['title', 'titleLabel', 'titleEn', 'titleLabelEn'] as const

async function main() {
  console.log(APPLY ? '== APLICANDO CAMBIOS ==' : '== SIMULACION (no escribe) ==\n')

  const stories: StoryTitles[] = await prisma.story.findMany({
    where: { status: 'published' },
    select: { id: true, title: true, titleLabel: true, titleEn: true, titleLabelEn: true },
  })

  console.log(`Historias publicadas: ${stories.length}\n`)

  let changed = 0
  let fieldEdits = 0

  for (const story of stories) {
    const updates: Record<string, string> = {}

    for (const field of FIELDS) {
      const current = story[field]
      if (!current) continue
      const fixed = fixCapitalization(current)
      if (fixed !== current) {
        updates[field] = fixed
        fieldEdits++
        console.log(`  ${story.id} · ${field}`)
        console.log(`    antes:  ${current}`)
        console.log(`    ahora:  ${fixed}`)
      }
    }

    if (Object.keys(updates).length === 0) continue
    changed++

    if (APPLY) {
      await prisma.story.update({ where: { id: story.id }, data: updates })
    }
  }

  console.log(`\nHistorias afectadas: ${changed}  ·  campos corregidos: ${fieldEdits}`)
  if (!APPLY && changed > 0) {
    console.log('\nRevisa la lista de arriba. Si esta bien, corre:')
    console.log('  npm run migration:fix-title-caps:apply')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
