import { describe, it, expect } from 'vitest'
import { RELEVANCE_PUBLISH_MIN } from '@shared/constants'
import { bajoElPisoDeRelevancia, resumenParaTarjeta } from './story-summary'

// Caso real, medido en vivo el 5-oct-2026 (relevancia 2, publicada el 29-sep y
// servida tambien por /api/feed/cambio-climatico).
const juneau = {
  relevance: 2,
  summary: 'Juneau registra inundaciones por el deshielo de un lago glaciar.',
  summaryEn: 'Juneau records flooding from a glacial lake outburst.',
  relevanceSummary: 'Juneau enfrenta inundaciones por cambio climático sin impacto indígena.',
  relevanceSummaryEn: 'Juneau faces climate flooding with no indigenous impact.',
}

const pertinente = {
  relevance: 8,
  summary: 'La comunidad presentó un recurso de protección.',
  summaryEn: 'The community filed a protection appeal.',
  relevanceSummary: 'Afecta directamente el derecho a consulta de la comunidad.',
  relevanceSummaryEn: 'Directly affects the community’s right to consultation.',
}

describe('bajoElPisoDeRelevancia', () => {
  it('es verdadero solo por debajo del piso, y el piso es el del servidor (5)', () => {
    expect(RELEVANCE_PUBLISH_MIN).toBe(5)
    expect(bajoElPisoDeRelevancia({ relevance: 2 })).toBe(true)
    expect(bajoElPisoDeRelevancia({ relevance: 4 })).toBe(true)
    expect(bajoElPisoDeRelevancia({ relevance: 5 })).toBe(false)
    expect(bajoElPisoDeRelevancia({ relevance: 9 })).toBe(false)
  })

  it('una relevancia desconocida no cuenta como baja', () => {
    expect(bajoElPisoDeRelevancia({ relevance: null })).toBe(false)
  })
})

describe('resumenParaTarjeta', () => {
  it('bajo el piso muestra el resumen plano, nunca la explicacion de descarte', () => {
    expect(resumenParaTarjeta(juneau, false)).toBe(juneau.summary)
    expect(resumenParaTarjeta(juneau, true)).toBe(juneau.summaryEn)
    expect(resumenParaTarjeta(juneau, false)).not.toContain('sin impacto indígena')
  })

  it('bajo el piso y sin traduccion, en ingles cae al resumen en español', () => {
    expect(resumenParaTarjeta({ ...juneau, summaryEn: null }, true)).toBe(juneau.summary)
  })

  it('en el piso o por encima prefiere la explicacion de relevancia, como siempre', () => {
    expect(resumenParaTarjeta(pertinente, false)).toBe(pertinente.relevanceSummary)
    expect(resumenParaTarjeta(pertinente, true)).toBe(pertinente.relevanceSummaryEn)
    expect(resumenParaTarjeta({ ...pertinente, relevance: 5 }, false)).toBe(pertinente.relevanceSummary)
  })

  it('conserva la precedencia de idioma que tenia StoryCard', () => {
    // En ingles sin relevanceSummaryEn: antes que la explicacion en español va el resumen traducido.
    expect(resumenParaTarjeta({ ...pertinente, relevanceSummaryEn: null }, true)).toBe(pertinente.summaryEn)
    // Y sin ninguna traduccion, la explicacion en español.
    expect(resumenParaTarjeta({ ...pertinente, relevanceSummaryEn: null, summaryEn: null }, true)).toBe(pertinente.relevanceSummary)
    // Sin explicacion, el resumen.
    expect(resumenParaTarjeta({ ...pertinente, relevanceSummary: null, relevanceSummaryEn: null }, false)).toBe(pertinente.summary)
  })

  it('con relevancia desconocida se comporta como hasta ahora', () => {
    expect(resumenParaTarjeta({ ...juneau, relevance: null }, false)).toBe(juneau.relevanceSummary)
  })
})
