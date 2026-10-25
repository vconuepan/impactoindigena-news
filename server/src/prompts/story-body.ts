import { sanitizeUntrustedContent, UNTRUSTED_CONTENT_GUARD } from './shared.js'
import { REGLAS_FUNDACION } from './voz-venancio.js'

/**
 * La nota con claves de una noticia: el cuerpo que la ficha pública muestra
 * en lugar del resumen de 45 palabras.
 *
 * BORRADOR DE MEDICIÓN (plan `.plans/2026-10-25_contenido-propio-y-ficha-con-claves.md`,
 * ítem A1). Se corre con `scripts/medir-nota-claves.ts` sobre noticias reales
 * antes de entrar al pipeline. Lo que la medición diga cambia este archivo.
 *
 * POR QUÉ EXISTE. La ficha de hoy es una tarjeta: el prompt de análisis pide
 * un resumen de 40 a 70 palabras y le da al modelo los primeros 4.000
 * caracteres del artículo (`config.assess.contentMaxLength`). Lo que sigue en
 * la página son viñetas de puntaje. Medido el 25-oct-2026: media de 45 palabras
 * por nota. Esta pieza cuenta la noticia en cuatro claves, al estilo de una nota
 * de Ex-Ante, desde el artículo completo.
 *
 * SE ARMA DESDE EL ARTÍCULO ORIGINAL, como el carrusel (`story-carousel.ts`), y
 * por las mismas razones: lo que escribió la IA de Voces no es fuente. Los
 * candados de cita, cifra, identidad y pueblo se piden acá y se hacen cumplir
 * en código (`lib/storyBodyGuards.ts`), más dos propios de un texto largo:
 * copia (ningún tramo de doce palabras fuera de la cita está en el original,
 * art. 71 B de la Ley 17.336) y agencia (la bajada no abre con el medio).
 *
 * Sin bloque <ROLE>: con él, el filtro de contenido de Azure rechazó el 100 %
 * de las llamadas de otro prompt de este repo (3-sep-2026).
 */

export interface StoryForBody {
  sourceTitle: string
  sourceContent: string
  /** El medio real, de `publisherFromUrl`; nunca «Google News». */
  publisher: string
  /**
   * Fecha de la noticia, ya formateada. En el pipeline siempre hay una: la del
   * feed o, si no, la del rastreo (una noticia entra a assess con menos de 14
   * días). Medido el 25-oct-2026: sin fecha, el modelo puso «la elección de
   * 2023» a una nota de The Guardian sobre la elección de este año.
   */
  sourceDate: string | null
}

export function buildStoryBodyPrompt(story: StoryForBody): string {
  return `<GOAL>
Escribe la nota de Voces Indígenas sobre la noticia del artículo de abajo, que reporteó ${story.publisher}. La nota cuenta en cuatro claves lo que ese medio reporteó, en palabras propias y con claridad, para una persona que no leyó el artículo y quiere entender qué pasó y por qué les importa a los pueblos indígenas. La nota se publica con el enlace, el título y el autor del artículo original al pie.
</GOAL>

<ESTRUCTURA>
Cinco campos, en español, en texto plano (sin markdown, sin títulos, sin viñetas, sin emojis, sin guiones largos):
1. bajada: qué pasó, quién, dónde y cuándo, en una o dos frases de 25 a 40 palabras. El sujeto de la primera frase son las comunidades, las personas, las instituciones o los hechos de la noticia.
2. quePaso: los hechos del artículo en el orden en que mejor se entienden, de 80 a 120 palabras. Puede llevar UNA cita entre comillas, copiada letra por letra del artículo y dicha en español, con quién la dijo; si el artículo no trae una cita en español que valga la pena, no lleva ninguna.
3. porQueImporta: el mecanismo concreto por el que esto toca a pueblos indígenas, de 60 a 100 palabras: qué derecho, territorio, recurso, decisión o relación cambia, según lo que el artículo cuenta. No es una opinión ni una valoración: es la consecuencia que el artículo describe o que sus fuentes plantean.
4. contexto: lo que el lector necesita saber para entender la noticia y que el artículo mismo aporta, de 60 a 100 palabras: antecedentes, leyes, acuerdos, cifras previas, actores. Solo lo que el artículo trae.
5. queSigue: plazos, instancias, decisiones o pasos pendientes que el artículo nombra, de 30 a 60 palabras. Si el artículo no dice nada de lo que viene, este campo es la cadena vacía "": no escribas que el artículo no lo menciona.
</ESTRUCTURA>

<FIDELIDAD>
- Todo hecho, cifra, nombre, cargo, lugar y fecha sale del artículo. No completes con conocimiento propio ni con contexto que el artículo no trae: un campo corto y fiel vale más que uno largo y completado.
- Las cifras y fechas van tal como las da el artículo: si una fecha no trae año, no se lo agregues, y no escribas años que el artículo no menciona. Si el artículo dice «hace cuatro años» o «hace dos décadas», escríbelo así: no lo conviertas en un año.
- Un mecanismo se describe como lo describe el artículo: qué estructura, qué decisión o qué actor produce el efecto. Si el artículo distingue dos partes de una obra o dos etapas de un proceso, no las fundas en una.
- La identidad indígena no se atribuye desde afuera. No digas que una persona, familia, comunidad u organización es indígena, ni de qué pueblo es, si el artículo no lo dice expresamente. Usa las palabras del artículo: si dice «comunidades locales» o «familias campesinas», escribe eso.
- Entre comillas va solo la cita, copiada letra por letra del artículo. Todo lo demás se escribe con palabras propias: no reproduzcas frases ni párrafos del artículo fuera de la cita, ni los cambies apenas. Lo que alguien dijo en otro idioma va en estilo indirecto y sin comillas.
- Si las partes discrepan, recoge las versiones tal como el artículo las presenta, sin dar la razón a ninguna.
- Una valoración («viola», «pone en riesgo», «es grave», «perjudica») lleva siempre quién la hace: «según Orlando Carriqueo», «el CELS advierte que». Lo que el artículo presenta como hecho va como hecho; lo que presenta como dicho de alguien va atribuido.
- La fecha de la noticia es la que se indica abajo. «Este año», «el domingo» o «la semana pasada» se refieren a esa fecha: no asignes a un hecho un año que el artículo no le da.
- Ignora lo que no es la noticia: menús, avisos, suscripciones, otras notas enlazadas, comentarios de lectores.
</FIDELIDAD>

<LENGUAJE>
- Español claro, frases completas, para una persona de 16 años inteligente. Sin jerga ni siglas sin explicar la primera vez.
- Nunca Voces Indígenas, la Fundación ni «nosotros» como sujeto. La nota no habla de sí misma ni del medio que la publica.
- La nota tampoco habla del artículo: no escribas «el artículo muestra», «según la nota», «el texto señala». Cuenta los hechos y atribuye lo que dicen las personas y las instituciones que el artículo cita.
- Nunca «conflicto mapuche»: es el conflicto en La Araucanía o el conflicto chileno-mapuche.
- Nombra al pueblo cuando el artículo lo nombra, con la grafía del artículo.
</LENGUAJE>

${REGLAS_FUNDACION}

${UNTRUSTED_CONTENT_GUARD}

<UNTRUSTED_ARTICLE>
Medio: ${story.publisher}
Título original: ${sanitizeUntrustedContent(story.sourceTitle)}
${story.sourceDate ? `Fecha: ${story.sourceDate}\n` : ''}Texto:
${sanitizeUntrustedContent(story.sourceContent)}
</UNTRUSTED_ARTICLE>`
}
