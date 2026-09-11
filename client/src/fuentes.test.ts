import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * EL DEFECTO QUE ESTO CIERRA (11-sep-2026): los cuatro `@font-face` de Fraunces
 * declaraban `font-family: 'Fraunces', 'Fraunces Fallback', Georgia, serif`.
 *
 * Una lista de familias es valida en la PROPIEDAD `font-family` —el uso, donde
 * define el orden de respaldo— y NO en el DESCRIPTOR de un `@font-face`, que
 * nombra la familia que se esta declarando y admite uno solo. El navegador
 * descartaba los cuatro bloques enteros.
 *
 * Medido en vivo antes de arreglarlo: el CSS declaraba 13 `@font-face` y
 * `document.fonts` registraba 9 — «Fraunces Fallback» 1, «Lora» 4, «DM Sans» 4
 * y «Fraunces» NINGUNO—. Consecuencias: el sitio nunca pinto un titular en su
 * fuente de marca, y los 67 KB del preload se descargaban en cada carga para
 * nada, que es lo que el navegador avisaba con «preloaded but not used».
 *
 * No se noto a simple vista porque el respaldo metrico con `size-adjust` esta
 * tan bien ajustado que ocupa exactamente el mismo espacio. Un defecto que se
 * esconde detras de su propia mitigacion.
 */

const CSS = readFileSync(path.resolve(__dirname, 'index.css'), 'utf8')
const BLOQUES = CSS.match(/@font-face\s*\{[^}]*\}/g) ?? []

/** El valor del descriptor `font-family` de un bloque `@font-face`. */
function familiaDe(bloque: string): string {
  return (bloque.match(/font-family:\s*([^;]+);/)?.[1] ?? '').trim()
}

describe('los @font-face declaran una sola familia', () => {
  it('se leyeron los bloques del CSS', () => {
    // Si un refactor moviera las fuentes a otro archivo, este test compararia
    // una lista vacia y pasaria sin comprobar nada.
    expect(BLOQUES.length, 'no se encontro ningun @font-face en index.css').toBeGreaterThan(8)
  })

  it('ningun descriptor lleva una lista de fallback', () => {
    const malos = BLOQUES.map(familiaDe).filter((f) => f.includes(','))
    expect(
      malos,
      `el descriptor de @font-face admite UN nombre; con una lista el navegador descarta el bloque entero y la fuente nunca se registra:\n${malos.join('\n')}`,
    ).toEqual([])
  })

  it('cada familia precargada en index.html tiene su @font-face valido', () => {
    // Un preload que apunta a una familia que el navegador no registra es peso
    // puro en el camino critico: se descarga y no se usa jamas.
    const HTML = readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8')
    const precargadas = [...HTML.matchAll(/rel="preload"\s+href="\/fonts\/([^/]+)\//g)].map((m) => m[1])
    expect(precargadas.length, 'no se encontro ningun preload de fuentes').toBeGreaterThan(0)

    const declaradas = BLOQUES.map(familiaDe).map((f) => f.replace(/['"]/g, '').toLowerCase())
    const huerfanas = precargadas.filter(
      (dir) => !declaradas.some((fam) => fam.replace(/\s+/g, '') === dir.toLowerCase()),
    )
    expect(
      huerfanas,
      `se precargan fuentes que ningun @font-face declara con ese nombre exacto: ${huerfanas.join(', ')}`,
    ).toEqual([])
  })

  it('Fraunces sigue teniendo su respaldo metrico, que es lo que evita el salto', () => {
    // Quitar el fallback al corregir el descriptor habria devuelto el CLS que
    // costo arreglar: el texto cambia de ancho cuando baja la fuente real.
    expect(CSS).toContain("font-family: 'Fraunces Fallback'")
    expect(CSS).toMatch(/size-adjust/)
  })
})
