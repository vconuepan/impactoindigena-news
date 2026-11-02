import { describe, it, expect } from 'vitest'
import { esNoEncontrado } from './noEncontrado'
import { ApiError } from './api'

describe('esNoEncontrado (cuándo una página pide noindex)', () => {
  it('la API respondió 404: no existe', () => {
    expect(esNoEncontrado(new ApiError(404, 'Not found'), undefined)).toBe(true)
  })

  it('la API respondió sin datos y sin error: no existe', () => {
    expect(esNoEncontrado(null, null)).toBe(true)
    expect(esNoEncontrado(null, undefined)).toBe(true)
  })

  // El caso que importa: una caída no puede sacar una página real del índice.
  it('un 500 NO es «no encontrado», aunque tampoco haya datos', () => {
    expect(esNoEncontrado(new ApiError(500, 'Internal'), undefined)).toBe(false)
    expect(esNoEncontrado(new ApiError(503, 'Unavailable'), undefined)).toBe(false)
  })

  it('un error de red NO es «no encontrado»', () => {
    expect(esNoEncontrado(new TypeError('Failed to fetch'), undefined)).toBe(false)
  })

  it('con datos, existe', () => {
    expect(esNoEncontrado(null, { slug: 'x' })).toBe(false)
  })
})
