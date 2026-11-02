/**
 * Calibra el umbral semántico del buscador (`config.search.maxCosineDistance`)
 * sin tocar la base de datos.
 *
 *   npm run calibrar:busqueda --prefix server -- --dir /ruta/fuera/del/repo [--umbral 0.76]
 *
 * Qué hace, en orden (cada paso se guarda en --dir para no pagar dos veces):
 *   1. Baja todas las noticias publicadas de la API pública (`/api/stories`).
 *   2. Las embebe con `buildEmbeddingContent` y `generateEmbeddingsBatch`, las
 *      mismas funciones del servidor: así la réplica no se desfasa del original.
 *   3. Mide la distancia coseno (1 - coseno, como `<=>` de pgvector) de cada
 *      consulta de prueba contra todo el corpus.
 *   4. Escribe `pares.json` para calificar a ciegas (sin mostrar la distancia):
 *        - «franja»: puestos 1-50 con distancia ≥ 0,60, de las consultas reales
 *          y en inglés (lo que ve una búsqueda sin filtros);
 *        - «profunda»: puestos > 50 con distancia en [0,72, 0,82), hasta 15 por
 *          consulta real (lo que ve una búsqueda con filtro de fecha o tema).
 *      Con un `etiquetas.json` en --dir ({ "<pid>": 0 | 0.5 | 1 }), imprime
 *      cuánto se pierde y cuánto pasa con cada umbral.
 *
 * Límites conocidos de la réplica: embebe el texto actual de cada noticia, y en
 * la base puede haber vectores de un título viejo (los scripts de títulos no
 * regeneran el embedding); y embebe todas las publicadas, aunque alguna no
 * tuviera vector en la base. Verificarlo exige leer la base.
 *
 * El --dir NO puede estar dentro del repo: `vectores.json` pesa ~144 MB.
 * Costo medido el 2-nov-2026: ~4.900 noticias, ~0,6 M tokens (centavos).
 * Datos y decisión de esa corrida: `lib/calibracion/busqueda-2026-11-02.json`
 * y `.context/embeddings.md`.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { withRetry } from '../lib/retry.js'
import { buildEmbeddingContent, generateEmbeddingsBatch } from '../services/embedding.js'

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined }
const DIR = arg('--dir') ? path.resolve(arg('--dir')!) : undefined
const UMBRAL = parseFloat(arg('--umbral') ?? String(config.search.maxCosineDistance))
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
if (!DIR) { console.error('Falta --dir'); process.exit(1) }
if (DIR === REPO || DIR.startsWith(REPO + path.sep)) {
  console.error(`--dir está dentro del repo (${REPO}): vectores.json pesa ~144 MB y terminaría commiteado. Usa una carpeta de fuera.`)
  process.exit(1)
}
mkdirSync(DIR, { recursive: true })

const CONSULTAS: Record<'real' | 'en' | 'basura' | 'ajena', string[]> = {
  real: ['mapuche', 'consulta previa', 'litio', 'Corte Interamericana', 'agua', 'fútbol', 'territorio', 'mujeres indígenas', 'lengua aymara', 'minería en Atacama', 'Convenio 169', 'educación intercultural', 'cambio climático', 'derechos humanos', 'salud', 'Rapa Nui', 'Amazonía deforestación', 'economía indígena', 'Machi', 'presos políticos'],
  en: ['Mapuche', 'prior consultation', 'lithium', 'Inter-American Court', 'water', 'football', 'indigenous women', 'climate change', 'human rights', 'health', 'Amazon deforestation', 'political prisoners', 'Rapa Nui', 'indigenous languages', 'land rights'],
  basura: ['zzzzzzzzzz', 'qwertzxcvnoexiste', 'asdfghjklñpoiu', 'xkcd', 'aaaaaaa', 'lorem ipsum dolor'],
  ajena: ['bitcoin', 'receta de pan', 'iPhone 17', 'Champions League', 'Taylor Swift', 'precio del dólar'],
}

interface Noticia { id: string; title: string | null; titleLabel: string | null; summary: string | null }

const distancia = (a: number[], b: number[]) => {
  let p = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { p += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return 1 - p / Math.sqrt(na * nb)
}

async function pagina(p: number): Promise<any> {
  return withRetry(async () => {
    const res = await fetch(`${config.siteUrl}/api/stories?pageSize=100&page=${p}`)
    if (!res.ok) throw Object.assign(new Error(`API pública respondió ${res.status} en la página ${p}`), { status: res.status })
    return res.json()
  })
}

async function corpus(): Promise<Noticia[]> {
  const ruta = `${DIR}/corpus.json`
  if (existsSync(ruta)) return JSON.parse(readFileSync(ruta, 'utf8'))
  const todas: Noticia[] = []
  for (let p = 1; ; p++) {
    const d = await pagina(p)
    todas.push(...d.data.map((s: any) => ({ id: s.id, title: s.title, titleLabel: s.titleLabel, summary: s.summary })))
    if (p >= d.totalPages) break
  }
  writeFileSync(ruta, JSON.stringify(todas))
  return todas
}

async function vectores(noticias: Noticia[]): Promise<Record<string, number[]>> {
  const ruta = `${DIR}/vectores.json`
  const vecs: Record<string, number[]> = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : {}
  const faltan = noticias.filter((s) => !vecs[s.id] && buildEmbeddingContent(s))
  for (let i = 0; i < faltan.length; i += 100) {
    const lote = faltan.slice(i, i + 100)
    const e = await generateEmbeddingsBatch(lote.map((s) => buildEmbeddingContent(s)))
    lote.forEach((s, j) => { vecs[s.id] = e[j] })
    if ((i / 100) % 10 === 0) writeFileSync(ruta, JSON.stringify(vecs))
  }
  writeFileSync(ruta, JSON.stringify(vecs))
  return vecs
}

async function main() {
  const noticias = await corpus()
  const vecs = await vectores(noticias)
  const porId = new Map(noticias.map((s) => [s.id, s]))
  const lista = (Object.entries(CONSULTAS) as Array<[keyof typeof CONSULTAS, string[]]>).flatMap(([tipo, qs]) => qs.map((q) => ({ tipo, q })))
  const qv = await generateEmbeddingsBatch(lista.map((x) => x.q))
  const medicion = lista.map((x, i) => ({
    ...x,
    orden: noticias.filter((s) => vecs[s.id]).map((s) => ({ id: s.id, d: distancia(qv[i], vecs[s.id]) })).sort((a, b) => a.d - b.d),
  }))
  writeFileSync(`${DIR}/medicion.json`, JSON.stringify(medicion.map((x) => ({ tipo: x.tipo, q: x.q, top50: x.orden.slice(0, 50) }))))

  console.log(`corpus ${noticias.length} · umbral ${UMBRAL}`)
  console.log('tipo   consulta                 más cercana  resultados semánticos que pasan (de 50)')
  for (const x of medicion) console.log(`${x.tipo.padEnd(6)} ${x.q.padEnd(24).slice(0, 24)} ${x.orden[0].d.toFixed(3)}        ${x.orden.slice(0, 50).filter((t) => t.d < UMBRAL).length}`)

  const par = (tipo: string, q: string, t: { id: string; d: number }) => {
    const s = porId.get(t.id)!
    return { pid: `${tipo}:${q}|${t.id}`, tipo, busqueda: q, d: t.d, titulo: s.title, resumen: (s.summary ?? '').slice(0, 400) }
  }
  const pares = medicion.flatMap((x) => {
    if (x.tipo !== 'real' && x.tipo !== 'en') return []
    const franja = x.orden.slice(0, 50).filter((t) => t.d >= 0.6).map((t) => par('franja', x.q, t))
    if (x.tipo !== 'real') return franja
    const hondo = x.orden.slice(50).filter((t) => t.d >= 0.72 && t.d < 0.82)
    const n = Math.min(15, hondo.length), paso = hondo.length / Math.max(n, 1)
    return [...franja, ...Array.from({ length: n }, (_, k) => par('profunda', x.q, hondo[Math.floor(k * paso)]))]
  })
  writeFileSync(`${DIR}/pares.json`, JSON.stringify(pares, null, 1))
  console.log(`\n${pares.length} pares para calificar en ${DIR}/pares.json (sin mostrar d).`)

  const rutaEtq = `${DIR}/etiquetas.json`
  if (!existsSync(rutaEtq)) return
  const etq: Record<string, number> = JSON.parse(readFileSync(rutaEtq, 'utf8'))
  for (const tipo of ['franja', 'profunda']) {
    const cal = pares.filter((p) => p.tipo === tipo && p.pid in etq).map((p) => ({ d: p.d, rel: etq[p.pid] }))
    if (!cal.length) continue
    const rel = cal.reduce((a, p) => a + p.rel, 0), irr = cal.length - rel
    console.log(`\n${tipo} (${cal.length} pares) · umbral · pertinentes perdidos (de ${rel.toFixed(1)}) · no pertinentes que pasan (de ${irr.toFixed(1)})`)
    for (const u of [0.7, 0.72, 0.74, 0.76, 0.78, 0.8, 1.0]) {
      const perd = cal.filter((p) => p.d >= u).reduce((a, p) => a + p.rel, 0)
      const pasa = cal.filter((p) => p.d < u).reduce((a, p) => a + 1 - p.rel, 0)
      console.log(`  ${u.toFixed(2)}  ${perd.toFixed(1).padStart(6)}  ${pasa.toFixed(1).padStart(6)}`)
    }
  }
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1) })
