import { LISTA_A } from './gate.js'
import { normalizar } from './brandRegion.js'

/**
 * Filtro de sensibles del carril de marca (D5, diseño sección 7.4).
 *
 * Por qué existe aparte del gate: en una nota que murió en el pre-filtro, la
 * etiqueta y el resumen son nulos y el gate de D4 juzga casi solo el título.
 * Este filtro mira el título y el título de la fuente con la Lista A completa
 * del protocolo más la violencia contra personas y la violencia rural, de
 * cualquier lado: protege con la misma vara a la víctima rural y al comunero
 * (principio de simetría del protocolo). El cuerpo de la nota lo cubre la
 * bandera sensible del juez del carril, que lo lee con contexto.
 *
 * Medido el 13-oct-2026 sobre 360 candidatas reales: el título marca 47 (≈3 por
 * día), con el femicidio de Renaico («Mujer es hallada estrangulada…») incluido;
 * aplicado al cuerpo, sumaba 48 casi todas falsas («menor costo»).
 *
 * La señal no decide sola: se guarda en story_brand_assessments y
 * evaluateForCommunity la combina con el gate, para que ninguna reevaluación
 * del conciliador la pierda.
 */
export const TERMINOS_SENSIBLES_EXTRA = [
  // violencia contra personas
  'femicid', 'feminicid', 'estrangul', 'apunal', 'agred', 'agresion', 'secuestr', 'asalto', 'disparo', 'balacera',
  'abuso sexual', 'violencia intrafamiliar', 'cadaver', 'sin vida', 'fallecid',
  // violencia rural, de cualquier lado
  'incendio intencional', 'ataque incendiario', 'quema de', 'quemaron',
] as const

export const TERMINOS_SENSIBLES: readonly string[] = [...new Set([...LISTA_A, ...TERMINOS_SENSIBLES_EXTRA])]

/** Largo máximo de una sigla, que se coteja como palabra completa (igual que el gate). */
const LARGO_SIGLA = 3

function calza(haystack: string, termino: string): boolean {
  const e = termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sigla = termino.length <= LARGO_SIGLA && !termino.includes(' ')
  return new RegExp(`(^|[^a-z0-9])${e}${sigla ? '($|[^a-z0-9])' : ''}`).test(haystack)
}

/** Términos sensibles presentes en el título o el título de la fuente. */
export function sensiblesDelTitulo(title: string | null, sourceTitle: string): string[] {
  const t = normalizar(`${sourceTitle} ${title ?? ''}`)
  return TERMINOS_SENSIBLES.filter((termino) => calza(t, termino))
}
