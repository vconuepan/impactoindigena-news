import { describe, it, expect, vi } from 'vitest'

vi.mock('../config.js', () => ({
  config: { crawl: { maxSourceAgeMonths: 18 } },
}))

const { checkSourceAge, isSourceTooOld } = await import('./source-age.js')

const AHORA = new Date('2026-08-17T12:00:00Z')
const meses = (n: number) => new Date(AHORA.getTime() - n * 30.44 * 24 * 60 * 60 * 1000)

describe('techo de antigüedad del artículo original', () => {
  it('acepta lo reciente', () => {
    expect(isSourceTooOld(AHORA, AHORA)).toBe(false)
    expect(isSourceTooOld(meses(1), AHORA)).toBe(false)
    expect(isSourceTooOld(meses(12), AHORA)).toBe(false)
  })

  it('acepta justo en el límite y rechaza pasándolo', () => {
    expect(isSourceTooOld(meses(18), AHORA)).toBe(false)
    expect(isSourceTooOld(meses(19), AHORA)).toBe(true)
  })

  it('rechaza lo que el discover venía publicando', () => {
    // Casos REALES de la base, medidos el 17-ago: 30 de las 61 historias
    // publicadas el 16 y 17 superaban el techo. Estas son las más viejas.
    expect(isSourceTooOld('2011-05-02', AHORA)).toBe(true) // "CONADI apoyó 2011 emprendimiento"
    expect(isSourceTooOld('2016-09-29', AHORA)).toBe(true) // "Empresas violan derechos… Yucatán"
    expect(isSourceTooOld('2020-09-03', AHORA)).toBe(true) // "Corfo anuncia fondo para empresas indígenas"
  })

  it('informa la antigüedad en meses, para que el log sirva', () => {
    expect(checkSourceAge(meses(24), AHORA).ageMonths).toBe(24)
    expect(checkSourceAge('2020-09-03', AHORA).ageMonths).toBeGreaterThan(60)
  })

  describe('sin fecha NO es lo mismo que viejo', () => {
    it('deja pasar lo que no trae fecha', () => {
      // La ausencia de dato no prueba antigüedad, y descartar por sospecha
      // perdería cobertura legítima: los medios que no publican fecha existen.
      expect(isSourceTooOld(null, AHORA)).toBe(false)
      expect(isSourceTooOld(undefined, AHORA)).toBe(false)
      expect(isSourceTooOld('', AHORA)).toBe(false)
      expect(checkSourceAge(null, AHORA).ageMonths).toBeNull()
    })

    it('deja pasar una fecha que no parsea', () => {
      expect(isSourceTooOld('no es una fecha', AHORA)).toBe(false)
    })
  })

  it('no trata una fecha futura como material viejo', () => {
    // Un pubDate en el futuro es un error de la fuente, no archivo.
    const manana = new Date(AHORA.getTime() + 24 * 60 * 60 * 1000)
    expect(isSourceTooOld(manana, AHORA)).toBe(false)
    expect(checkSourceAge(manana, AHORA).ageMonths).toBe(0)
  })

  it('acepta Date y cadena ISO por igual', () => {
    expect(isSourceTooOld(new Date('2011-05-02'), AHORA)).toBe(true)
    expect(isSourceTooOld('2011-05-02T00:00:00.000Z', AHORA)).toBe(true)
  })
})

describe('con el techo desactivado', () => {
  it('no descarta nada', async () => {
    vi.resetModules()
    vi.doMock('../config.js', () => ({ config: { crawl: { maxSourceAgeMonths: 0 } } }))
    const mod = await import('./source-age.js')
    expect(mod.isSourceTooOld('1990-01-01', AHORA)).toBe(false)
    vi.doUnmock('../config.js')
  })
})
