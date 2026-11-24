/**
 * corregir-titulos-revisados.ts
 *
 * Aplica las correcciones de títulos ya publicados que se revisaron una por una
 * el 24-nov-2026 (siglas escritas como palabra, nombres propios en minúscula,
 * tildes, palabras deformadas). La lista vive en
 * `data/titulos-revisados-2026-11-24.json`; ver lib/correccionesDeTitulo.ts.
 *
 * NO usa el LLM y no decide nada: escribe exactamente lo que dice el archivo, y
 * solo si el campo sigue diciendo lo que decía cuando se revisó.
 *
 * Correr (desde la raíz del repo, con el firewall de la base abierto):
 *   npm run migration:corregir-titulos --prefix server          # simulación, no escribe
 *   npm run migration:corregir-titulos:apply --prefix server    # aplica
 *   ... -- --con-palabras    # suma las que cambian palabras (léelas antes:
 *                            # .plans/2026-11-24_titulos-por-revisar.md)
 *
 * La simulación es el modo por defecto a propósito: escribe sobre la base de
 * producción. Al aplicar deja un registro en `.migraciones-log/` con el valor
 * anterior de cada campo, que es lo que hace falta para deshacerlo.
 */
import 'dotenv/config'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { planDeCorrecciones, type TitulosActuales } from '../../lib/correccionesDeTitulo.js'

const APPLY = process.argv.includes('--apply')
// Las correcciones que cambian palabras (no solo mayúsculas, tildes, puntuación
// o cifras) viven en un archivo aparte y solo entran si se piden: son decisión
// editorial. Ver .plans/2026-11-24_titulos-por-revisar.md.
const CON_PALABRAS = process.argv.includes('--con-palabras')
const leer = (nombre: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./data/${nombre}`, import.meta.url)), 'utf8')) as Array<{ id: string }>
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  console.log(APPLY ? '== APLICANDO CAMBIOS ==' : '== SIMULACION (no escribe) ==')
  const entradas = [
    ...leer('titulos-revisados-2026-11-24.json'),
    ...(CON_PALABRAS ? leer('titulos-con-cambio-de-palabras-2026-11-24.json') : []),
  ]
  console.log(CON_PALABRAS ? 'Incluye las correcciones que cambian palabras.' : 'Solo correcciones mecánicas (para sumar las que cambian palabras: -- --con-palabras).')
  const ids = [...new Set(entradas.map((e) => e.id).filter((x) => typeof x === 'string'))]

  const filas = await prisma.story.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, titleEn: true },
  })
  const actuales: TitulosActuales = new Map(filas.map((f) => [f.id, { title: f.title, titleEn: f.titleEn }]))
  const plan = planDeCorrecciones(entradas, actuales)

  console.log(`Correcciones en el archivo: ${entradas.length}`)
  console.log(`  por aplicar:            ${plan.aplicar.length}`)
  console.log(`  ya aplicadas:           ${plan.yaAplicadas.length}`)
  console.log(`  el campo cambió (no se toca): ${plan.cambiaron.length}`)
  console.log(`  la noticia no existe:   ${plan.noExisten.length}`)
  console.log(`  entradas inválidas:     ${plan.invalidas.length}`)

  for (const c of plan.cambiaron) console.log(`  CAMBIÓ ${c.id} · ${c.campo}\n    revisado: ${c.antes}\n    hoy:      ${c.actual}`)
  for (const i of plan.invalidas) console.log(`  INVÁLIDA (${i.motivo}): ${JSON.stringify(i.entrada)}`)
  if (plan.invalidas.length > 0) throw new Error('El archivo trae entradas inválidas: no se aplica nada.')

  if (!APPLY) {
    console.log('\nPrimeras 15 por aplicar:')
    for (const c of plan.aplicar.slice(0, 15)) console.log(`  ${c.campo}\n    antes: ${c.antes}\n    ahora: ${c.ahora}`)
    console.log('\nSi está bien, corre:\n  npm run migration:corregir-titulos:apply --prefix server')
    return
  }

  const registro: string[] = []
  let escritas = 0
  let saltadas = 0
  for (const c of plan.aplicar) {
    // updateMany con el valor anterior en el where: si el campo cambió entre la
    // lectura y la escritura, no pisa nada.
    const r = await prisma.story.updateMany({ where: { id: c.id, [c.campo]: c.antes }, data: { [c.campo]: c.ahora } })
    if (r.count === 1) { escritas++; registro.push(JSON.stringify(c)) } else saltadas++
  }
  const dir = fileURLToPath(new URL('../../../.migraciones-log/', import.meta.url))
  mkdirSync(dir, { recursive: true })
  const ruta = `${dir}corregir-titulos-${Date.now()}.jsonl`
  writeFileSync(ruta, registro.join('\n') + '\n')
  console.log(`\nEscritas: ${escritas} · saltadas porque cambiaron en el camino: ${saltadas}`)
  console.log(`Registro (valor anterior de cada campo): ${ruta}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
