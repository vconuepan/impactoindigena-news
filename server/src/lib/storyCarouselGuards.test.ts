import { describe, it, expect } from 'vitest'
import {
  extraerCitas,
  citaEsTextual,
  identidadSinRespaldo,
  pueblosSinRespaldo,
  cifrasSinRespaldo,
  temaRespaldado,
  revisarCarrusel,
} from './storyCarouselGuards.js'

const ORIGINAL_ES = `La comunidad mapuche Txokin Pehuen presentó su plan de manejo del bosque nativo.
"Este bosque es nuestra farmacia y nuestra escuela", dijo la lonko María Huenchullán durante la reunión.
Las familias aymaras de Colchane también participaron.`

// El caso medido el 8-sep-2026: el reportaje nunca dice «indígena».
const ORIGINAL_INTAG = `Diecinueve familias y comunidades locales de Intag organizaron mingas para
frenar la hidroeléctrica. Los vecinos dicen que el río es su sustento.`

const ORIGINAL_EN = `"We will not give up our land," said community leader Ana Silva, who spoke for the
Indigenous families affected by the dam.`

describe('extraerCitas', () => {
  it('encuentra las comillas angulares, las tipográficas y las rectas', () => {
    expect(extraerCitas('Dijo «uno», luego “dos” y al final "tres".')).toEqual(['uno', 'dos', 'tres'])
  })

  it('devuelve vacío si no hay comillas', () => {
    expect(extraerCitas('La lonko explicó que el bosque es su escuela.')).toEqual([])
  })
})

describe('citaEsTextual', () => {
  it('acepta la cita literal aunque cambien las comillas, las mayúsculas y la puntuación final', () => {
    expect(citaEsTextual('Este bosque es nuestra farmacia y nuestra escuela.', ORIGINAL_ES)).toBe(true)
    expect(citaEsTextual('este BOSQUE es nuestra farmacia', ORIGINAL_ES)).toBe(true)
  })

  it('acepta fragmentos separados por elipsis si cada uno está', () => {
    expect(citaEsTextual('Este bosque … nuestra escuela', ORIGINAL_ES)).toBe(true)
  })

  it('rechaza una paráfrasis', () => {
    expect(citaEsTextual('El bosque es nuestra botica', ORIGINAL_ES)).toBe(false)
  })

  it('rechaza una traducción entre comillas de algo dicho en otro idioma', () => {
    expect(citaEsTextual('No vamos a renunciar a nuestra tierra', ORIGINAL_EN)).toBe(false)
  })
})

describe('identidadSinRespaldo', () => {
  it('marca «indígena» cuando el original no lo dice ni nombra a un pueblo (caso Intag)', () => {
    expect(identidadSinRespaldo('Familias indígenas de Intag frenan una hidroeléctrica', ORIGINAL_INTAG)).toBe(true)
  })

  it('no marca si el original dice indígena, en cualquier idioma', () => {
    expect(identidadSinRespaldo('Familias indígenas afectadas por la represa', ORIGINAL_EN)).toBe(false)
  })

  it('no marca si el original nombra al pueblo', () => {
    expect(identidadSinRespaldo('Una comunidad indígena presentó su plan', ORIGINAL_ES)).toBe(false)
  })

  it('no marca un texto que no atribuye identidad', () => {
    expect(identidadSinRespaldo('Diecinueve familias organizaron mingas', ORIGINAL_INTAG)).toBe(false)
  })
})

describe('pueblosSinRespaldo', () => {
  it('reconoce las grafías y el plural: «aimara» contra «aymaras»', () => {
    expect(pueblosSinRespaldo('Participaron familias aimara', ORIGINAL_ES)).toEqual([])
  })

  it('marca un pueblo que el original no nombra', () => {
    expect(pueblosSinRespaldo('Familias mapuche de Intag', ORIGINAL_INTAG)).toEqual(['mapuche'])
  })

  it('no confunde un verbo con un pueblo', () => {
    expect(pueblosSinRespaldo('La lonko cree que el bosque se puede recuperar', ORIGINAL_ES)).toEqual([])
  })
})

// El caso de la primera prueba real (23-oct-2026): Mongabay decía «el lunes
// 19 de octubre» y el modelo escribió «el 19 de octubre de 2024».
const ORIGINAL_MONGABAY = `La propuesta ingresó al Parlamento el lunes 19 de octubre. El sitio web del
Reinfo reporta 23 211 registros de mineros, con un plazo que vence el 30 de junio de 2028.`

describe('cifrasSinRespaldo', () => {
  it('marca un año que el original no da', () => {
    expect(cifrasSinRespaldo('El proyecto llegó al Congreso el 19 de octubre de 2024.', ORIGINAL_MONGABAY)).toEqual(['2024'])
  })

  it('acepta las cifras del original aunque cambie el separador de miles', () => {
    expect(cifrasSinRespaldo('Hay 23.211 registros y el plazo vence en junio de 2028.', ORIGINAL_MONGABAY)).toEqual([])
  })

  it('no ve cifras donde no hay', () => {
    expect(cifrasSinRespaldo('El Congreso tiene dos meses para debatirla.', ORIGINAL_MONGABAY)).toEqual([])
  })
})

describe('temaRespaldado', () => {
  it('omite un tema que dice «indígena» si el original no lo respalda (caso Intag)', () => {
    expect(temaRespaldado('Derechos Indígenas', ORIGINAL_INTAG)).toBe('')
  })

  it('deja el tema si el original lo respalda, o si no atribuye identidad', () => {
    expect(temaRespaldado('Derechos Indígenas', ORIGINAL_ES)).toBe('Derechos Indígenas')
    expect(temaRespaldado('Territorio y Tierras', ORIGINAL_INTAG)).toBe('Territorio y Tierras')
  })
})

describe('revisarCarrusel', () => {
  it('ubica cada aviso en su lámina y en la lectura', () => {
    const avisos = revisarCarrusel(
      [
        { titulo: 'Familias indígenas frenan la represa', texto: 'Diecinueve familias de Intag.' },
        { titulo: 'Lo que dicen', texto: 'Un vecino dijo «el río es nuestra vida».' },
        { titulo: 'Qué viene', texto: 'La decisión está pendiente.' },
      ],
      { titulo: 'A mi juicio', texto: 'El pueblo mapuche conoce este camino.' },
      ORIGINAL_INTAG,
    )
    expect(avisos.map((a) => [a.lamina, a.tipo])).toEqual([
      [0, 'identidad'],
      [1, 'cita'],
      ['lectura', 'pueblo'],
    ])
  })

  it('la regla de cifras vale para las láminas informativas, no para la lectura', () => {
    const avisos = revisarCarrusel(
      [
        { titulo: 'Llega al Congreso', texto: 'El 19 de octubre de 2024.' },
        { titulo: 'Qué viene', texto: 'El plazo vence en 2028.' },
      ],
      { titulo: 'A mi juicio', texto: 'El Estado tiene deberes desde el Convenio 169.' },
      ORIGINAL_MONGABAY,
    )
    expect(avisos.map((x) => [x.lamina, x.tipo])).toEqual([[0, 'cifra']])
  })

  it('no avisa nada sobre un carrusel fiel al original', () => {
    const avisos = revisarCarrusel(
      [
        { titulo: 'La comunidad Txokin Pehuen cuida su bosque', texto: 'Presentó su plan de manejo.' },
        { titulo: 'Bosque y escuela', texto: 'La lonko dijo: «Este bosque es nuestra farmacia y nuestra escuela».' },
        { titulo: 'También Colchane', texto: 'Participaron familias aymaras.' },
      ],
      null,
      ORIGINAL_ES,
    )
    expect(avisos).toEqual([])
  })
})
