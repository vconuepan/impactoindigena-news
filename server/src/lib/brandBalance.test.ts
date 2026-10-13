import { describe, it, expect } from 'vitest'
import { equilibrarDestacadas, reglasDestacadas, type Destacable } from './brandBalance.js'

/** Destacadas de Voces Mapuche con equilibrio (diseño D5, sección 5). */

const reglas = reglasDestacadas({ confrontacionMaxDestacadas: 0.3334, ejeDirectorMinDestacadas: 1, puelmapuMinDestacadas: 1, porFeedMaxDestacadas: 3 })
let t = 0
const nota = (id: string, n: number, extra: Partial<Destacable> = {}): Destacable => ({
  id,
  nota: n,
  eje: 'territorio_derechos',
  lugar: 'araucania',
  encuadre: null,
  feed: `feed-${id}`,
  fecha: new Date(Date.UTC(2026, 9, 13, 12, 0, t++)),
  ...extra,
})

describe('equilibrarDestacadas', () => {
  it('la confrontación ocupa como máximo un tercio, aunque puntúe más', () => {
    const c = (id: string) => nota(id, 6, { encuadre: 'confrontacion', eje: 'conflicto' })
    const r = equilibrarDestacadas([c('c1'), c('c2'), c('c3'), c('c4'), nota('a', 5), nota('b', 5), nota('d', 4), nota('e', 4)], 5, reglas)
    expect(r.filter((id) => id.startsWith('c'))).toHaveLength(1)
    expect(r).toHaveLength(5)
  })

  it('entra la mejor de los ejes del director aunque su nota quede bajo el corte', () => {
    const r = equilibrarDestacadas([nota('a', 6), nota('b', 6), nota('c', 6), nota('l', 4, { eje: 'lengua' })], 3, reglas)
    expect(r).toContain('l')
  })

  it('entra una del Puelmapu si la hubo', () => {
    const r = equilibrarDestacadas([nota('a', 6), nota('b', 6), nota('c', 6), nota('p', 3, { lugar: 'puelmapu' })], 3, reglas)
    expect(r).toContain('p')
  })

  it('no más de 3 de cada 10 del mismo feed si hay alternativa', () => {
    const mismo = (id: string) => nota(id, 7, { feed: 'mismo' })
    const otras = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'].map((id) => nota(id, 5))
    const r = equilibrarDestacadas([mismo('m1'), mismo('m2'), mismo('m3'), mismo('m4'), mismo('m5'), ...otras], 10, reglas)
    expect(r.filter((id) => id.startsWith('m'))).toHaveLength(3)
  })

  it('ordena y no quita: si las reglas no se pueden cumplir, llena igual', () => {
    const c = (id: string) => nota(id, 6, { encuadre: 'confrontacion', feed: 'mismo' })
    expect(equilibrarDestacadas([c('c1'), c('c2'), c('c3')], 3, reglas)).toHaveLength(3)
  })

  it('devuelve por nota y, a igual nota, la más reciente primero; sin nota al final', () => {
    const r = equilibrarDestacadas([nota('viejo', 5), nota('nuevo', 5), nota('alto', 8), nota('sin', 0, { nota: null })], 4, reglas)
    expect(r).toEqual(['alto', 'nuevo', 'viejo', 'sin'])
  })

  it('sin parámetros en la base usa los del diseño', () => {
    expect(reglasDestacadas({})).toEqual({ confrontacionMax: 0.3334, porFeedMaxDe10: 3, ejeDirectorMin: 1, puelmapuMin: 1 })
  })
})
