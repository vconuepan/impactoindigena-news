/**
 * Audita la clasificacion del archivo con el guardarrail determinista.
 *
 * El guardarrail corre en el pipeline y deja una advertencia en el registro
 * cuando una historia NUEVA entra contradiciendo una regla de corte. Este
 * script hace lo mismo sobre lo que ya esta guardado, que es donde estan las
 * 3.174 historias que el clasificador ya reviso.
 *
 * Solo LEE. Corregir sigue siendo una decision editorial: el guardarrail
 * detecta la contradiccion evidente, no cual es el tema correcto.
 *
 *   npx tsx src/scripts/auditar-clasificacion.ts
 *   npx tsx src/scripts/auditar-clasificacion.ts --todas   # incluye no publicadas
 */
import { PrismaClient } from '@prisma/client'
import { detectarClasificacionSospechosa } from '../lib/clasificacion-guardarrail.js'

const TODAS = process.argv.includes('--todas')
const prisma = new PrismaClient()

async function main(): Promise<void> {
  const historias = await prisma.story.findMany({
    where: TODAS ? { issueId: { not: null } } : { status: 'published', issueId: { not: null } },
    select: {
      id: true,
      slug: true,
      title: true,
      sourceTitle: true,
      issue: { select: { slug: true, name: true } },
    },
  })

  console.log(`${historias.length} historias ${TODAS ? '' : 'publicadas '}con tema asignado\n`)

  const porRegla = new Map<number, number>()
  let sospechosas = 0

  for (const h of historias) {
    // Solo el titular: en el cuerpo los terminos aparecen por contexto y la
    // señal se ahoga en falsos positivos. Ver la nota del guardarrail.
    const sospechas = detectarClasificacionSospechosa(h.title ?? h.sourceTitle ?? '', h.issue?.slug)
    if (!sospechas.length) continue
    sospechosas++
    for (const s of sospechas) {
      porRegla.set(s.regla, (porRegla.get(s.regla) ?? 0) + 1)
      console.log(
        `  regla ${s.regla} · ${h.issue?.name} -> ${s.sugerido}  «${s.termino}»\n` +
          `     ${(h.title ?? h.sourceTitle ?? '').slice(0, 86)}\n` +
          `     /stories/${h.slug ?? h.id}`,
      )
    }
  }

  const pct = historias.length ? ((100 * sospechosas) / historias.length).toFixed(2) : '0'
  console.log(`\n${sospechosas} historias con alguna contradiccion evidente (${pct}%)`)
  for (const [regla, n] of [...porRegla].sort((a, b) => b[1] - a[1])) {
    console.log(`  regla ${regla}: ${n}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
