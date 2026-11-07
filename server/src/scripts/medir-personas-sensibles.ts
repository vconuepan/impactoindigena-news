/**
 * Mide el candado de personas (`lib/personasSensibles.ts`) sobre lo que el
 * sitio ya publicó, sin escribir nada: lee la API pública y cuenta qué
 * cambiaría. Es la prueba del candado antes de enchufarlo (A3 del plan
 * `.plans/2026-11-06_origen-etnico-menores-victimas.md`).
 *
 * No imprime nombres: en las muestras, toda secuencia de palabras con
 * mayúscula sale como [N]. El repo es público y el log también se guarda.
 *
 *   npx tsx src/scripts/medir-personas-sensibles.ts            # 500 últimas
 *   npx tsx src/scripts/medir-personas-sensibles.ts --paginas 201   # todo el archivo
 *   npx tsx src/scripts/medir-personas-sensibles.ts --muestras 10
 *   npx tsx src/scripts/medir-personas-sensibles.ts --archivo ultimas-500.json   # sin pedir la API
 */
import { readFileSync } from 'node:fs'
import { limpiarAtribucionDeCita, limpiarTextoSobrePersonas, type Limpieza } from '../lib/personasSensibles.js'

const API = 'https://vocesindigenas.org/api/stories'
const POR_PAGINA = 25

function argumento(nombre: string, defecto: number): number {
  const i = process.argv.indexOf(`--${nombre}`)
  const valor = i >= 0 ? Number(process.argv[i + 1]) : defecto
  if (!Number.isInteger(valor) || valor < 0) throw new Error(`--${nombre} pide un entero, no «${process.argv[i + 1]}»`)
  return valor
}

const PAGINAS = argumento('paginas', 20)
const MUESTRAS = argumento('muestras', 5)

const CAMPOS_TEXTO = ['title', 'summary', 'relevanceSummary', 'marketingBlurb', 'quote', 'titleEn', 'summaryEn', 'relevanceSummaryEn', 'marketingBlurbEn', 'quoteEn'] as const

interface Noticia {
  slug: string
  quoteAttribution?: string | null
  [campo: string]: unknown
}

function sinNombres(texto: string): string {
  return texto.replace(/\p{Lu}[\p{L}'’-]*(?:\s+(?:de|del|la|y)?\s*\p{Lu}[\p{L}'’-]*)+/gu, '[N]')
}

async function bajar(pagina: number): Promise<Noticia[]> {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(`${API}?limit=${POR_PAGINA}&page=${pagina}&cb=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = (await r.json()) as { data?: Noticia[] }
      return d.data ?? []
    } catch (err) {
      if (intento === 3) throw err
      await new Promise((ok) => setTimeout(ok, 2000 * intento))
    }
  }
  return []
}

async function main() {
  const noticias: Noticia[] = []
  const iArchivo = process.argv.indexOf('--archivo')
  if (iArchivo >= 0) {
    // Un volcado previo de la API, para no volver a pedirla (responde 429 si se insiste).
    noticias.push(...(JSON.parse(readFileSync(process.argv[iArchivo + 1], 'utf8')) as Noticia[]))
  } else {
    for (let p = 1; p <= PAGINAS; p++) {
      const pagina = await bajar(p)
      noticias.push(...pagina)
      if (pagina.length < POR_PAGINA) break
    }
  }

  const porCampo = new Map<string, { notas: Set<string>; pertenencia: number; menor: number; victima: number; sospechas: number }>()
  const muestras = new Map<string, string[]>()
  const notasTocadas = new Set<string>()

  function anotar(campo: string, slug: string, antes: string, r: Limpieza) {
    if (r.cambios.length === 0 && r.sospechas === 0) return
    const fila = porCampo.get(campo) ?? { notas: new Set(), pertenencia: 0, menor: 0, victima: 0, sospechas: 0 }
    fila.notas.add(slug)
    for (const c of r.cambios) fila[c]++
    fila.sospechas += r.sospechas
    porCampo.set(campo, fila)
    if (r.cambios.length > 0) notasTocadas.add(slug)
    const lista = muestras.get(campo) ?? []
    if (lista.length < MUESTRAS) lista.push(`${sinNombres(antes)}\n      → ${sinNombres(r.texto ?? '')}`)
    muestras.set(campo, lista)
  }

  for (const n of noticias) {
    const attr = n.quoteAttribution ?? null
    anotar('quoteAttribution', n.slug, attr ?? '', limpiarAtribucionDeCita(attr))
    for (const campo of CAMPOS_TEXTO) {
      const texto = typeof n[campo] === 'string' ? (n[campo] as string) : null
      anotar(campo, n.slug, texto ?? '', limpiarTextoSobrePersonas(texto, { esCita: campo === 'quote' || campo === 'quoteEn' }))
    }
  }

  console.log(`Noticias leídas: ${noticias.length} (simulación: no se escribe nada)`)
  console.log(`Notas que el candado cambiaría: ${notasTocadas.size}`)
  console.log('campo | notas | pertenencia | menor | víctima | sospechas')
  for (const [campo, f] of porCampo) {
    console.log(`${campo} | ${f.notas.size} | ${f.pertenencia} | ${f.menor} | ${f.victima} | ${f.sospechas}`)
  }
  for (const [campo, lista] of muestras) {
    console.log(`\n== ${campo}`)
    for (const m of lista) console.log(`   ${m}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
