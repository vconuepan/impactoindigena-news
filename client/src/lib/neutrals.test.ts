import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * La escala neutral del sitio, leida del CSS donde vive.
 *
 * Se lee el archivo en vez de importar un modulo porque las variables `--n-*`
 * son la fuente: Tailwind resuelve su escala `neutral` contra ellas, y no hay
 * un objeto de JavaScript que duplicarlas no volveria a desincronizar.
 */
function escalaNeutral(): Record<string, [number, number, number]> {
  const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf8')
  const bloque = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  const out: Record<string, [number, number, number]> = {}
  for (const m of bloque.matchAll(/--n-(\d+):\s*(\d+)\s+(\d+)\s+(\d+)/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  }
  return out
}

/** Contraste WCAG 2.1 contra el papel del sitio. */
function contraste(c: [number, number, number], fondo: [number, number, number]): number {
  const lum = (x: [number, number, number]) => {
    const [r, g, b] = x.map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const a = lum(c)
  const b = lum(fondo)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const PAPEL: [number, number, number] = [250, 250, 248] // #FAFAF8

describe('neutrales del sitio', () => {
  const escala = escalaNeutral()

  it('la escala esta definida en :root, no solo en el admin', () => {
    // Hasta el 5-sep-2026 vivia bajo `.admin-warm` y el sitio publico se
    // quedaba con los neutros frios de Tailwind.
    expect(Object.keys(escala).length).toBeGreaterThanOrEqual(11)
  })

  it('todos los neutrales son calidos (R >= B)', () => {
    // La escala es stone: el sistema pide neutros calidos para acompañar al
    // negro #1C1917. Un neutro frio se nota justo al lado de el.
    for (const [nivel, c] of Object.entries(escala)) {
      expect(c[0] - c[2], `n-${nivel} = rgb(${c})`).toBeGreaterThanOrEqual(0)
    }
  })

  it('n-400 y mas oscuro pasan WCAG AA sobre el papel', () => {
    // n-400 es el gris de las etiquetas de 10-12 px. El stone-400 real da
    // 2,5:1 y no se lee; por eso la escala se desvia ahi a proposito.
    for (const nivel of ['400', '500', '600', '700', '800', '900', '950']) {
      const r = contraste(escala[nivel], PAPEL)
      expect(r, `n-${nivel} da ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('la escala se oscurece de forma monotona', () => {
    const niveles = Object.keys(escala).map(Number).sort((a, b) => a - b)
    let previo = Infinity
    for (const n of niveles) {
      const suma = escala[String(n)].reduce((a, b) => a + b, 0)
      expect(suma, `n-${n} no es mas oscuro que el anterior`).toBeLessThan(previo)
      previo = suma
    }
  })
})
