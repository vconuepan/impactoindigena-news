import { describe, expect, it } from 'vitest'
import {
  abreConElMedio,
  avisosBloqueantes,
  hablaDelArticulo,
  limpiarCuerpo,
  revisarCuerpo,
  sinComillasAjenas,
  tramosCopiados,
  type StoryBodyText,
} from './storyBodyGuards.js'

// Fragmentos de los originales con que se midió la nota con claves el
// 25-oct-2026 (Resumen Latinoamericano, Mongabay Latam, The Guardian, MVS).
const ORIGINAL = `La Cámara de Diputados aprobó el proyecto de Ley de Inviolabilidad de la Propiedad Privada, que facilita los desalojos y restringe las expropiaciones. La iniciativa oficialista recogió 124 votos afirmativos, 119 negativos y seis abstenciones. “Las comunidades van a resistir”, sostiene Orlando Carriqueo, referente del Parlamento Mapuche Tehuelche de Río Negro. El 10 de diciembre de 2024, el presidente Javier Milei derogó la Ley 26.160, que prohibía de manera transitoria los desalojos de las tierras comunitarias. Baigun detalla que esta ruta empezó a elevarse en 1998 y se terminó en 2012. Sin embargo, la parte donde están las compuertas fue remplazada hace cuatro años. Sheinbaum también anunció la construcción de dos Bachilleratos Nacionales “Margarita Maza”, un centro deportivo México Imparable y un Centro LIBRE para mujeres en Apatzingán.`

function cuerpo(parcial: Partial<StoryBodyText>): StoryBodyText {
  return {
    bajada: 'Las comunidades mapuche de Río Negro enfrentan una ley que facilita los desalojos, aprobada por la Cámara de Diputados y pendiente en el Senado, según el Parlamento Mapuche Tehuelche de la provincia.',
    quePaso: 'La Cámara aprobó el proyecto con 124 votos a favor y 119 en contra. Orlando Carriqueo, del Parlamento Mapuche Tehuelche, dijo que «Las comunidades van a resistir» y pidió al Senado frenar la ley. El proyecto acorta los juicios de desalojo y encarece las expropiaciones. Las comunidades de Río Negro, Neuquén y Chubut enfrentan causas judiciales. El texto vuelve al Senado con cambios y las organizaciones convocan a presionar a los senadores para que no prospere la iniciativa oficialista en la Cámara Alta.',
    porQueImporta: 'La ley cambia el procedimiento con que un juez puede ordenar el desalojo de una comunidad que disputa su tierra, y hace más cara la expropiación con que el Estado podría resolver esa disputa a favor de la comunidad. Carriqueo advierte que eso deja en indefensión a las familias que reclaman tierras ancestrales en la Patagonia.',
    contexto: 'En 2024 el Gobierno derogó la ley de emergencia territorial que suspendía los desalojos de comunidades. Desde entonces, los tribunales provinciales avanzan en causas de usurpación. El proyecto repone además la Ley de Tierras, que limita la venta a extranjeros, lo que las organizaciones leen como una concesión menor frente a los desalojos.',
    queSigue: 'El proyecto vuelve al Senado, que debe revisar los cambios introducidos en Diputados antes de que pueda convertirse en ley. Las organizaciones mapuche convocan a presionar a los senadores.',
    ...parcial,
  }
}

describe('revisarCuerpo', () => {
  it('un cuerpo fiel no deja avisos bloqueantes', () => {
    const avisos = revisarCuerpo(cuerpo({}), ORIGINAL, 2026)
    expect(avisosBloqueantes(avisos)).toEqual([])
  })

  it('una cifra que el original no da es bloqueante', () => {
    const avisos = revisarCuerpo(cuerpo({ contexto: 'La obra se modificó en 2019 y afecta a 300 familias.' }), ORIGINAL, 2026)
    expect(avisos.map((a) => a.tipo)).toContain('cifra')
    expect(avisos.find((a) => a.tipo === 'cifra')?.mensaje).toContain('2019')
  })

  it('un año posterior al de referencia es bloqueante aunque esté en el original', () => {
    const avisos = revisarCuerpo(cuerpo({ bajada: 'Las comunidades enfrentan la ley aprobada en octubre de 2027.' }), ORIGINAL + ' 2027', 2026)
    expect(avisos.map((a) => a.tipo)).toContain('anio')
  })

  it('un tramo de doce palabras copiado fuera de la cita es bloqueante', () => {
    const avisos = revisarCuerpo(
      cuerpo({ queSigue: 'Se construirán dos Bachilleratos Nacionales Margarita Maza, un centro deportivo México Imparable y un Centro LIBRE para mujeres en Apatzingán.' }),
      ORIGINAL,
      2026,
    )
    expect(avisos.map((a) => a.tipo)).toContain('copia')
  })

  it('hablar del artículo es bloqueante', () => {
    const avisos = revisarCuerpo(cuerpo({ porQueImporta: 'El artículo muestra cómo estas acciones fomentan el derecho de los pueblos.' }), ORIGINAL, 2026)
    expect(avisos.map((a) => a.tipo)).toContain('meta')
  })

  it('la bajada con el medio de sujeto es bloqueante', () => {
    const avisos = revisarCuerpo(cuerpo({ bajada: 'En Voces Indígenas seguimos la ley de desalojos aprobada por Diputados.' }), ORIGINAL, 2026)
    expect(avisos.map((a) => a.tipo)).toContain('agencia')
  })

  it('el largo solo avisa, no bloquea', () => {
    const largos = revisarCuerpo(cuerpo({ bajada: 'Corta.' }), ORIGINAL, 2026)
    expect(largos.filter((a) => a.campo === 'bajada').map((a) => a.tipo)).toEqual(['largo'])
    expect(avisosBloqueantes(largos)).toEqual([])
  })

  it('un queSigue vacío no avisa', () => {
    const avisos = revisarCuerpo(cuerpo({ queSigue: '' }), ORIGINAL, 2026)
    expect(avisos.filter((a) => a.campo === 'queSigue')).toEqual([])
  })
})

describe('limpiarCuerpo', () => {
  it('vacía un queSigue que explica que no hay queSigue', () => {
    const limpio = limpiarCuerpo(cuerpo({ queSigue: 'El artículo no menciona pasos o decisiones futuras específicas.' }), ORIGINAL)
    expect(limpio.queSigue).toBe('')
  })

  it('quita las comillas de una cita traducida y deja la cita textual', () => {
    const texto = 'Hekurari advierte: "Al votar 22, los brasileños firman un certificado de defunción". Carriqueo dijo que «Las comunidades van a resistir».'
    const limpio = sinComillasAjenas(texto, ORIGINAL)
    expect(limpio).toBe('Hekurari advierte: Al votar 22, los brasileños firman un certificado de defunción. Carriqueo dijo que «Las comunidades van a resistir».')
  })
})

describe('tramosCopiados', () => {
  it('encuentra el tramo y lo cuenta una sola vez por racha', () => {
    const copia = 'Antes de eso, la Cámara de Diputados aprobó el proyecto de Ley de Inviolabilidad de la Propiedad Privada, que facilita los desalojos y restringe las expropiaciones, y luego siguió.'
    expect(tramosCopiados(copia, ORIGINAL)).toHaveLength(1)
  })

  it('no salta con once palabras ni con la cita', () => {
    expect(tramosCopiados('aprobó el proyecto de Ley de Inviolabilidad de la Propiedad Privada', ORIGINAL)).toEqual([])
    expect(tramosCopiados('Dijo: «Las comunidades van a resistir», y nada más que eso dijo esa tarde.', ORIGINAL)).toEqual([])
  })
})

describe('agencia y meta', () => {
  it.each(['Voces Indígenas publica…', 'En Voces Indígenas vemos…', 'Nosotros creemos…', 'Cubrimos la ley…'])('%s abre con el medio', (t) => {
    expect(abreConElMedio(t)).toBe(true)
  })
  it('los pueblos de sujeto no abren con el medio', () => {
    expect(abreConElMedio('Las comunidades mapuche enfrentan…')).toBe(false)
  })
  it.each(['El artículo muestra', 'Según la nota,', 'Este reportaje indica'])('%s habla del artículo', (t) => {
    expect(hablaDelArticulo(t)).toBe(true)
  })
  it('nombrar un artículo de ley no es hablar del artículo', () => {
    expect(hablaDelArticulo('El artículo 19 de la Constitución…')).toBe(false)
  })
})
