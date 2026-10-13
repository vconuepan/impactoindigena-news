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
 * Bloque de artículos con formateador PROPIO. El común (formatArticlesBlock) no
 * enviaba el décimo artículo de cada lote hasta el arreglo del 13-oct-2026
 * (463c32e); el carril mantiene el suyo para no depender de su presupuesto de
 * caracteres. Aquí van todos los recibidos, y el servicio verifica que vuelvan
 * tantas respuestas como artículos se enviaron.
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
- Las etiquetas describen la nota, nunca a una persona. No se infiere la pertenencia de nadie a un pueblo por su apellido, sus rasgos o su lugar. La pertenencia se acredita desde adentro: cuenta una comunidad, una asociación u organización indígena que actúa como tal, o una persona que, según la nota, se presenta así o a quien su organización presenta así. No basta con que el periodista, una autoridad u otro tercero la llame así, ni la palabra «comunero», ni que la nota nombre su comunidad. Si no está acreditada, la persona no cuenta como indígena.
- El motivo no nombra a personas.
- Las banderas sensibles siguen el sesgo al falso positivo: ante la duda, se marca.
- Cada artículo recibido tiene exactamente una respuesta, con su Article ID.
</REGLAS>`

/**
 * Candado del dato sensible (diseño D5, sección 3), en código y no en las
 * pautas: ninguna pauta puede quitarlo. La calidad indígena no se identifica
 * desde afuera, se acredita desde adentro.
 */
export const REGLA_EJE_MAPUCHE_CHILENO = `<REGLA_DEL_EJE_MAPUCHE_CHILENO>
El eje mapuche_chileno se asigna solo cuando la relación está acreditada desde adentro: una comunidad, una asociación u organización mapuche, o una persona que, según la nota, se presenta como mapuche o a quien su organización presenta así. Nunca por el apellido de alguien, por sus rasgos, por el lugar donde vive o donde ocurrió el hecho, por la palabra «comunero» ni porque el periodista u otro tercero la llame mapuche. Si no está acreditada, se usa otro eje.
</REGLA_DEL_EJE_MAPUCHE_CHILENO>`

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

${REGLA_EJE_MAPUCHE_CHILENO}

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

/**
 * Redacción de vitrina (diseño D5, sección 4): solo para lo que el carril eligió
 * y solo en modo aplicar. Las reglas salen del protocolo editorial (documento
 * público: secciones 1.3, 3 y 8) y de las reglas de lenguaje de la Fundación. El
 * resultado pasa después por una verificación determinista (lib/brandLanguage.ts):
 * si una regla calza, la nota no se publica.
 */
export function buildRedaccionPrompt(marca: 'araucania' | 'mapuche', articulo: ArticuloJuez): string {
  const medio = marca === 'araucania' ? 'Voces Araucanía, que cubre La Araucanía con todos los actores que conviven en ella' : 'Voces Mapuche, que cubre al pueblo mapuche en el Wallmapu entero'
  return `<ROLE>
Editor de ${medio}.
</ROLE>

<GOAL>
Escribir un título y un resumen en español para este artículo, solo con lo que el artículo dice.
</GOAL>

<REGLAS>
- Título informativo, de 90 caracteres como máximo. Resumen de dos o tres oraciones, de 400 caracteres como máximo.
- Nombrar el hecho, no calificarlo. Todo término de parte va atribuido a quien lo dice y nunca en voz propia: «terrorista», «usurpación», «presos políticos», «recuperación territorial», «violencia rural», «enfrentamiento».
- Presunción de inocencia: el estado procesal exacto (detenido, formalizado, imputado, condenado). Nadie es «el responsable» sin condena firme.
- Nunca el nombre de un niño, niña o adolescente ni el de una víctima: se nombra su rol.
- El sujeto de la primera oración nunca es el medio, la plataforma ni una fundación: es quien actúa en la noticia.
- El Convenio 169 de la OIT obliga al Estado: ninguna empresa «cumple el Convenio 169».
- Sin vocabulario de diversidad empresarial («diversidad de proveedores», «gasto diverso», «minorías»).
- Las organizaciones indígenas no se presentan como competidoras entre sí.
- No se atribuyen afiliaciones, membresías ni respaldos institucionales que el artículo no diga.
- No se infiere la pertenencia de nadie a un pueblo: solo se dice si el artículo la declara.
- No se agregan datos que el artículo no trae.
</REGLAS>

${bloqueArticulos([articulo])}`
}
