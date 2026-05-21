/**
 * test-google-news.ts
 *
 * Prueba rápida del módulo de búsqueda de noticias (Bing News RSS).
 * Ejecutar: npx tsx --env-file=.env src/scripts/test-google-news.ts
 *
 * Opciones:
 *   npx tsx --env-file=.env src/scripts/test-google-news.ts "mapuche" 10
 *   npx tsx --env-file=.env src/scripts/test-google-news.ts "indigenous rights" 10 US:en
 */
import 'dotenv/config'
import { buscarNoticias } from '../lib/googleNewsSearch.js'

const query = process.argv[2] ?? 'pueblos indígenas'
const max = parseInt(process.argv[3] ?? '10', 10)
const region = process.argv[4] ?? 'CL:es'

console.log(`\n🔍 Buscando: "${query}" (máx. ${max} resultados, región: ${region})\n`)

const resultados = await buscarNoticias(query, max, region)

if (resultados.length === 0) {
  console.log('Sin resultados o error de conexión.')
  process.exit(0)
}

for (const r of resultados) {
  const fecha = r.fechaPublicacion
    ? r.fechaPublicacion.toISOString().slice(0, 10)
    : 'sin fecha'
  console.log(`📰 ${r.titulo}`)
  console.log(`   Fuente : ${r.fuente}`)
  console.log(`   Fecha  : ${fecha}`)
  console.log(`   URL    : ${r.url}`)
  if (r.resumen) console.log(`   Resumen: ${r.resumen.slice(0, 120)}...`)
  console.log()
}

console.log(`✅ ${resultados.length} resultados`)
