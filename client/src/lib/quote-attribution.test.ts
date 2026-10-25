import { describe, expect, it } from 'vitest'
import { esFraseDelArticulo } from './quote-attribution'

describe('esFraseDelArticulo', () => {
  it('reconoce el marcador en los dos idiomas', () => {
    expect(esFraseDelArticulo('Artículo original')).toBe(true)
    expect(esFraseDelArticulo('Original article')).toBe(true)
    expect(esFraseDelArticulo('  Artículo original ')).toBe(true)
  })

  it('una persona o una organización sí es una cita', () => {
    expect(esFraseDelArticulo('Orlando Carriqueo, referente del Parlamento Mapuche de Río Negro')).toBe(false)
    expect(esFraseDelArticulo('Mongabay Latam')).toBe(false)
  })

  it('sin atribución no hay a quién atribuir', () => {
    expect(esFraseDelArticulo(null)).toBe(true)
    expect(esFraseDelArticulo('')).toBe(true)
  })
})
