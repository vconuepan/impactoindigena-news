import { EMOTION_TAGS_PROMPT_BLOCK, formatIssuesBlock, formatArticlesBlock } from './shared.js'
import type { StoryForPrompt, IssueForPrompt } from './shared.js'

// Re-export with legacy names for backwards compatibility
export type StoryForPreassess = StoryForPrompt
export type IssueForPreassess = IssueForPrompt

export function buildPreassessPrompt(
  stories: StoryForPreassess[],
  issues: IssueForPreassess[],
): string {
  return `<ROLE>
Eres un evaluador de relevancia que analiza artículos de noticias por su importancia para los pueblos indígenas del mundo y sus territorios, derechos, culturas y futuros.
</ROLE>

<GOAL>
Para cada artículo: clasíficalo en el tema más relevante, califica su relevancia en una escala del 1 al 10, y asígnale una etiqueta emocional.
</GOAL>

${formatIssuesBlock(issues)}

<CRITERIOS DE CALIFICACION>
Impacto Indígena busca cambiar la narrativa global sobre los pueblos indígenas: no como grupos vulnerables que necesitan ser defendidos, sino como innovadores sociales, guardianes del conocimiento ancestral y protagonistas activos en la solución de los desafíos globales. Publicamos noticias que construyen puentes entre pueblos indígenas, sociedad civil, empresas responsables y Estados, integrando el conocimiento ancestral con el desarrollo económico, la acción climática y la consolidación de la paz.

REGLA FUNDAMENTAL — SIN EXCEPCIÓN: Para recibir calificación 3 o superior, el artículo debe mencionar explícitamente a pueblos indígenas, comunidades indígenas, territorios indígenas, culturas indígenas, o personas indígenas identificadas como tales. Si los pueblos indígenas no aparecen en el artículo, la calificación es siempre 1-2, sin importar el tema (clima, medio ambiente, derechos humanos, economía, política, etc.).

Ejemplos de artículos que SIEMPRE reciben 1-2:
- Política energética o climática de un gobierno sin mención de pueblos indígenas (ej. "el Reino Unido reducirá importaciones de gas con energía eólica")
- Acuerdos comerciales, inversiones o informes económicos sin conexión indígena explícita
- Noticias de biodiversidad o medio ambiente sin mencionar territorios o conocimientos indígenas
- Conflictos, guerras o procesos de paz sin participación indígena mencionada
- Avances tecnológicos, científicos o empresariales sin vínculo explícito con comunidades indígenas

Califica con 5 o más cualquier artículo que mencione explícitamente a pueblos indígenas Y toque uno o más de estos temas:
- Historia, cultura, arte, literatura, lenguas o conocimiento ancestral indígena
- Comunidades indígenas y sus territorios, aunque sea a pequeña escala
- Política pública indígena, consultas indígenas, sentencias judiciales que afecten a pueblos indígenas
- Instituciones indígenas (CONADI, Consejo de Ancianos Rapa Nui, Consejo de Pueblos Atacameños, etc.)
- Parlamentarios, escritores, poetas o profesionales indígenas en ejercicio de su rol
- Soluciones basadas en la naturaleza, innovación o conocimiento tradicional indígena aplicado a desafíos globales
- Derechos indígenas, autodeterminación, reconocimiento legal o políticas públicas
- Colaboración entre pueblos indígenas, sociedad civil, empresas responsables o gobiernos
- Cambio climático, biodiversidad o medio ambiente desde perspectiva o impacto indígena explícito
- Reconciliación, justicia histórica, reparaciones o diálogo intercultural con pueblos indígenas
- Logros, contribuciones y liderazgo de personas o comunidades indígenas
- Historia precolombina, arqueología o patrimonio cultural indígena

Escala de calificación:
1-2: El artículo NO menciona ni involucra a pueblos indígenas, sus territorios, historia o cultura de ninguna forma. Aplica aunque el tema sea clima, ambiente, derechos humanos u otras áreas temáticamente cercanas.
3-4: Los pueblos indígenas sí aparecen en el artículo, pero solo como contexto muy secundario o mención de pasada sin ser el foco central.
5-6: El artículo trata directamente sobre pueblos indígenas, su historia, cultura, territorio, derechos, conocimiento, arte, literatura, o eventos que los afectan, a cualquier escala.
7-8: Alta relevancia; documenta colaboraciones, establece precedentes legales, o visibiliza contribuciones indígenas significativas a nivel regional, nacional o internacional.
9-10: Relevancia excepcional; transforma los derechos indígenas, el reconocimiento de su conocimiento ancestral, o redefine la relación entre pueblos indígenas y la sociedad global.
</CRITERIOS DE CALIFICACION>

${EMOTION_TAGS_PROMPT_BLOCK}

${formatArticlesBlock(stories)}`
}
