import { describe, it, expect } from 'vitest'
import { VOZ_VENANCIO_ADN, VOZ_VENANCIO_EVITAR, REGLAS_FUNDACION } from './voz-venancio.js'
import { buildLinkedInPostPrompt } from './linkedin.js'
import { buildInstagramCaptionPrompt } from './instagram.js'

const story = {
  title: 'comunidades mapuche lanzaron cooperativa de energía en La Araucanía',
  titleLabel: 'energía comunitaria',
  summary: 'Resumen de la noticia.',
  relevanceSummary: 'Por qué importa.',
  relevanceReasons: 'Factores clave.',
  marketingBlurb: 'Blurb.',
  issueName: 'Economías Indígenas',
  sourceCountry: 'Chile',
}

const superficies: [string, string][] = [
  ['LinkedIn', buildLinkedInPostPrompt(story)],
  ['Instagram', buildInstagramCaptionPrompt(story)],
]

describe('los prompts en primera persona llevan la voz de Venancio', () => {
  for (const [nombre, prompt] of superficies) {
    describe(nombre, () => {
      it('incluye el ADN, lo que se evita y las reglas institucionales', () => {
        // Los tres bloques viven en un solo archivo a proposito: una voz escrita
        // dos veces es una voz que se desincroniza.
        expect(prompt).toContain(VOZ_VENANCIO_ADN)
        expect(prompt).toContain(VOZ_VENANCIO_EVITAR)
        expect(prompt).toContain(REGLAS_FUNDACION)
      })

      it('nombra los cinco rasgos de su ADN', () => {
        for (const rasgo of ['tercera vía', 'ruka grande', 'küpalme', 'Waitangi', 'autodeterminación']) {
          expect(prompt.toLowerCase()).toContain(rasgo.toLowerCase())
        }
      })

      it('pide que el sujeto sean los pueblos, no él ni la plataforma', () => {
        // Regla de lenguaje de la Fundación: la agencia es de los pueblos.
        expect(prompt).toMatch(/sujeto de la primera frase|sujeto en las personas o comunidades/)
      })

      it('no arrastra la estructura de influencer que tenía antes', () => {
        // El prompt viejo pedia "gancho contraintuitivo" y cierre con "pregunta
        // provocadora": el arco del influencer de LinkedIn, que empuja al
        // registro columnista-combativo. El perfil lo reserva para coyuntura
        // polemica explicita, no para la noticia del dia.
        expect(prompt).not.toMatch(/dato contraintuitivo|pregunta incómoda|provocadora/i)
        expect(prompt).toMatch(/[Ss]in pregunta al lector/)
      })
    })
  }
})

describe('los guardarraíles que el perfil de voz exige', () => {
  it('prohíbe "conflicto mapuche", que borra al Estado del cuadro', () => {
    expect(VOZ_VENANCIO_EVITAR).toContain('conflicto mapuche')
    expect(VOZ_VENANCIO_EVITAR).toContain('La Araucanía')
  })

  it('fija la postura CONDICIONAL sobre reformas, no el rechazo', () => {
    // El corpus contradice el rechazo de plano: la plantilla real es "se
    // necesitan, pero solo si tienen propósito intercultural".
    expect(VOZ_VENANCIO_EVITAR).toMatch(/Reconocimiento Constitucional/)
    expect(VOZ_VENANCIO_EVITAR).toMatch(/condicional/i)
  })

  it('deja los chilenismos y la cifra-arma fuera', () => {
    expect(VOZ_VENANCIO_EVITAR).toMatch(/chilenismos/i)
    expect(VOZ_VENANCIO_EVITAR).toMatch(/cifra como arma/i)
  })

  it('bloquea las frases de marca que NO están verificadas en su corpus', () => {
    expect(VOZ_VENANCIO_EVITAR).toContain('IA con IA')
    expect(VOZ_VENANCIO_EVITAR).toMatch(/80%/)
  })

  it('advierte contra sobre-densificar, que es el error más común', () => {
    expect(VOZ_VENANCIO_EVITAR).toMatch(/densidad pareja suena falsa/i)
  })
})

describe('reglas de lenguaje de la Fundación', () => {
  it('deja claro que el Convenio 169 obliga al Estado, no a la empresa', () => {
    expect(REGLAS_FUNDACION).toMatch(/obliga al ESTADO, no a la empresa/)
    expect(REGLAS_FUNDACION).toContain('IFC PS7')
    expect(REGLAS_FUNDACION).toContain('GRI 204')
  })

  it('prohíbe el vocabulario de diversidad corporativa', () => {
    for (const term of ['diversidad de proveedores', 'gasto diverso', 'minorías']) {
      expect(REGLAS_FUNDACION).toContain(term)
    }
  })

  it('descarta el marco de competencia con pares indígenas', () => {
    expect(REGLAS_FUNDACION).toMatch(/no hay competencia/i)
    expect(REGLAS_FUNDACION).toContain('Supply Nation')
  })

  it('impide inflar el respaldo institucional', () => {
    expect(REGLAS_FUNDACION).toMatch(/No inflar el respaldo institucional/)
  })
})

describe('el Convenio 169 en la nota de país', () => {
  it('lo presenta como deber del Estado en las dos superficies', () => {
    // Antes decia solo "conéctala con CONADI, el Convenio 169", sin el
    // guardarraíl, en la superficie que leen los ejecutivos.
    for (const [, prompt] of superficies) {
      expect(prompt).toMatch(/deber de consulta del Estado bajo el Convenio 169/)
    }
  })
})
