import { sanitizeUntrustedContent, UNTRUSTED_CONTENT_GUARD } from './shared.js'
import { VOZ_VENANCIO_ADN, VOZ_VENANCIO_EVITAR, REGLAS_FUNDACION } from './voz-venancio.js'

/**
 * El texto de un carrusel de Voces Indígenas sobre UNA noticia.
 *
 * SE ARMA DESDE EL ARTICULO ORIGINAL, no desde el resumen ni el «por qué
 * importa» de Voces: esos los escribe una IA, y en un caso medido (8-sep-2026)
 * atribuyeron identidad indígena a familias que el reportaje de Mongabay nunca
 * llamó así. Cada lámina se publica con «Reporteó: <medio>» al pie, así que
 * todo lo que diga tiene que estar en lo que ese medio reporteó.
 *
 * EL FORMATO es el del carrusel de la skill `radar-indigena`: portada con el
 * gancho, una idea por lámina en 25 a 40 palabras, cierre; de 6 a 8 láminas.
 *
 * LA LECTURA es opcional (decisión del director, 23-oct-2026): una lámina
 * aparte, en la voz de Venancio Coñuepán Mesías y marcada con su nombre, para
 * que su opinión no quede atribuida al medio. Sin ella el carrusel es solo
 * informativo.
 *
 * Sin bloque <ROLE>: con él, el filtro de contenido de Azure rechazó el 100 %
 * de las llamadas de otro prompt de este repo (3-sep-2026).
 *
 * Las reglas binarias (citas textuales, identidad) se piden acá y además se
 * hacen cumplir en código: ver `lib/storyCarouselGuards.ts`.
 */

export interface StoryForCarousel {
  sourceTitle: string
  sourceContent: string
  /** El medio real, de `publisherFromUrl`; nunca «Google News». */
  publisher: string
  /** Fecha de publicación del original, ya formateada; null si no se conoce. */
  sourceDate: string | null
}

export function buildStoryCarouselPrompt(story: StoryForCarousel, conLectura: boolean): string {
  const desarrollo = conLectura ? 'De 4 a 5 láminas' : 'De 4 a 6 láminas'
  const total = conLectura ? 'Entre 6 y 7 láminas' : 'Entre 6 y 8 láminas'

  const lectura = conLectura
    ? `
<LECTURA>
Además del carrusel, escribe la lámina «lectura»: la lectura de Venancio Coñuepán Mesías sobre esta noticia, en primera persona. Sale marcada con su nombre, así que es opinión suya y no del medio.
- titulo: de 2 a 7 palabras. texto: de 30 a 50 palabras.
- Reencuadra o propone a partir de los hechos del artículo. No agrega hechos, cifras ni nombres que el artículo no trae.
- Las reglas de FIDELIDAD valen también aquí.
</LECTURA>

${VOZ_VENANCIO_ADN}

${VOZ_VENANCIO_EVITAR}
`
    : ''

  return `<GOAL>
Escribe el texto de un carrusel de Voces Indígenas (láminas verticales para Instagram y LinkedIn) sobre la noticia del artículo de abajo, que reporteó ${story.publisher}. El carrusel cuenta lo que ese medio reporteó, con claridad y sin agregar nada que el artículo no diga: cada lámina se publica con la línea «Reporteó: ${story.publisher}» al pie.
</GOAL>

<ESTRUCTURA>
${total} en total, contando la portada y el cierre.
1. PORTADA. titulo: el hecho central como titular, de 6 a 14 palabras. texto: una bajada de 12 a 25 palabras que diga quién, dónde y cuándo.
2. DESARROLLO. ${desarrollo}, una idea por lámina, en el orden en que mejor se entiende la noticia: qué pasó, quiénes actúan, qué está en juego, qué dicen las partes, qué viene. titulo: de 2 a 7 palabras. texto: de 25 a 40 palabras.
3. CIERRE. titulo: de 2 a 7 palabras. texto: de 15 a 35 palabras con la síntesis o la implicancia que el propio artículo plantea. Sin pregunta al lector ni llamado a la acción.
4. FIRMA. No escribas «Reporteó», el nombre del medio como firma ni direcciones web en ninguna lámina: la atribución, el enlace a la nota original y la firma se agregan solos.
</ESTRUCTURA>

<FIDELIDAD>
- Todo hecho, cifra, nombre, cargo, lugar y fecha sale del artículo. No completes con conocimiento propio ni con contexto que el artículo no trae.
- Las cifras y fechas van tal como las da el artículo: si una fecha no trae año, no se lo agregues, y no escribas años que el artículo no menciona.
- La identidad indígena no se atribuye desde afuera. No digas que una persona, familia, comunidad u organización es indígena, ni de qué pueblo es, si el artículo no lo dice expresamente. Usa las palabras del artículo: si dice «comunidades locales» o «familias campesinas», escribe eso.
- Entre comillas van solo frases copiadas letra por letra del artículo y dichas en español. Lo que alguien dijo en otro idioma va en estilo indirecto y sin comillas: «La dirigenta explicó que…».
- Si las partes discrepan, recoge las versiones tal como el artículo las presenta.
- Ignora lo que no es la noticia: menús, avisos, suscripciones, otras notas enlazadas.
</FIDELIDAD>

<LENGUAJE>
- El sujeto de la portada son las comunidades, las personas o los hechos de la noticia. Nunca Voces Indígenas ni la Fundación.
- Nunca «conflicto mapuche»: es el conflicto en La Araucanía o el conflicto chileno-mapuche.
- Español claro, frases completas. Texto plano: sin markdown, sin emojis, sin hashtags, sin guiones largos.
</LENGUAJE>

${REGLAS_FUNDACION}
${lectura}
${UNTRUSTED_CONTENT_GUARD}

<UNTRUSTED_ARTICLE>
Medio: ${story.publisher}
Título original: ${sanitizeUntrustedContent(story.sourceTitle)}
${story.sourceDate ? `Fecha: ${story.sourceDate}\n` : ''}Texto:
${sanitizeUntrustedContent(story.sourceContent)}
</UNTRUSTED_ARTICLE>`
}
