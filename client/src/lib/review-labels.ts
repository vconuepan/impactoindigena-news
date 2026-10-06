import type { ReviewCode, ReviewMode, ReviewState } from './admin-api'
import type { BadgeVariant } from './constants'

/** Etiquetas en castellano de la revisión por marca. Una sola fuente para la pantalla y el panel. */

export const MODE_LABEL: Record<ReviewMode, string> = { off: 'Apagado', shadow: 'Sombra', enforce: 'Aplicar' }

export const STATE_LABEL: Record<ReviewState, string> = {
  auto: 'Automática',
  pending: 'Pendiente',
  released: 'Liberada',
  held: 'Retenida',
}

export const STATE_BADGE: Record<ReviewState, BadgeVariant> = { auto: 'green', pending: 'yellow', released: 'blue', held: 'red' }

export const CODE_LABEL: Record<ReviewCode, string> = { sensitive: 'Sensible', out_of_scope: 'Fuera de ámbito' }

/** Nombre de marca por slug de vertical; lo demás, el slug. */
export const MARCA_LABEL: Record<string, string> = {
  mapuche: 'Voces Mapuche',
  'wallmapu-araucania': 'Voces Araucanía',
}

export function marcaLabel(slug: string): string {
  return MARCA_LABEL[slug] ?? slug
}

/**
 * Una razón del gate, legible: 'frame:confrontacion' → «Encuadre: confrontación»,
 * 'listA:condena' → «Lista A: condena», 'listB+corroborated:policia' → «Lista B (corroborada): policia».
 */
export function razonLabel(razon: string): { texto: string; variant: BadgeVariant } {
  if (razon === 'learning_mode') return { texto: 'Modo aprendizaje', variant: 'gray' }
  const [tipo, ...resto] = razon.split(':')
  const termino = resto.join(':')
  switch (tipo) {
    case 'frame':
      return { texto: `Encuadre: ${termino}`, variant: 'red' }
    case 'listA':
      return { texto: `Lista A: ${termino}`, variant: 'orange' }
    case 'listB+corroborated':
      return { texto: `Lista B (corroborada): ${termino}`, variant: 'yellow' }
    case 'listB':
      return { texto: `Lista B: ${termino}`, variant: 'gray' }
    default:
      return { texto: razon, variant: 'gray' }
  }
}

/** Los términos que dispararon (sin el encuadre ni el modo aprendizaje), para resaltar. */
export function terminosDe(razones: string[], señales: string[]): string[] {
  const terminos = new Set<string>()
  for (const r of [...razones, ...señales]) {
    const i = r.indexOf(':')
    if (i < 0 || r.startsWith('frame:')) continue
    const t = r.slice(i + 1).trim()
    if (t) terminos.add(t)
  }
  return [...terminos]
}

export function puntajeLabel(score: number): { texto: string; variant: BadgeVariant } {
  if (score >= 3) return { texto: '3 · encuadre', variant: 'red' }
  if (score === 2) return { texto: '2 · lista A', variant: 'orange' }
  if (score === 1) return { texto: '1 · lista B', variant: 'yellow' }
  return { texto: '0', variant: 'gray' }
}
