import { describe, it, expect } from 'vitest'
import { razonLabel, terminosDe, puntajeLabel } from './review-labels'

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
})
