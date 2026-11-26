/**
 * Bono para los medios locales (decisión del director, 26-nov-2026, literal:
 * «los medios locales no deben estar castigados, incluso deberían tener un bono,
 * porque los locales son los que mejor conocen a los indígenas»).
 *
 * Determinista y en el punto de escritura, no en el prompt: una instrucción al
 * modelo es blanda (se midió con los títulos en agosto). El prompt de assess
 * solo deja de restar por el origen local; el bono lo suma el código.
 *
 * Qué es local lo decide una persona en /admin/feeds (`Feed.isLocal`), no el
 * modelo: el 26-nov el modelo restó «fuente local» a Canal Paipote por su cuenta.
 *
 * Los dos pisos (`preMinRating`, `fullMinRating`) cuidan la REGLA_FUNDAMENTAL:
 * el bono premia a una nota indígena de un medio local, nunca convierte en
 * indígena una nota que no lo es.
 */
import { config } from '../config.js'

export interface LocalBonus {
  rating: number
  applied: boolean
}

function withBonus(rating: number, isLocal: boolean, minRating: number): LocalBonus {
  const bonus = config.localMedia.bonus
  if (!isLocal || bonus <= 0 || rating < minRating) return { rating, applied: false }
  return { rating: Math.min(10, rating + bonus), applied: rating < 10 }
}

/** Pre-evaluación: decide si la nota entra a la evaluación completa. */
export function preRatingWithLocalBonus(rating: number, isLocal: boolean): LocalBonus {
  return withBonus(rating, isLocal, config.localMedia.preMinRating)
}

/** Evaluación completa: el puntaje con que se selecciona y se publica. */
export function relevanceWithLocalBonus(rating: number, isLocal: boolean): LocalBonus {
  return withBonus(rating, isLocal, config.localMedia.fullMinRating)
}

/** La línea que se agrega al cálculo de relevancia, para que el panel la muestre. */
export function localBonusCalculationLine(): string {
  return `**Medio local:** +${config.localMedia.bonus} (bono para los medios locales, que son los que mejor conocen a los pueblos de su territorio).`
}
