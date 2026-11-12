import { describe, it, expect, vi } from 'vitest'

vi.mock('../config.js', () => ({
  config: { crawl: { maxSourceAgeMonths: 18 } },
}))

const { checkSourceAge, isSourceTooOld, esViejaParaElDescubrimiento } = await import('./source-age.js')
const { config } = await import('../config.js')

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

describe('esViejaParaElDescubrimiento · los dos casos del B3 (11-nov-2026)', () => {
  // La nota de Pagina/12 entro el 6-oct-2026. Su pagina declara 2025-10-26
  // (JSON-LD) y muestra a la vista el 3-dic-2024. La de Kaos en la Red declara
  // el 10-oct-2026 y es de ese dia.
  const ENTRO = new Date('2026-10-06T19:00:05Z')
  const conVentana = (dias: number, fn: () => void) => {
    const antes = (config.crawl as { maxDiscoverAgeDays?: number }).maxDiscoverAgeDays
    ;(config.crawl as { maxDiscoverAgeDays?: number }).maxDiscoverAgeDays = dias
    try { fn() } finally { (config.crawl as { maxDiscoverAgeDays?: number }).maxDiscoverAgeDays = antes }
  }

  it('sin ventana propia (lo decidido el 17-ago) rige solo el techo de 18 meses: la de Pagina/12, con la fecha que declara su pagina, entra', () => {
    conVentana(0, () => {
      expect(esViejaParaElDescubrimiento('2025-10-26T22:29:21.376Z', ENTRO)).toBe(false)
      // con la fecha que muestra a la vista habria quedado fuera (22 meses)
      expect(esViejaParaElDescubrimiento('2024-12-03', ENTRO)).toBe(true)
    })
  })

  it('con una ventana de 60 dias, como la del crawler RSS, la de Pagina/12 queda fuera y la de Kaos entra', () => {
    conVentana(60, () => {
      expect(esViejaParaElDescubrimiento('2025-10-26T22:29:21.376Z', ENTRO)).toBe(true)
      expect(esViejaParaElDescubrimiento('2026-10-10T05:02:11.000Z', new Date('2026-10-10T11:00:32Z'))).toBe(false)
    })
  })

  it('sin fecha no hay evidencia de antiguedad: no se descarta', () => {
    conVentana(60, () => {
      expect(esViejaParaElDescubrimiento(null, ENTRO)).toBe(false)
      expect(esViejaParaElDescubrimiento(undefined, ENTRO)).toBe(false)
    })
  })
})
