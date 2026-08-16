import { describe, it, expect } from 'vitest'
import { normalizeCountry, GEOGRAPHIC_ISSUE_SLUGS, GEOGRAPHIC_ISSUE_COUNTRY } from './country-focus.js'

describe('normalizeCountry', () => {
  it('lleva el nombre en español al codigo ISO', () => {
    expect(normalizeCountry('Chile')).toBe('CL')
    expect(normalizeCountry('Brasil')).toBe('BR')
    expect(normalizeCountry('México')).toBe('MX')
    expect(normalizeCountry('Perú')).toBe('PE')
  })

  it('no depende de tildes, mayusculas ni espacios sobrantes', () => {
    // El modelo escribe el nombre libremente; la normalizacion es del codigo.
    expect(normalizeCountry('MÉXICO')).toBe('MX')
    expect(normalizeCountry('mexico')).toBe('MX')
    expect(normalizeCountry('  Costa   Rica  ')).toBe('CR')
    expect(normalizeCountry('peru')).toBe('PE')
  })

  it('es idempotente sobre un codigo ya normalizado', () => {
    // El backfill puede correr dos veces sobre la misma fila.
    expect(normalizeCountry('CL')).toBe('CL')
    expect(normalizeCountry(normalizeCountry('Chile'))).toBe('CL')
  })

  it('devuelve null para lo que no es un pais', () => {
    // Un articulo global o regional no tiene pais, y eso es correcto y comun.
    expect(normalizeCountry('')).toBeNull()
    expect(normalizeCountry('global')).toBeNull()
    expect(normalizeCountry('América Latina')).toBeNull()
    expect(normalizeCountry('Amazonía')).toBeNull()
    expect(normalizeCountry('internacional')).toBeNull()
    expect(normalizeCountry(null)).toBeNull()
    expect(normalizeCountry(undefined)).toBeNull()
  })

  it('devuelve null antes que adivinar', () => {
    // Marcar mal pone la historia en la seccion de otro pais; no marcar solo
    // la deja fuera de la suya. El error barato es no marcar.
    expect(normalizeCountry('Wallmapu')).toBeNull()
    expect(normalizeCountry('ZZ')).toBeNull()
    expect(normalizeCountry('un lugar cualquiera')).toBeNull()
  })
})

describe('secciones geograficas', () => {
  it('cada seccion geografica declara su pais', () => {
    for (const slug of GEOGRAPHIC_ISSUE_SLUGS) {
      expect(GEOGRAPHIC_ISSUE_COUNTRY[slug]).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('el pais de cada seccion sobrevive a la normalizacion', () => {
    // Si un dia alguien escribe 'cl' o 'Chile' aca, la condicion de la seccion
    // dejaria de coincidir con lo que guarda el pipeline y la seccion quedaria
    // vacia sin que ningun test lo note.
    for (const slug of GEOGRAPHIC_ISSUE_SLUGS) {
      const code = GEOGRAPHIC_ISSUE_COUNTRY[slug]
      expect(normalizeCountry(code)).toBe(code)
    }
  })
})
