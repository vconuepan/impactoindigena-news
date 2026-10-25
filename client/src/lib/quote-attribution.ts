/**
 * La «cita clave» de una noticia no siempre es una cita.
 *
 * El prompt de análisis (`server/src/prompts/assess.ts`) pide la cita exacta
 * más importante y, si el artículo no tiene ninguna, «una oración llamativa»
 * con la atribución «Artículo original». Medido el 25-oct-2026 sobre las 500
 * últimas publicadas: 225 llevaban esa marca, y la página las mostraba igual
 * que una cita, con comilla gigante y raya de atribución. Una frase del
 * redactor presentada como cita es una cita falsa.
 *
 * El marcador existe en dos idiomas porque un script de relleno de 2026 lo
 * escribió en inglés y el prompt actual lo escribe en español.
 */
export const MARCADORES_SIN_PERSONA = ['Artículo original', 'Original article'] as const

/** ¿La «cita» es una frase del artículo y no palabras de alguien? */
export function esFraseDelArticulo(attribution: string | null | undefined): boolean {
  if (!attribution) return true
  return (MARCADORES_SIN_PERSONA as readonly string[]).includes(attribution.trim())
}
