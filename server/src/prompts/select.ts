import { escapeXml } from './shared.js'
export interface StoryForSelect {
  id: string
  title: string | null
  summary: string | null
  relevanceReasons: string | null
  antifactors: string | null
  relevanceCalculation: string | null
  emotionTag: string | null
}
export function buildSelectPrompt(
  stories: StoryForSelect[],
  toSelect: number,
): string {
  let query = `<ROLE>
Eres un curador editorial senior de un sitio web que publica las noticias más relevantes para los pueblos indígenas del mundo, organizadas en cuatro temas con igual peso:
1. Cambio Climático y Biodiversidad — medio ambiente, territorios indígenas, biodiversidad, acción climática
2. Derechos Indígenas — derechos territoriales, reconocimiento legal, autodeterminación, derechos humanos, justicia histórica, reparaciones, reconciliación, resolución de conflictos
3. Desarrollo Sostenible y Autodeterminado — economías indígenas, gobernanza propia, educación intercultural
4. Pueblos Indígenas de Chile — conflicto mapuche, pueblos originarios de Chile, política indígena chilena
</ROLE>
<GOAL>
Selecciona exactamente ${toSelect} artículos de los ${stories.length} candidatos a continuación. Devuelve solo sus IDs.
Todos los candidatos merecen ser publicados. Tu trabajo es elegir entre ellos — selecciona los que, considerando todo, importan más para los pueblos indígenas. Comparar entre categorías es inherentemente difícil; usa tu mejor criterio.
</GOAL>
<CRITERIOS_DE_SELECCION>
- Cambio sistémico sobre eventos aislados: Prefiere noticias sobre cambios en políticas, acuerdos internacionales, normas o sistemas que afecten a los pueblos indígenas — estos tienen efectos continuos y multiplicadores.
- Concreto sobre especulativo: Prefiere noticias con impacto real demostrado sobre anuncios, propuestas o investigaciones tempranas que aún no se han materializado.
- Escala y alcance: Prefiere noticias donde el número de personas indígenas significativamente afectadas es mayor, o las consecuencias son más duraderas.
- Noticias positivas: Al elegir entre noticias de relevancia similar, da una ligera preferencia a noticias alentadoras (etiquetadas como "uplifting"). La selección final debe incluir noticias positivas donde sea posible, sin sacrificar relevancia general.
</CRITERIOS_DE_SELECCION>
`
  for (const story of stories) {
    query += '<ARTICLE>\n'
      + `<ID>${story.id}</ID>\n`
      + `<Title>${escapeXml(story.title || '')}</Title>\n`
      + `<Emotion>${escapeXml(story.emotionTag || 'calm')}</Emotion>\n`
      + `<Summary>${escapeXml(story.summary || '')}</Summary>\n`
      + `<Relevance>${escapeXml(story.relevanceReasons || '')}</Relevance>\n`
      + `<Antifactors>${escapeXml(story.antifactors || '')}</Antifactors>\n`
      + `<Calculation>${escapeXml(story.relevanceCalculation || '')}</Calculation>\n`
      + '</ARTICLE>\n'
  }
  return query
}
