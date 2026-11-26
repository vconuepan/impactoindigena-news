import { describe, it, expect } from 'vitest'
import { fechaDelOriginal, anioDelOriginal } from './fechaDelOriginal.js'

describe('fechaDelOriginal y anioDelOriginal', () => {
  it('un día sin hora es ese día, aunque en Chile esa medianoche sea la víspera', () => {
    expect(fechaDelOriginal(new Date('2026-10-21T00:00:00.000Z'))).toBe('21 de octubre de 2026')
  })

  it('una fecha con hora se lee en hora de Chile', () => {
    expect(fechaDelOriginal(new Date('2026-10-22T02:00:00Z'))).toBe('21 de octubre de 2026')
  })

  it('el año sigue la misma regla, también en el borde de enero', () => {
    expect(anioDelOriginal(new Date('2027-01-01T00:00:00.000Z'))).toBe(2027)
    // 02:00 UTC del 1 de enero son las 23:00 del 31 de diciembre en Chile.
    expect(anioDelOriginal(new Date('2027-01-01T02:00:00Z'))).toBe(2026)
  })
})
