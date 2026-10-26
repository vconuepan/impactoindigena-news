import { describe, expect, it } from 'vitest'
import { buildEditorialPrompt } from './editorial.js'
import { REGLAS_FUNDACION, VOZ_VENANCIO_ADN, VOZ_VENANCIO_EVITAR } from './voz-venancio.js'

const notas = `Esta semana Diputados aprobó en Argentina la ley de inviolabilidad de la propiedad privada, con desalojos exprés. Mi lectura: no se trata de orden público, sino de una disputa de propiedad no resuelta desde 1881-1883. Propongo mirar Waitangi: un tratado que se honra, no un juicio que se gana.`

describe('buildEditorialPrompt', () => {
  const prompt = buildEditorialPrompt({ notes: notas, title: 'Desalojos exprés', weekLabel: 'semana 43 de 2026' })

  it('parte de las notas del director y las lleva enteras', () => {
    expect(prompt).toContain('<NOTAS_DEL_AUTOR>')
    expect(prompt).toContain('1881-1883')
    expect(prompt).toContain('Waitangi')
  })

  it('lleva la voz verificada y las reglas institucionales, en un solo lugar', () => {
    expect(prompt).toContain(VOZ_VENANCIO_ADN)
    expect(prompt).toContain(VOZ_VENANCIO_EVITAR)
    expect(prompt).toContain(REGLAS_FUNDACION)
  })

  it('no trae la identidad vieja escrita a mano ni la firma dentro del texto', () => {
    // Hasta el 25-oct-2026: «Fundaste Impacto Indígena (2023)», el IRI, Codelco y
    // BHP, y una firma pegada al final del cuerpo. Nada de eso está verificado
    // en el perfil de voz, y la firma la pone el código desde authorName.
    expect(prompt).not.toMatch(/Impacto Indígena \(2023\)/)
    expect(prompt).not.toMatch(/IRI/)
    expect(prompt).not.toMatch(/Codelco|BHP/)
    expect(prompt).not.toMatch(/— Venancio/)
    expect(prompt).toMatch(/No escribas la firma/)
  })

  it('no abre con <ROLE> ni pide la IA dentro del texto', () => {
    expect(prompt).not.toContain('<ROLE>')
    expect(prompt).toMatch(/No menciones la inteligencia artificial/)
  })

  it('no mira las noticias de la semana', () => {
    expect(prompt).not.toContain('<NOTICIAS_DE_LA_SEMANA>')
    expect(prompt).not.toContain('<STORY>')
  })
})
