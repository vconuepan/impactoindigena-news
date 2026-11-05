import { describe, expect, it } from 'vitest'
import { seleccionarParaRedactar } from './storyBodySeleccion.js'

const f = (id: string, relevance: number | null) => ({ id, relevance })

describe('seleccionarParaRedactar', () => {
  it('deja fuera lo que no llega a la relevancia mínima', () => {
    const r = seleccionarParaRedactar([f('a', 9), f('b', 7), f('c', 8)], 8, 0)
    expect(r.elegidas).toEqual(['a', 'c'])
    expect(r.descartadas).toBe(1)
  })

  it('una noticia sin relevancia no se redacta sola', () => {
    const r = seleccionarParaRedactar([f('a', null), f('b', 8)], 8, 0)
    expect(r.elegidas).toEqual(['b'])
    expect(r.descartadas).toBe(1)
  })

  it('con tope, se queda con las más relevantes y desempata por orden de llegada', () => {
    const r = seleccionarParaRedactar([f('a', 8), f('b', 10), f('c', 9), f('d', 8), f('e', 9)], 8, 3)
    expect(r.elegidas).toEqual(['b', 'c', 'e'])
    expect(r.descartadas).toBe(2)
  })

  it('un tope de cero o negativo lo quita', () => {
    const filas = [f('a', 8), f('b', 8), f('c', 8)]
    expect(seleccionarParaRedactar(filas, 8, 0).elegidas).toHaveLength(3)
    expect(seleccionarParaRedactar(filas, 8, -1).elegidas).toHaveLength(3)
  })

  it('sin filas no hay nada que redactar', () => {
    expect(seleccionarParaRedactar([], 8, 4)).toEqual({ elegidas: [], descartadas: 0 })
  })
})
