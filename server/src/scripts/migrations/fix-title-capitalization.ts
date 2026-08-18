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
import { fixCapitalization, fixTitleCapitalization } from '../../lib/title-capitalization.js'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

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
      // Los titulares llevan mayuscula inicial; las etiquetas van en minuscula
      // a proposito ("cacería subsistencia" es el kicker de la tarjeta).
      const esTitular = field === 'title' || field === 'titleEn'
      const fixed = esTitular ? fixTitleCapitalization(current) : fixCapitalization(current)
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
