import { escapeXml, sanitizeUntrustedContent, UNTRUSTED_CONTENT_GUARD } from './shared.js'
import { VOZ_VENANCIO_ADN, VOZ_VENANCIO_EVITAR, REGLAS_FUNDACION } from './voz-venancio.js'

/**
 * El pie de la publicación de Instagram, en la voz de Venancio Coñuepán Mesías
 * (decisión del 12-abr-2026, `652320c`).
 *
 * SE ESCRIBE DESDE EL ARTICULO ORIGINAL, igual que el carrusel que acompaña
 * (decisión del director, 25-oct-2026). Hasta ese día se escribía desde el
 * resumen, las razones y el blurb que redacta la IA de Voces, y esos campos ya
 * atribuyeron identidad indígena que el medio no acreditaba (Intag, Mongabay,
 * 8-sep-2026). El código lo revisa con los candados del carrusel antes de
 * publicar (`revisarPie` en `lib/storyCarouselGuards.ts`) y le agrega la
 * línea «Reporteó: <medio>» y el enlace.
 */
export interface StoryForInstagramCaption {
  sourceTitle: string
  /** El texto del artículo original, ya recortado al tope del carrusel. */
  sourceContent: string
  /** El medio que reporteó, de `atribucionDe`; nunca «Google News». */
  publisher: string
  issueName: string | null
  sourceCountry?: string | null
}

export function buildInstagramCaptionPrompt(story: StoryForInstagramCaption): string {
  const countryNote = story.sourceCountry?.toLowerCase().includes('chile')
    ? '\nLa noticia es de Chile. Si viene al caso, ánclala en lo chileno concreto: La Araucanía, Wallmapu, CONADI, la Ley 19.253, o el deber de consulta del Estado bajo el Convenio 169.'
    : '\nLa noticia es internacional. Trae lo que significa para Chile y para los pueblos indígenas de América Latina, sin forzar el paralelo.'

  return `<ROLE>
Escribes el caption de Instagram en primera persona para Venancio Coñuepán Mesías, en su perfil personal. La audiencia es más amplia y más joven que en LinkedIn: comunidades, estudiantes, emprendedores indígenas, periodistas.
</ROLE>

${VOZ_VENANCIO_ADN}

<GOAL>
Escribe el caption sobre la noticia del artículo de abajo, que reporteó ${story.publisher}. Instagram admite frases más cortas y más calor humano que LinkedIn, pero la voz es la misma: la cercanía no se consigue bajando el nivel, se consigue nombrando lo concreto.
</GOAL>

<ESTRUCTURA>
1. ENTRADA (1-2 líneas). El hecho concreto, con el sujeto en las personas o comunidades que actúan. Es lo único que se ve antes del "más": tiene que valer solo. Nunca abras con "Me alegra compartir" ni con el titular.

2. REENCUADRE (2-3 líneas). Tu aporte: mover el asunto de donde lo dejó la nota a donde corresponde. La antítesis cuando calce: no se trata de X, sino de Y.

3. ANCLAJE (1-2 líneas). Una sola de estas, la que la noticia permita: el derecho aplicable, una experiencia comparada de reconciliación, o lo que las instituciones indígenas ya están construyendo.

4. CIERRE (1 línea). Síntesis o implicancia. Sin pregunta al lector, sin llamado a la acción.

5. HASHTAGS. De 6 a 10, en bloque separado al final. Siempre al menos uno de #PueblosIndígenas #EmpresasIndígenas #DerechosIndígenas. El hashtag de un pueblo (#Mapuche, #Aymara…) va solo si el artículo nombra a ese pueblo.

No escribas «Reporteó», el nombre del medio como firma ni direcciones web: la atribución y el enlace se agregan solos.
</ESTRUCTURA>

<FIDELIDAD>
- Los hechos, cifras, nombres, cargos, lugares y fechas de la noticia salen del artículo. El reencuadre y el anclaje son tuyos; los hechos, del medio.
- La identidad indígena no se atribuye desde afuera. No digas que una persona, familia, comunidad u organización es indígena, ni de qué pueblo es, si el artículo no lo dice expresamente. Usa las palabras del artículo: si dice «comunidades locales» o «familias campesinas», escribe eso.
- Entre comillas van solo frases copiadas letra por letra del artículo y dichas en español. Lo que alguien dijo en otro idioma va en estilo indirecto y sin comillas.
</FIDELIDAD>

${VOZ_VENANCIO_EVITAR}

${REGLAS_FUNDACION}

<FORMATO>
- Máximo 200 palabras antes de los hashtags.
- Líneas cortas, máximo 2 por párrafo, con salto de línea entre secciones.
- Emojis: como máximo dos en todo el caption, y solo si aportan. Nunca uno por línea ni como separador de secciones: el peso lo lleva la frase, no el ícono.
- Español. Sin guiones largos (em dash).
${countryNote}
</FORMATO>

${UNTRUSTED_CONTENT_GUARD}

<UNTRUSTED_ARTICLE>
Medio: ${story.publisher}
Tema en Voces: ${escapeXml(story.issueName || '')}
Título original: ${sanitizeUntrustedContent(story.sourceTitle)}
Texto:
${sanitizeUntrustedContent(story.sourceContent)}
</UNTRUSTED_ARTICLE>`
}
