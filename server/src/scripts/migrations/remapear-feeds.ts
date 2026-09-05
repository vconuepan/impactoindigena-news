/**
 * Reasigna los 96 feeds activos a las ocho categorias tematicas.
 *
 * EL PROBLEMA. Medido el 5-sep-2026: los feeds se repartian entre CUATRO
 * categorias -Derechos 55, Chile Intercultural 40, Clima 35, Economias 14- y
 * cinco de las ocho no tenian ninguno. Chile Intercultural es el caso grave,
 * porque es una seccion GEOGRAFICA con 40 feeds y solo 3 historias publicadas
 * como tema: todo lo que cayera ahi por defecto entraba a una categoria muerta.
 *
 * QUE DECIDE ESTE ARCHIVO. `Feed.issueId` no es el tema de las historias: el
 * clasificador decide eso leyendo cada articulo. El feed solo actua como
 * FALLBACK cuando el modelo no devuelve tema (`analysis.ts:151`). Por eso el
 * criterio no es "de que habla este medio" sino "donde conviene que caiga una
 * historia suya que el clasificador no supo ubicar".
 *
 * Y para un medio generalista esa respuesta es DERECHOS INDIGENAS, que es el
 * tema mas general y el destino del descarte segun la regla 10 de
 * CLASSIFICATION_BLOCK. Asignarle "Territorio" a Indian Country Today porque
 * publica mucho de tierras seria inventar una precision que la fuente no tiene.
 *
 * Solo se aparta de ese destino el feed MONOTEMATICO de verdad: el que publica
 * casi exclusivamente sobre un asunto, donde el fallback acierta mas que
 * Derechos.
 *
 *   npx tsx src/scripts/migrations/remapear-feeds.ts           # simula
 *   npx tsx src/scripts/migrations/remapear-feeds.ts --apply
 */
import { PrismaClient } from '@prisma/client'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const APLICAR = process.argv.includes('--apply')
const prisma = new PrismaClient()

/** El destino de todo feed generalista. Ver la nota de arriba. */
const GENERAL = 'derechos-indigenas'

/**
 * Feeds monotematicos, por titulo normalizado. Todo lo que no este aqui va a
 * DERECHOS, incluidos los 40 que hoy cuelgan de Chile Intercultural: Radio Bio
 * Bio, El Mostrador y Mapuexpress publican de todo, y su seccion chilena se
 * resuelve por pais, no por tema.
 */
const MONOTEMATICOS: Record<string, string> = {
  // --- Clima y naturaleza ---
  mongabay: 'cambio-climatico',
  'mongabay en espanol': 'cambio-climatico',
  'mongabay latam - pueblos indigenas': 'cambio-climatico',
  'the guardian - environment': 'cambio-climatico',
  'the guardian - climate': 'cambio-climatico',
  grist: 'cambio-climatico',
  'inside climate news': 'cambio-climatico',
  'climate home news': 'cambio-climatico',
  'carbon brief': 'cambio-climatico',
  'yale e360': 'cambio-climatico',
  'canary media': 'cambio-climatico',
  'eco-business': 'cambio-climatico',
  'indigenous climate hub': 'cambio-climatico',
  'un news - cambio climatico': 'cambio-climatico',
  ipcc: 'cambio-climatico',
  ipbes: 'cambio-climatico',
  unep: 'cambio-climatico',
  conaf: 'cambio-climatico',
  'ministerio medio ambiente': 'cambio-climatico',
  austerra: 'cambio-climatico',

  // --- Defensores y proteccion ---
  // Organizaciones cuyo objeto ES la persona en riesgo, no el tema del riesgo.
  'front line defenders': 'defensores-y-proteccion',
  'amnesty international': 'defensores-y-proteccion',
  'human rights watch': 'defensores-y-proteccion',
  'survival international': 'defensores-y-proteccion',

  // --- Cultura y conocimientos ancestrales ---
  'ministerio de las culturas': 'cultura-y-conocimientos-ancestrales',
  'ministerio culturas - pueblos originarios': 'cultura-y-conocimientos-ancestrales',
  'comunidad de historia mapuche': 'cultura-y-conocimientos-ancestrales',
  naisa: 'cultura-y-conocimientos-ancestrales',

  // --- Economias indigenas ---
  ccib: 'desarrollo-sostenible-y-autodeterminado',
  sernatur: 'desarrollo-sostenible-y-autodeterminado',
  'first peoples worldwide': 'desarrollo-sostenible-y-autodeterminado',
  'mineria y desarrollo': 'desarrollo-sostenible-y-autodeterminado',
  'dialogo chino latam': 'desarrollo-sostenible-y-autodeterminado',

  // --- Consulta y consentimiento ---
  // La consulta previa es el objeto declarado de estos dos.
  'working effectively with indigenous peoples® blog': 'consulta-y-consentimiento',
  'bc gov - reconciliation': 'consulta-y-consentimiento',
}

/** Sin tildes, sin dobles espacios y en minusculas: los titulos vienen sucios. */
function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

async function main(): Promise<void> {
  const issues = await prisma.issue.findMany({ select: { id: true, slug: true, name: true } })
  const porSlug = new Map(issues.map((i) => [i.slug, i]))

  const desconocidos = [...new Set(Object.values(MONOTEMATICOS))].filter((s) => !porSlug.has(s))
  if (desconocidos.length) {
    console.error(`slugs que no existen: ${desconocidos.join(', ')}`)
    process.exit(1)
  }

  const feeds = await prisma.feed.findMany({
    where: { active: true },
    select: { id: true, title: true, issueId: true },
    orderBy: { title: 'asc' },
  })

  const logDir = path.resolve(process.cwd(), '.migraciones-log')
  mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, `remapear-feeds-${Date.now()}.jsonl`)

  console.log(`${feeds.length} feeds activos`)
  console.log(APLICAR ? '=== APLICANDO ===\n' : '=== SIMULACION (sin --apply no escribe) ===\n')

  const reparto = new Map<string, number>()
  let movidos = 0

  for (const f of feeds) {
    const destinoSlug = MONOTEMATICOS[normalizar(f.title)] ?? GENERAL
    const destino = porSlug.get(destinoSlug)!
    reparto.set(destino.name, (reparto.get(destino.name) ?? 0) + 1)
    if (f.issueId === destino.id) continue

    const antes = issues.find((i) => i.id === f.issueId)?.name ?? '(ninguno)'
    console.log(`  ${String(f.title).slice(0, 44).padEnd(46)} ${antes.slice(0, 20).padEnd(22)} -> ${destino.name}`)
    movidos++
    if (!APLICAR) continue

    appendFileSync(logFile, JSON.stringify({ feedId: f.id, title: f.title, antes: f.issueId }) + '\n')
    await prisma.feed.update({ where: { id: f.id }, data: { issueId: destino.id } })
  }

  console.log(`\n${movidos} feeds movidos · ${feeds.length - movidos} ya estaban bien\n`)
  console.log('reparto final:')
  for (const [nombre, n] of [...reparto].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${nombre}`)
  }
  if (APLICAR) console.log(`\nregistro: ${logFile}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
