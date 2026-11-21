/**
 * Genera `src/data/redesNube.ts`: los rangos de IP de las redes de NUBE y
 * centros de datos, sacados de la base publica de DB-IP «IP to ASN Lite».
 *
 * Uso (una vez al mes, cuando DB-IP publica la nueva, el dia 1):
 *   1. Bajar https://download.db-ip.com/free/dbip-asn-lite-AAAA-MM.csv.gz
 *      a una carpeta aparte (es un archivo de terceros).
 *   2. npx tsx src/scripts/generar-redes-nube.ts <ruta del .csv.gz>
 *   3. Revisar el resumen que imprime y commitear src/data/redesNube.ts.
 *
 * Licencia de la base: CC BY 4.0. Exige atribuir a DB-IP con un enlace en las
 * paginas que muestran o usan sus resultados: lo hace el panel de analitica.
 *
 * QUE ENTRA Y QUE NO (decidido el 21-nov-2026, verificado contra la base):
 * entran las nubes y los grandes hosters, que es donde corren los robots que
 * inflaban el panel (China, Singapur, Hong Kong, EE.UU., Alemania, Polonia).
 * Quedan FUERA, a proposito, las redes por donde pasan personas reales:
 * Cloudflare (WARP, iCloud Private Relay), Akamai CDN (Private Relay), Fastly,
 * y los hosters dedicados a VPN (M247, Datacamp). Un lector con VPN no debe
 * perder puntos por eso. La lista es explicita por numero de red (ASN), no por
 * nombre: buscar «cloud» o «colo» en los nombres atrapaba empresas de Colombia
 * y de Colorado.
 */
import { createReadStream, writeFileSync } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROVEEDORES } from '../data/proveedoresNube.js'


function v4aNumero(ip: string): number {
  return ip.split('.').reduce((n, o) => n * 256 + Number(o), 0)
}

/** IPv6 → 32 digitos hexadecimales, para comparar como texto. */
export function v6aHex(ip: string): string {
  const [cabeza, cola = ''] = ip.split('::')
  const a = cabeza ? cabeza.split(':') : []
  const b = cola ? cola.split(':') : []
  const relleno = ip.includes('::') ? Array(8 - a.length - b.length).fill('0') : []
  return [...a, ...relleno, ...b].map((g) => g.padStart(4, '0')).join('').toLowerCase()
}

async function main() {
  const archivo = process.argv[2]
  if (!archivo) {
    console.error('Uso: npx tsx src/scripts/generar-redes-nube.ts <dbip-asn-lite-AAAA-MM.csv.gz>')
    process.exit(1)
  }
  const edicion = path.basename(archivo).match(/(\d{4}-\d{2})/)?.[1] ?? 'desconocida'
  const v4: Array<[number, number, number]> = []
  const v6: Array<[string, string, number]> = []
  const lineas = createInterface({ input: createReadStream(archivo).pipe(createGunzip()) })
  for await (const linea of lineas) {
    const m = linea.match(/^([^,]+),([^,]+),(\d+),/)
    if (!m) continue
    const asn = Number(m[3])
    if (!(asn in PROVEEDORES)) continue
    if (m[1].includes(':')) v6.push([v6aHex(m[1]), v6aHex(m[2]), asn])
    else v4.push([v4aNumero(m[1]), v4aNumero(m[2]), asn])
  }
  v4.sort((x, y) => x[0] - y[0])
  v6.sort((x, y) => (x[0] < y[0] ? -1 : 1))

  // Fundir rangos contiguos del mismo ASN: la lista baja a una fraccion.
  const v4f: Array<[number, number, number]> = []
  for (const r of v4) {
    const u = v4f[v4f.length - 1]
    if (u && u[2] === r[2] && r[0] === u[1] + 1) u[1] = r[1]
    else v4f.push([...r])
  }

  const asns = [...new Set([...v4f, ...v6].map((r) => r[2]))].sort((a, b) => a - b)
  const indice = new Map(asns.map((a, i) => [a, i]))
  const salida = `// GENERADO por src/scripts/generar-redes-nube.ts — no editar a mano.
// Fuente: DB-IP «IP to ASN Lite», edicion ${edicion} (https://db-ip.com), licencia CC BY 4.0.
// ${v4f.length} rangos IPv4 y ${v6.length} rangos IPv6 de ${asns.length} redes de nube y hosting.
export const EDICION = '${edicion}'
export const ASNS: number[] = ${JSON.stringify(asns)}
/** Plano: [inicio, fin, indiceEnASNS, inicio, fin, ...], ordenado por inicio. */
export const V4: number[] = ${JSON.stringify(v4f.flatMap((r) => [r[0], r[1], indice.get(r[2])!]))}
/** Plano: [inicioHex, finHex, ...] y su indice en ASNS aparte, ordenado por inicio. */
export const V6: string[] = ${JSON.stringify(v6.flatMap((r) => [r[0], r[1]]))}
export const V6_ASN: number[] = ${JSON.stringify(v6.map((r) => indice.get(r[2])!))}
`
  const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/redesNube.ts')
  writeFileSync(destino, salida)
  console.log(`edicion ${edicion}: ${v4f.length} rangos IPv4 (de ${v4.length}), ${v6.length} IPv6, ${asns.length} redes`)
  console.log(`escrito ${destino} (${(salida.length / 1024).toFixed(0)} KB)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
