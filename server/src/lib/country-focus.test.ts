import { describe, it, expect } from 'vitest'
import {
  normalizeCountry,
  GEOGRAPHIC_ISSUE_SLUGS,
  GEOGRAPHIC_ISSUE_COUNTRY,
  GEOGRAPHIC_ISSUE_COUNTRIES,
  REGIONS,
} from './country-focus.js'

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

  it('toda seccion geografica esta en GEOGRAPHIC_ISSUE_SLUGS', () => {
    // La lista se escribia a mano y se desincronizo: el 5-sep-2026 se crearon
    // seis secciones y quedo con las dos viejas, asi que el clasificador las
    // vio como temas de asunto y archivo diez historias en ellas. Ahora se
    // deriva, y esto lo sostiene.
    for (const slug of Object.keys(GEOGRAPHIC_ISSUE_COUNTRIES)) {
      expect(GEOGRAPHIC_ISSUE_SLUGS).toContain(slug)
    }
    expect(GEOGRAPHIC_ISSUE_SLUGS.length).toBe(Object.keys(GEOGRAPHIC_ISSUE_COUNTRIES).length)
  })

  it('cada pais de cada region se reconoce por su codigo', () => {
    // Sin esto, un pais de la region que el mapa de nombres no conoce nunca
    // recibe historias: la seccion existe y queda vacia para siempre.
    for (const [region, paises] of Object.entries(REGIONS)) {
      for (const codigo of paises as readonly string[]) {
        expect(normalizeCountry(codigo), `${codigo} de ${region}`).toBe(codigo)
      }
    }
  })

  it('Namibia gana a "no aplica" solo cuando llega como codigo exacto', () => {
    // NA es el codigo ISO de Namibia y tambien la abreviatura de "no aplica".
    // NOT_A_COUNTRY se consultaba primero y se comia a Namibia entera.
    expect(normalizeCountry('NA')).toBe('NA')
    expect(normalizeCountry('Namibia')).toBe('NA')
    // Y lo que el modelo escribe de verdad para decir que no hay pais sigue
    // siendo nulo, que es el caso que la lista protege.
    for (const v of ['na', 'n/a', 'N/A', 'Na', 'ninguno', 'global']) {
      expect(normalizeCountry(v), v).toBeNull()
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
