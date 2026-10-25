import { describe, it, expect } from 'vitest'
import {
  parseLlmPublicationDate,
  yearsAfter,
  stripImpossibleHistoricalYear,
  stripImpossibleHistoricalYearOrNull,
} from './future-year.js'

const HOY = new Date('2026-10-25T12:00:00Z')

describe('parseLlmPublicationDate', () => {
  it('acepta una fecha pasada válida', () => {
    expect(parseLlmPublicationDate('2026-10-23 00:00:00', HOY)?.getFullYear()).toBe(2026)
  })

  it('el centinela 1970, vacío o inválido es «no la encontré»', () => {
    expect(parseLlmPublicationDate('1970-01-01 00:00:00', HOY)).toBeUndefined()
    expect(parseLlmPublicationDate('', HOY)).toBeUndefined()
    expect(parseLlmPublicationDate(null, HOY)).toBeUndefined()
    expect(parseLlmPublicationDate('ayer', HOY)).toBeUndefined()
  })

  it('una fecha de publicación futura es imposible y se descarta', () => {
    // La nota argentina del 23-oct-2026 traía en su bajada «23 de octubre de
    // 2027»; hasta el 25-oct-2026 esa fecha pisaba la del feed.
    expect(parseLlmPublicationDate('2027-10-23 00:00:00', HOY)).toBeUndefined()
    expect(parseLlmPublicationDate('2026-11-30 00:00:00', HOY)).toBeUndefined()
  })

  it('tolera un día por zonas horarias', () => {
    expect(parseLlmPublicationDate('2026-10-26 00:00:00', HOY)).toBeInstanceOf(Date)
  })
})

describe('yearsAfter', () => {
  it('devuelve los años posteriores al de referencia, sin repetir y ordenados', () => {
    expect(yearsAfter('En 2027, la Cámara aprobó el presupuesto 2027 y la meta 2030', 2026)).toEqual([2027, 2030])
  })

  it('ignora los años iguales o anteriores, los números que no son años y el vacío', () => {
    expect(yearsAfter('En 2025, líderes firmaron; 2026 fue clave; 20270 personas', 2026)).toEqual([])
    expect(yearsAfter(null, 2026)).toEqual([])
  })
})

describe('stripImpossibleHistoricalYear', () => {
  // Casos reales del 25-oct-2026 (noticia publicada en 2026).
  it('quita «En 2027, » cuando la oración relata en pretérito', () => {
    const resumen =
      'En 2027, la Cámara de Diputados aprobó un proyecto de ley que facilita desalojos exprés y restringe expropiaciones, afectando negativamente a pueblos indígenas, campesinos y sectores vulnerables.'
    expect(stripImpossibleHistoricalYear(resumen, 2026)).toBe(
      'La Cámara de Diputados aprobó un proyecto de ley que facilita desalojos exprés y restringe expropiaciones, afectando negativamente a pueblos indígenas, campesinos y sectores vulnerables.',
    )
    expect(stripImpossibleHistoricalYear('En 2027, Argentina aprobó una ley que facilita desalojos exprés.', 2026)).toBe(
      'Argentina aprobó una ley que facilita desalojos exprés.',
    )
  })

  it('NO toca « en 2027» al cierre, aunque haya pretérito: ahí el año fecha al objeto, no al verbo', () => {
    // Casos reales del 25-oct-2026 que una regla de cierre habría roto.
    for (const legitimo of [
      'Se planeó un panel de alto nivel en 2027 y la posible organización de una Segunda Conferencia Mundial en 2028.',
      'La ONU acordó celebrar la conferencia en 2028.',
      'Líderes mapuches firmaron el acuerdo en 2027.',
    ]) {
      expect(stripImpossibleHistoricalYear(legitimo, 2026)).toBe(legitimo)
    }
  })

  it('no toca los años que nombran una edición, un presupuesto o un plan', () => {
    for (const legitimo of [
      'La diputada denunció los recortes al presupuesto 2027 que afectan a políticas indígenas.',
      'El ministerio lanzó la 30ª versión del Fondo de Protección Ambiental 2027.',
      'Se firmó el Plan Regional de Revitalización Cultural 2026-2028 tras un proceso participativo.',
      'Un informe del proyecto Amazônia 2030 alertó sobre graves impactos.',
    ]) {
      expect(stripImpossibleHistoricalYear(legitimo, 2026)).toBe(legitimo)
    }
  })

  it('solo toca la oración afectada', () => {
    const texto = 'Hubo protestas en la capital. En 2027, la corte falló a favor de la comunidad. El caso sigue abierto.'
    expect(stripImpossibleHistoricalYear(texto, 2026)).toBe(
      'Hubo protestas en la capital. La corte falló a favor de la comunidad. El caso sigue abierto.',
    )
  })

  it('no toca un año futuro con verbo en futuro: es un evento anunciado', () => {
    for (const legitimo of [
      'Chile será sede del Foro Mundial de Negocios Indígenas 2027.',
      'En 2027, se realizará el Foro Mundial de Negocios Indígenas en Santiago.',
      'El OPLE convoca una consulta para las candidaturas indígenas de 2027.',
      'La comisión aprobó el presupuesto para 2027.',
      'El foro se celebrará en 2027.',
    ]) {
      expect(stripImpossibleHistoricalYear(legitimo, 2026)).toBe(legitimo)
    }
  })

  it('no toca una oración ambigua, con pretérito y futuro a la vez', () => {
    const ambigua = 'En 2027, el gobierno aprobó un plan que regirá hasta 2030.'
    expect(stripImpossibleHistoricalYear(ambigua, 2026)).toBe(ambigua)
  })

  it('no toca un año igual o anterior al de referencia: la noticia histórica se fecha a propósito', () => {
    const historica = 'En 2025, líderes mapuches firmaron un acuerdo con el Estado.'
    expect(stripImpossibleHistoricalYear(historica, 2026)).toBe(historica)
    expect(stripImpossibleHistoricalYear('En 2026, la Cámara aprobó la ley.', 2026)).toBe('En 2026, la Cámara aprobó la ley.')
  })

  it('la variante OrNull devuelve null para vacío', () => {
    expect(stripImpossibleHistoricalYearOrNull(null, 2026)).toBeNull()
    expect(stripImpossibleHistoricalYearOrNull('', 2026)).toBeNull()
    expect(stripImpossibleHistoricalYearOrNull('En 2027, Argentina aprobó la ley.', 2026)).toBe('Argentina aprobó la ley.')
  })
})
