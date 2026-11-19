import { describe, expect, it } from 'vitest'
import { countryName } from './countryName'

describe('countryName', () => {
  it('da el nombre en español de países que no estaban en la lista vieja', () => {
    expect(countryName('CN')).toBe('China')
    expect(countryName('NZ')).toBe('Nueva Zelanda')
    expect(countryName('NO')).toBe('Noruega')
  })

  it('mantiene los nombres de siempre', () => {
    expect(countryName('CL')).toBe('Chile')
    expect(countryName('US')).toBe('Estados Unidos')
    expect(countryName('MX')).toBe('México')
  })

  it('acepta minúsculas y espacios', () => {
    expect(countryName(' pe ')).toBe('Perú')
  })

  it('XX y vacío son «Desconocido»', () => {
    expect(countryName('XX')).toBe('Desconocido')
    expect(countryName('')).toBe('Desconocido')
  })

  it('lo que no es un código de dos letras se devuelve tal cual', () => {
    expect(countryName('Chile')).toBe('Chile')
  })
})
