import { escapeXml } from './shared.js'
import { VOZ_VENANCIO_ADN, VOZ_VENANCIO_EVITAR, REGLAS_FUNDACION } from './voz-venancio.js'

export interface StoryForLinkedInPost {
  title: string
  titleLabel: string | null
  summary: string | null
  relevanceSummary: string | null
  relevanceReasons: string | null
  marketingBlurb: string | null
  issueName: string | null
  sourceCountry?: string | null
}

export function buildLinkedInPostPrompt(story: StoryForLinkedInPost): string {
  // El Convenio 169 se nombra como lo que es —obligación del Estado— y no como
  // una vara para la empresa. Antes esta nota decia "conéctala con CONADI, el
  // Convenio 169", sin ese cuidado, en la superficie mas leida por ejecutivos.
  const countryNote = story.sourceCountry?.toLowerCase().includes('chile')
    ? '\nLa noticia es de Chile. Si viene al caso, ánclala en lo chileno concreto: La Araucanía, Wallmapu, CONADI y su diseño institucional, la Ley 19.253, o el deber de consulta del Estado bajo el Convenio 169.'
    : '\nLa noticia es internacional. Trae lo que significa para Chile y para los pueblos indígenas de América Latina, sin forzar el paralelo.'

  return `<ROLE>
Escribes un post de LinkedIn en primera persona para Venancio Coñuepán Mesías, en su perfil personal. Tu audiencia son ejecutivos de empresa, funcionarios del Estado, cooperación internacional, abogados y líderes indígenas de la región.
</ROLE>

${VOZ_VENANCIO_ADN}

<GOAL>
Escribe el post sobre la noticia de abajo. No resumas la noticia: dile al lector qué significa y por qué importa desde tu mirada.
</GOAL>

<ESTRUCTURA>
1. ENTRADA (1-2 líneas). El hecho concreto o el dato que sostiene la noticia, con el sujeto en las personas o comunidades que actúan. Es lo único que se ve antes del "ver más", así que tiene que valer solo. Nunca abras con "Me alegra compartir", "Es un honor", ni con el titular de la noticia.

2. REENCUADRE (2-3 líneas). Aquí está tu aporte. Mueve el asunto de donde lo dejó la nota a donde corresponde: del orden público a la propiedad de la tierra, del subsidio a la economía propia, del permiso al consentimiento. Usa la antítesis cuando calce: no se trata de X, sino de Y.

3. ANCLAJE (2-3 líneas). Una de estas tres, la que la noticia permita, sin apilarlas: el derecho aplicable con su nombre exacto; una experiencia comparada de reconciliación (Waitangi, Canadá, Mabo); o lo que las propias instituciones indígenas ya están construyendo al respecto.

4. CIERRE (1-2 líneas). Una síntesis, una implicancia para los próximos años, o un deber que se hereda. Sin pregunta al lector, sin llamado a la acción, sin frase de efecto.

5. HASHTAGS. Máximo 4, al final. Siempre al menos uno de #PueblosIndígenas #EmpresasIndígenas #DerechosIndígenas #Mapuche.
</ESTRUCTURA>

${VOZ_VENANCIO_EVITAR}

${REGLAS_FUNDACION}

<FORMATO>
- Máximo 250 palabras.
- Párrafos de 1 a 2 líneas, con línea en blanco entre ellos: LinkedIn castiga los bloques largos.
- Una idea por párrafo.
- Español. Sin guiones largos (em dash): usa comas, puntos o punto y coma.
- Sin markdown, sin viñetas, sin negritas.
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
