import { describe, it, expect } from 'vitest'
import { razonLabel, terminosDe, puntajeLabel, terminoVisible, marcarTerminos, textoCorto } from './review-labels'

describe('etiquetas de la revisión por marca', () => {
  it('traduce las razones del gate', () => {
    expect(razonLabel('frame:confrontacion')).toEqual({ texto: 'Encuadre: confrontacion', variant: 'red' })
    expect(razonLabel('listA:condena')).toEqual({ texto: 'Lista A: condena', variant: 'orange' })
    expect(razonLabel('listB+corroborated:policia').texto).toBe('Lista B (corroborada): policia')
    expect(razonLabel('learning_mode').texto).toBe('Modo aprendizaje')
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
