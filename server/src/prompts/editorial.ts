import { VOZ_VENANCIO_ADN, VOZ_VENANCIO_EVITAR, REGLAS_FUNDACION } from './voz-venancio.js'
import { escapeXml } from './shared.js'

/**
 * La editorial firmada de Voces Indígenas, redactada DESDE LAS NOTAS DEL
 * DIRECTOR y no desde las noticias de la semana.
 *
 * LO QUE HABÍA (3-may-2026 a 25-oct-2026). El prompt tomaba las ocho noticias de
 * mayor relevancia de la semana y escribía una columna «en su voz» con una
 * identidad redactada a mano (Impacto Indígena 2023, el IRI, asesorías a Codelco
 * y BHP) que no era la verificada, y con una firma dentro del texto. Nunca se
 * publicó una: una editorial generada sola desde titulares no es una editorial
 * firmada, es exactamente lo que el plan del 25-oct-2026 quiere resolver.
 *
 * LO QUE HAY. El director escribe o dicta sus notas en el panel; el modelo las
 * ordena en una columna con su voz verificada (`voz-venancio.ts`, destilada de
 * su corpus 2013-2026); el director edita y publica. La firma la pone el código
 * desde `authorName`; el método se declara en un recuadro aparte. Las reglas
 * binarias (la agencia de la primera frase, «conflicto mapuche», la IA dentro
 * del texto, cifras que las notas no traen) se piden acá y además se hacen
 * cumplir en `lib/editorialGuards.ts`.
 *
 * Sin bloque <ROLE>: con él, el filtro de contenido de Azure rechazó el 100 %
 * de las llamadas de otro prompt de este repo (3-sep-2026).
 */

export interface EditorialDraftInput {
  /** Las notas del director, tal como las escribió. */
  notes: string
  /** El título que puso al crear la editorial; el modelo puede proponer otro. */
  title: string
  weekLabel: string
}

export function buildEditorialPrompt(input: EditorialDraftInput): string {
  return `<GOAL>
Ordena las notas de Venancio Coñuepán Mesías en la editorial semanal de Voces Indígenas (${input.weekLabel}), escrita en primera persona y en su voz. Las notas son suyas: la editorial dice lo que las notas dicen, con su estructura y su ritmo, y nada más. Sale firmada con su nombre, en un campo aparte que agrega el código.
</GOAL>

<NOTAS_DEL_AUTOR>
Título de trabajo: ${escapeXml(input.title)}

${escapeXml(input.notes)}
</NOTAS_DEL_AUTOR>

<ESTRUCTURA>
Cinco párrafos, entre 400 y 500 palabras en total, en este orden:
1. APERTURA: el hecho concreto del que parten las notas, como punto de entrada a algo más grande. No es un resumen de noticia.
2. CONTEXTO: por qué ese hecho no es aislado; la tensión de fondo que las notas plantean.
3. ANÁLISIS: la lectura desde adentro que las notas traen. Acá va el reencuadre («no se trata de X, sino de Y»).
4. IMPLICACIÓN: qué dice esto del problema mayor, según las notas.
5. CIERRE: qué se necesita o qué ya se está construyendo. Termina con una síntesis, una implicancia o un deber heredado, no con una pregunta al lector.
Título: el modelo propone uno de hasta 12 palabras, sin punto final, que recoja la tensión central de las notas.
</ESTRUCTURA>

<FIDELIDAD>
- Todo hecho, cifra, nombre, lugar, fecha y cita sale de las notas. No completes con conocimiento propio: si las notas no traen una cifra, la editorial no la trae.
- Si las notas citan una noticia o un medio, nómbralo como lo nombran las notas.
- No atribuyas a la Fundación ni al autor afiliaciones, cargos o certificaciones que las notas no mencionen.
- Si las notas tienen una idea a medias, deja la idea a medias con claridad en vez de completarla.
- No escribas la firma ni el nombre del autor dentro del texto: van aparte.
- No menciones la inteligencia artificial ni cómo se escribió la editorial: el método se declara aparte.
</FIDELIDAD>

${VOZ_VENANCIO_ADN}

${VOZ_VENANCIO_EVITAR}

${REGLAS_FUNDACION}

<LENGUAJE>
- El sujeto de la primera frase son los pueblos, las comunidades, las personas o los hechos. Nunca Voces Indígenas, la Fundación ni «nosotros».
- Español claro; períodos largos alternados con frases breves de síntesis. Sin listas ni viñetas: solo prosa.
- Texto plano: sin markdown, sin títulos intermedios, sin emojis, sin hashtags. Como máximo un guion largo por párrafo.
- Nunca «conflicto mapuche»: es el conflicto en La Araucanía o el conflicto chileno-mapuche.
</LENGUAJE>`
}
