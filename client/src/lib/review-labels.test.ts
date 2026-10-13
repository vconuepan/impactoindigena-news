import { describe, it, expect } from 'vitest'
import { razonLabel, terminosDe, puntajeLabel, terminoVisible, marcarTerminos, textoCorto } from './review-labels'

describe('etiquetas de la revisión por marca', () => {
  it('traduce las razones del gate', () => {
    expect(razonLabel('frame:confrontacion')).toEqual({ texto: 'Encuadre: confrontacion', variant: 'red' })
    expect(razonLabel('listA:condena')).toEqual({ texto: 'Lista A: condena', variant: 'orange' })
    expect(razonLabel('listB+corroborated:policia').texto).toBe('Lista B (corroborada): policia')
    expect(razonLabel('learning_mode').texto).toBe('Modo aprendizaje')
    // B+B (11-oct-2026): dos familias de la Lista B se corroboran entre sí.
    expect(razonLabel('listB+B:tribunal')).toEqual({ texto: 'Lista B (dos familias): tribunal', variant: 'yellow' })
    expect(razonLabel('listB+B:restitu', 'Ordenan la restitución de tierras').texto).toBe('Lista B (dos familias): restitución')
  })

  it('extrae los términos a resaltar sin el encuadre ni el modo aprendizaje', () => {
    expect(terminosDe(['learning_mode', 'frame:confrontacion', 'listA:condena', 'listB+corroborated:policia'], ['listB:tribunal'])).toEqual([
      'condena',
      'policia',
      'tribunal',
    ])
  })

  it('el puntaje se lee con su origen', () => {
    expect(puntajeLabel(3).variant).toBe('red')
    expect(puntajeLabel(0).texto).toBe('0')
    expect(puntajeLabel(1)).toEqual({ texto: '1 · B+B', variant: 'yellow' })
  })

  it('el 1 del encuadre solo se rotula distinto del 1 de B+B (13-oct-2026)', () => {
    expect(puntajeLabel(1, ['learning_mode', 'frame:confrontacion'])).toEqual({ texto: '1 · solo encuadre', variant: 'yellow' })
    expect(puntajeLabel(1, ['listB+B:tribunal', 'listB+B:predio']).texto).toBe('1 · B+B')
    expect(puntajeLabel(3, ['frame:confrontacion', 'listA:desaloj']).texto).toBe('3 · encuadre y lista')
  })

  it('la señal del carril de marca (D5) se rotula como tal y no se libera en masa', () => {
    expect(razonLabel('carril-juez:victimas')).toEqual({ texto: 'Carril (juez): víctimas', variant: 'orange' })
    expect(razonLabel('carril-juez:proceso_penal').texto).toBe('Carril (juez): proceso penal')
    expect(razonLabel('carril-filtro:estrangul', 'Mujer es hallada estrangulada en Renaico').texto).toBe('Carril (filtro): estrangulada')
    // la categoría del juez no es una palabra de la nota: no se resalta; el término del filtro sí
    expect(terminosDe(['carril-juez:violencia', 'carril-filtro:estrangul'], [])).toEqual(['estrangul'])
    expect(puntajeLabel(2, ['carril-juez:victimas']).texto).toBe('2 · carril')
    expect(puntajeLabel(2, ['listA:homicid', 'carril-juez:victimas']).texto).toBe('2 · lista A')
    expect(puntajeLabel(2).texto).toBe('2 · lista A')
  })

  it('muestra el término como aparece en la nota, no la raíz de la lista', () => {
    const texto = 'Gobierno de Neuquén niega personería a comunidades Mapuche\nLa Justicia ordenó el desalojo; hay tres detenidos tras la detención.'
    expect(terminoVisible('desaloj', texto)).toBe('desalojo')
    expect(terminoVisible('detenid', texto)).toBe('detenidos')
    // sin tilde en la lista, con tilde en la nota
    expect(terminoVisible('detencion', texto)).toBe('detención')
    // no está en el texto corto: queda la raíz
    expect(terminoVisible('homicid', texto)).toBe('homicid')
    // siglas en mayúsculas; términos de varias palabras, tal cual
    expect(terminoVisible('cam', 'La CAM reivindicó')).toBe('CAM')
    expect(terminoVisible('huelga de hambre', texto)).toBe('huelga de hambre')
    expect(razonLabel('listA:desaloj', texto).texto).toBe('Lista A: desalojo')
    expect(razonLabel('frame:confrontacion', texto).texto).toBe('Encuadre: confrontacion')
  })

  it('resalta con la regla del gate: prefijo de palabra, sigla completa, secuencia, sin diacríticos', () => {
    const f = marcarTerminos('Detención en Temuco: la CAM y la camioneta; huelga de hambre.', ['detencion', 'cam', 'huelga de hambre'])
    const marcados = f.filter((x) => x.marcado).map((x) => x.texto)
    expect(marcados).toEqual(['Detención', 'CAM', 'huelga de hambre'])
    // reconstruye el texto completo
    expect(f.map((x) => x.texto).join('')).toBe('Detención en Temuco: la CAM y la camioneta; huelga de hambre.')
  })

  it('el texto corto es título, etiqueta y resumen, como el gate', () => {
    expect(textoCorto({ title: null, titleLabel: 'Etiqueta', sourceTitle: 'Fuente', summary: ' ' })).toBe('Fuente\nEtiqueta')
  })
})
