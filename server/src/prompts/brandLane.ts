import { UNTRUSTED_CONTENT_GUARD, sanitizeUntrustedContent } from './shared.js'

/**
 * Prompts del juez del carril de marca (D5). Solo el ESQUELETO vive aquí: la
 * regla de entrada, la escala y las tensiones de cada marca son pautas
 * editoriales que se guardan en community_brand_criteria.guidelines y las
 * carga el director desde el repo privado. Este repo es público.
 *
 * Sin pautas cargadas el carril no llama al modelo (ver services/brandLane.ts).
 */

export interface ArticuloJuez {
  id: string
  title: string
  content: string
}

/** Tope de caracteres del cuerpo por artículo, igual que el pre-filtro. */
export const LARGO_CUERPO = 1200

/**
 * Bloque de artículos con formateador PROPIO: el común (formatArticlesBlock)
 * descuenta antes de comparar y nunca envía el décimo artículo de un lote. Aquí
 * van todos los recibidos; el servicio verifica que vuelvan tantas respuestas
 * como artículos se enviaron.
 */
export function bloqueArticulos(articulos: ArticuloJuez[]): string {
  let block = `<ARTICLES>\n${UNTRUSTED_CONTENT_GUARD}`
  for (const a of articulos) {
    block += `\n\n-----\nArticle ID: ${a.id}`
    block += `\nTitle: ${sanitizeUntrustedContent(a.title)}`
    block += `\n${sanitizeUntrustedContent(a.content.substring(0, LARGO_CUERPO))} ...`
  }
  return `${block}\n</ARTICLES>`
}

const REGLAS_COMUNES = `<REGLAS>
- Las etiquetas describen la nota, nunca a una persona. No se infiere la pertenencia de nadie a un pueblo por su apellido, sus rasgos o su lugar: solo cuenta lo que la nota declara (una comunidad, una asociación, un vocero que se identifica).
- El motivo no nombra a personas.
- Las banderas sensibles siguen el sesgo al falso positivo: ante la duda, se marca.
- Cada artículo recibido tiene exactamente una respuesta, con su Article ID.
</REGLAS>`

export function buildTerritorialPrompt(pautas: string, articulos: ArticuloJuez[]): string {
  return `<ROLE>
Editor regional de Voces Araucanía, un medio que cubre La Araucanía completa, con todos los actores que conviven en ella.
</ROLE>

<GOAL>
Para cada artículo, decidir si es una noticia, si trata sobre La Araucanía según la regla de entrada de las pautas, su nota territorial, su eje y sus banderas sensibles. La relevancia para los pueblos indígenas NO es el criterio de esta marca.
</GOAL>

<PAUTAS_DE_LA_MARCA>
${pautas}
</PAUTAS_DE_LA_MARCA>

${REGLAS_COMUNES}

${bloqueArticulos(articulos)}`
}

export function buildMapuchePrompt(pautas: string, articulos: ArticuloJuez[]): string {
  return `<ROLE>
Editor de Voces Mapuche, un medio que cubre al pueblo mapuche en el Wallmapu entero, Chile y Argentina.
</ROLE>

<GOAL>
Para cada artículo, asignar la nota en la escala de la marca, el eje temático, el lugar y las banderas sensibles, según las pautas.
</GOAL>

<PAUTAS_DE_LA_MARCA>
${pautas}
</PAUTAS_DE_LA_MARCA>

${REGLAS_COMUNES}

${bloqueArticulos(articulos)}`
}
