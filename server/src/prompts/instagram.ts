import { escapeXml } from './shared.js'
import { VOZ_VENANCIO_ADN, VOZ_VENANCIO_EVITAR, REGLAS_FUNDACION } from './voz-venancio.js'

export interface StoryForInstagramCaption {
  title: string
  titleLabel: string | null
  summary: string | null
  relevanceSummary: string | null
  relevanceReasons: string | null
  marketingBlurb: string | null
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
Escribe el caption sobre la noticia de abajo. Instagram admite frases más cortas y más calor humano que LinkedIn, pero la voz es la misma: la cercanía no se consigue bajando el nivel, se consigue nombrando lo concreto.
</GOAL>

<ESTRUCTURA>
1. ENTRADA (1-2 líneas). El hecho concreto, con el sujeto en las personas o comunidades que actúan. Es lo único que se ve antes del "más": tiene que valer solo. Nunca abras con "Me alegra compartir" ni con el titular.

2. REENCUADRE (2-3 líneas). Tu aporte: mover el asunto de donde lo dejó la nota a donde corresponde. La antítesis cuando calce: no se trata de X, sino de Y.

3. ANCLAJE (1-2 líneas). Una sola de estas, la que la noticia permita: el derecho aplicable, una experiencia comparada de reconciliación, o lo que las instituciones indígenas ya están construyendo.

4. CIERRE (1 línea). Síntesis o implicancia. Sin pregunta al lector, sin llamado a la acción.

5. HASHTAGS. De 6 a 10, en bloque separado al final. Siempre al menos uno de #PueblosIndígenas #EmpresasIndígenas #DerechosIndígenas #Mapuche.
</ESTRUCTURA>

${VOZ_VENANCIO_EVITAR}

${REGLAS_FUNDACION}

<FORMATO>
- Máximo 200 palabras antes de los hashtags.
- Líneas cortas, máximo 2 por párrafo, con salto de línea entre secciones.
- Emojis: como máximo dos en todo el caption, y solo si aportan. Nunca uno por línea ni como separador de secciones: el peso lo lleva la frase, no el ícono.
- Español. Sin guiones largos (em dash).
${countryNote}
</FORMATO>

<NOTICIA>
Tema: ${escapeXml(story.titleLabel || '')}
Titular: ${escapeXml(story.title)}
${story.summary ? `Resumen: ${escapeXml(story.summary)}` : ''}
${story.relevanceSummary ? `Por qué importa: ${escapeXml(story.relevanceSummary)}` : ''}
${story.relevanceReasons ? `Factores clave: ${escapeXml(story.relevanceReasons)}` : ''}
${story.marketingBlurb ? `Blurb: ${escapeXml(story.marketingBlurb)}` : ''}
</NOTICIA>`
}
