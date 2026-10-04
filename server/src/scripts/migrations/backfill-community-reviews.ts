/**
 * Carga inicial de la retencion por vertical (D4). Diseño:
 * .plans/2026-10-04_retencion-por-vertical.md, seccion 8.
 *
 * SIMULA POR DEFECTO. Por cada vertical pedida imprime:
 *   - la linea base: cuantas notas muestra hoy la pagina publica (mismo where);
 *   - el modo configurado y el efectivo;
 *   - lo que retendria el gate con las DOS variantes de texto (short y full),
 *     con el modo aprendizaje tal como esta y sin el, y las razones mas
 *     frecuentes: con esto el director decide que texto evalua el gate;
 *   - las notas con mas razones, para leerlas.
 *
 * CON --apply corre el conciliador (la misma funcion que el job) sobre las
 * verticales que esten en revision (modo distinto de off), deja el registro en
 * .migraciones-log/ y comprueba que el total publico no cambio: en sombra, la
 * carga inicial no debe ocultar nada. Nunca toca una decision humana.
 *
 *   npx tsx src/scripts/migrations/backfill-community-reviews.ts
 *   npx tsx src/scripts/migrations/backfill-community-reviews.ts --slug=mapuche
 *   npx tsx src/scripts/migrations/backfill-community-reviews.ts --apply
 */
import prisma from '../../lib/prisma.js'
import { appendFileSync, mkdirSync } from 'node:fs'
import { config } from '../../config.js'
import { evaluateGate } from '../../lib/gate.js'
import { publicCommunityWhere, temasVivos, getReviewMode, effectiveMode } from '../../lib/communityVisibility.js'
import {
  STORY_GATE_SELECT,
  gateTextFor,
  marcaFor,
  membershipWhere,
  reconcileCommunityReviews,
  type GateTextSource,
} from '../../services/communityReview.js'

const APLICAR = process.argv.includes('--apply')
const argSlug = process.argv.find((a) => a.startsWith('--slug='))
const SLUGS = argSlug ? argSlug.slice('--slug='.length).split(',').filter(Boolean) : ['mapuche', 'wallmapu-araucania']

interface Simulacion {
  texto: GateTextSource
  aprendizaje: boolean
  retenidas: number
  razones: Array<[string, number]>
}

function top<T>(m: Map<T, number>, n: number): Array<[T, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

async function main() {
  console.log(APLICAR ? '=== APLICANDO ===\n' : '=== SIMULACION (sin --apply no escribe) ===\n')
  console.log(`gate: modo aprendizaje ${config.gate.learningMode ? 'ENCENDIDO' : 'apagado'} · texto configurado: ${config.gate.textSource}\n`)
  const temas = await temasVivos()
  const registro: object[] = []

  for (const slug of SLUGS) {
    const c = await prisma.community.findUnique({ where: { slug }, select: { id: true, slug: true, keywords: true, issueIds: true, active: true } })
    if (!c) {
      console.log(`${slug}: no existe en la base\n`)
      continue
    }
    const community = { id: c.id, keywords: c.keywords, issueIds: c.issueIds }
    const mode = await getReviewMode(c.id)
    const efectivo = effectiveMode(mode, config.gate.learningMode)
    const visibleAntes = await prisma.story.count({ where: publicCommunityWhere({ community, temas, mode, learningMode: config.gate.learningMode }) })
    const lineaBase = await prisma.story.count({ where: membershipWhere(community, temas) })

    console.log(`${slug}${c.active ? '' : ' (INACTIVA)'}`)
    console.log(`  linea base (pagina publica sin retencion): ${lineaBase}`)
    console.log(`  modo: ${mode} · efectivo: ${efectivo} · visible hoy: ${visibleAntes}`)

    // Simulacion del gate sobre todas las notas de la vertical, sin escribir.
    const notas = await prisma.story.findMany({ where: membershipWhere(community, temas), select: STORY_GATE_SELECT })
    const simulaciones: Simulacion[] = []
    const masRazones: Array<{ titulo: string; razones: string[] }> = []
    for (const texto of ['short', 'full'] as GateTextSource[]) {
      for (const aprendizaje of [config.gate.learningMode, false]) {
        if (aprendizaje === false && config.gate.learningMode === false && simulaciones.some((s) => s.texto === texto)) continue
        let retenidas = 0
        const razones = new Map<string, number>()
        for (const n of notas) {
          const r = evaluateGate({ narrativeFrame: n.narrativeFrame, text: gateTextFor(n, texto) }, { learningMode: aprendizaje, marca: marcaFor(slug) })
          if (r.held) retenidas++
          for (const x of r.reasons) if (x !== 'learning_mode') razones.set(x, (razones.get(x) ?? 0) + 1)
          if (texto === config.gate.textSource && aprendizaje === false && r.held) {
            masRazones.push({ titulo: n.title || n.sourceTitle, razones: r.reasons })
          }
        }
        simulaciones.push({ texto, aprendizaje, retenidas, razones: top(razones, 15) })
      }
    }
    for (const s of simulaciones) {
      console.log(`  gate · texto ${s.texto.padEnd(5)} · aprendizaje ${s.aprendizaje ? 'si' : 'no'}: retiene ${s.retenidas} de ${notas.length}`)
    }
    const sinAprendizaje = simulaciones.find((s) => s.texto === config.gate.textSource && !s.aprendizaje)
    if (sinAprendizaje) {
      console.log(`  razones mas frecuentes (texto ${config.gate.textSource}, sin aprendizaje):`)
      for (const [razon, n] of sinAprendizaje.razones) console.log(`    ${String(n).padStart(4)}  ${razon}`)
    }
    masRazones.sort((a, b) => b.razones.length - a.razones.length)
    if (masRazones.length > 0) {
      console.log('  notas con mas razones:')
      for (const m of masRazones.slice(0, 10)) console.log(`    · ${m.titulo.slice(0, 90)}  [${m.razones.slice(0, 4).join(', ')}]`)
    }

    const fila: Record<string, unknown> = { slug, mode, efectivo, lineaBase, visibleAntes, simulaciones: simulaciones.map(({ razones, ...rest }) => rest) }

    if (APLICAR) {
      if (mode === 'off') {
        console.log('  --apply: la vertical esta en off; no se escribe nada. Primero el director la pasa a shadow.')
      } else {
        const [rep] = await reconcileCommunityReviews({ slugs: [slug] })
        const visibleDespues = await prisma.story.count({ where: publicCommunityWhere({ community, temas, mode, learningMode: config.gate.learningMode }) })
        console.log(`  conciliado: ${JSON.stringify(rep)}`)
        if (efectivo !== 'enforce' && visibleDespues !== visibleAntes) {
          console.log(`  ATENCION: en ${efectivo} el total publico cambio de ${visibleAntes} a ${visibleDespues}. Detener y revisar.`)
        } else {
          console.log(`  visible despues: ${visibleDespues} ${efectivo !== 'enforce' ? '(sin cambios, como debe ser en sombra)' : ''}`)
        }
        Object.assign(fila, { conciliado: rep, visibleDespues })
      }
    }
    registro.push(fila)
    console.log('')
  }

  if (APLICAR) {
    mkdirSync('.migraciones-log', { recursive: true })
    const archivo = `.migraciones-log/backfill-community-reviews-${Date.now()}.jsonl`
    appendFileSync(archivo, registro.map((r) => JSON.stringify(r)).join('\n') + '\n')
    console.log(`registro en ${archivo}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
