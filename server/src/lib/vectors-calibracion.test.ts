import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { config } from '../config.js'

/**
 * Candado del umbral semántico del buscador contra la calibración del
 * 2-nov-2026 (`lib/calibracion/busqueda-2026-11-02.json`).
 *
 * Qué es y qué no es. El umbral se ELIGIÓ con estos mismos datos, así que esto
 * no prueba de forma independiente que 0,76 sea bueno: impide cambiarlo sin
 * datos nuevos. Pasa entre ~0,755 y ~0,775 (medido por una revisión). Si el
 * corpus, el modelo de embeddings o el texto que se embebe cambian, hay que
 * recalibrar con `scripts/calibrar-busqueda.ts` y reemplazar el archivo.
 *
 * Los datos: distancias reales de 47 consultas contra las 4.893 noticias
 * publicadas, y 579 pares calificados a ciegas en dos rondas (la segunda,
 * franja profunda e inglés, la pidió la revisión independiente).
 */
interface Par { q: string; id: string; d: number; rel: number; tipo?: 'profunda' | 'en' }
interface Calibracion {
  consultas: Array<{ tipo: 'real' | 'en' | 'basura' | 'ajena'; q: string; top50: number[] }>
  etiquetado: { ronda1: { pares: Par[] }; ronda2: { pares: Par[] } }
}
const datos: Calibracion = JSON.parse(
  readFileSync(new URL('./calibracion/busqueda-2026-11-02.json', import.meta.url), 'utf8'),
)
const U = config.search.maxCosineDistance
const media = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
const ronda1 = datos.etiquetado.ronda1.pares
const profunda = datos.etiquetado.ronda2.pares.filter((p) => p.tipo === 'profunda')

describe(`umbral semántico calibrado (${U})`, () => {
  it('una búsqueda sin sentido queda vacía o casi: a lo más 2 resultados semánticos', () => {
    for (const c of datos.consultas.filter((c) => c.tipo === 'basura')) {
      expect(c.top50.filter((d) => d < U).length, `«${c.q}» deja pasar resultados`).toBeLessThanOrEqual(2)
    }
  })

  it('ninguna búsqueda real en español se queda sin su resultado semántico más cercano', () => {
    for (const c of datos.consultas.filter((c) => c.tipo === 'real')) {
      expect(c.top50[0], `«${c.q}» pierde hasta su mejor resultado`).toBeLessThan(U)
    }
  })

  it('lo que el umbral descarta casi nunca es pertinente (media ≤ 0,10)', () => {
    const descartados = ronda1.filter((p) => p.d >= U).map((p) => p.rel)
    expect(descartados.length).toBeGreaterThan(0)
    expect(media(descartados)).toBeLessThanOrEqual(0.1)
  })

  it('con filtros de fecha o tema (franja profunda), lo descartado tampoco es pertinente (media ≤ 0,15)', () => {
    const descartados = profunda.filter((p) => p.d >= U).map((p) => p.rel)
    expect(descartados.length).toBeGreaterThan(0)
    expect(media(descartados)).toBeLessThanOrEqual(0.15)
  })

  it('lo que pasa de la franja dudosa es mayormente pertinente (media ≥ 0,5)', () => {
    expect(media(ronda1.filter((p) => p.d < U).map((p) => p.rel))).toBeGreaterThanOrEqual(0.5)
  })

  it('se pierden a lo más el 5 % de los resultados pertinentes de la franja', () => {
    const pertinentes = ronda1.reduce((a, p) => a + p.rel, 0)
    const perdidos = ronda1.filter((p) => p.d >= U).reduce((a, p) => a + p.rel, 0)
    expect(perdidos / pertinentes).toBeLessThanOrEqual(0.05)
  })
})
