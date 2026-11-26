import { describe, it, expect } from 'vitest'
import { preRatingWithLocalBonus, relevanceWithLocalBonus, localBonusCalculationLine } from './local-media-bonus.js'

describe('bono de medio local', () => {
  it('no toca a las fuentes que no son locales', () => {
    expect(relevanceWithLocalBonus(6, false)).toEqual({ rating: 6, applied: false })
    expect(preRatingWithLocalBonus(6, false)).toEqual({ rating: 6, applied: false })
  })

  it('evaluación completa: suma 1 desde 5 (el caso de Canal Paipote sin el castigo)', () => {
    expect(relevanceWithLocalBonus(5, true)).toEqual({ rating: 6, applied: true })
    expect(relevanceWithLocalBonus(7, true)).toEqual({ rating: 8, applied: true })
  })

  it('evaluación completa: bajo 5 no suma, para no cruzar la REGLA_FUNDAMENTAL', () => {
    expect(relevanceWithLocalBonus(4, true)).toEqual({ rating: 4, applied: false })
    expect(relevanceWithLocalBonus(1, true)).toEqual({ rating: 1, applied: false })
  })

  it('pre-evaluación: suma 1 desde 4, así una nota en el borde entra a la evaluación completa', () => {
    expect(preRatingWithLocalBonus(4, true)).toEqual({ rating: 5, applied: true })
    expect(preRatingWithLocalBonus(3, true)).toEqual({ rating: 3, applied: false })
  })

  it('nunca pasa de 10', () => {
    expect(relevanceWithLocalBonus(10, true)).toEqual({ rating: 10, applied: false })
    expect(preRatingWithLocalBonus(10, true)).toEqual({ rating: 10, applied: false })
  })

  it('la línea del cálculo dice el bono', () => {
    expect(localBonusCalculationLine()).toMatch(/^\*\*Medio local:\*\* \+1 /)
  })
})
