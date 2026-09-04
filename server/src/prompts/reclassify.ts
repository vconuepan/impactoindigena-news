import { EMOTION_TAGS_PROMPT_BLOCK, NARRATIVE_FRAME_PROMPT_BLOCK, CLASSIFICATION_BLOCK, formatIssuesBlock, formatArticlesBlock } from './shared.js'
import type { StoryForPreassess, IssueForPreassess } from './preassess.js'

/**
 * Prompt de reclasificacion.
 *
 * Incluye `CLASSIFICATION_BLOCK` igual que el pre-assessment. Hasta el
 * 1-sep-2026 no lo incluia: la reclasificacion masiva decidia el tema con la
 * descripcion del issue y nada mas, sin las reglas de desempate entre economia,
 * derechos, cultura y clima. Es la herramienta con la que se corrigen los temas
 * mal asignados, y corria justamente sin el criterio que define cual es el
 * correcto.
 */
export function buildReclassifyPrompt(
  stories: StoryForPreassess[],
  issues: IssueForPreassess[],
): string {
  return `<ROLE>
You are a news classifier categorizing articles into thematic issues and assigning emotion tags.
</ROLE>

<GOAL>
For each article: classify it into the single most relevant issue, assign an emotion tag, and assign a narrative frame. Do not rate the articles.
</GOAL>

${formatIssuesBlock(issues)}

${CLASSIFICATION_BLOCK}

${EMOTION_TAGS_PROMPT_BLOCK}

${NARRATIVE_FRAME_PROMPT_BLOCK}

${formatArticlesBlock(stories)}`
}
