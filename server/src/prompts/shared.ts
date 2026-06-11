import { config } from '../config.js'

export interface Guidelines {
  factors: string
  antifactors: string
  ratings: string
}

export function buildGuidelinesXml(g: Guidelines): string {
  return `<FACTORS>\n${g.factors}\n</FACTORS>\n\n<TOPIC-SPECIFIC LIMITING FACTORS>\n${g.antifactors}\n</TOPIC-SPECIFIC LIMITING FACTORS>\n\n<CRITERIA>\n${g.ratings}\n</CRITERIA>`
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function containsChineseCharacters(str: string): boolean {
  return /\p{Script=Han}/u.test(str)
}

// ---------------------------------------------------------------------------
// Emotion tag definitions (single source of truth)
// ---------------------------------------------------------------------------

/**
 * Prompt block for emotion tag guidance.
 * Include in any prompt that asks the LLM to assign emotion tags.
 */
export const EMOTION_TAGS_PROMPT_BLOCK = `<EMOTION TAGS>
Use EXACTLY these English values (the valid enum values are: uplifting, frustrating, scary, calm):
- uplifting: Claramente positivo o inspirador para los pueblos indígenas. La positividad debe ser obvia y no depender de un punto de vista particular. Si existe debate real sobre si es una buena noticia, usa calm.
- frustrating: Negativo, decepcionante o que genera indignación.
- scary: Inquietante o amenazante (p. ej., violencia contra líderes indígenas, amenazas a territorios o derechos fundamentales).
- calm: Neutral, mixto o ambiguamente positivo. Úsalo como opción predeterminada cuando el tono emocional sea debatible o dependa de una perspectiva específica.
</EMOTION TAGS>`

/**
 * Compact description for Zod schema .describe() calls.
 * Keeps structured output guidance consistent with prompt blocks.
 */
export const EMOTION_TAG_SCHEMA_DESCRIPTION =
  'Emotion tag — must be EXACTLY one of the enum values: uplifting, frustrating, scary, calm. ' +
  'uplifting: claramente positivo o inspirador para pueblos indígenas. Cuando haya duda, usar calm. ' +
  'frustrating: negativo, decepcionante o que genera indignación. ' +
  'scary: inquietante o amenazante (p. ej., violencia contra líderes, amenazas a territorios indígenas). ' +
  'calm: neutral, mixto o ambiguamente positivo — usar como opción predeterminada.'

// ---------------------------------------------------------------------------
// Narrative frame definitions (single source of truth)
// ---------------------------------------------------------------------------

/**
 * Prompt block for narrative frame guidance.
 * Include in any prompt that asks the LLM to assign a narrative frame.
 */
export const NARRATIVE_FRAME_PROMPT_BLOCK = `<NARRATIVE FRAME>
Use EXACTLY these Spanish values (the valid enum values are: confrontacion, resiliencia, protagonismo, alianza):
- confrontacion: El artículo muestra a un pueblo o comunidad indígena en conflicto, disputa o resistencia frente al Estado, empresas u otros actores externos.
- resiliencia: El artículo muestra cómo un pueblo o comunidad indígena supera adversidades, se recupera de traumas o preserva su cultura frente a presiones externas.
- protagonismo: El artículo muestra a un pueblo o comunidad indígena como agente activo que lidera, innova, negocia o decide su propio futuro.
- alianza: El artículo muestra cooperación, acuerdos, alianzas o diálogos entre pueblos indígenas y otros actores (Estado, empresas, sociedad civil, academia).
If the story scores 1-2 (not about indigenous peoples), use the frame that best approximates the article's content.
</NARRATIVE FRAME>`

/**
 * Compact description for Zod schema .describe() calls.
 */
export const NARRATIVE_FRAME_SCHEMA_DESCRIPTION =
  'Narrative frame — must be EXACTLY one of: confrontacion, resiliencia, protagonismo, alianza. ' +
  'confrontacion: conflicto o resistencia frente a actores externos. ' +
  'resiliencia: superación de adversidades o preservación cultural. ' +
  'protagonismo: liderazgo activo, innovación o autodeterminación. ' +
  'alianza: cooperación, acuerdos o diálogos con actores externos.'

// ---------------------------------------------------------------------------
// Shared prompt building blocks
// ---------------------------------------------------------------------------

export interface StoryForPrompt {
  id: string
  title: string
  content: string
}

export interface IssueForPrompt {
  slug: string
  name: string
  description: string
}

/**
 * Format an array of issues as XML for prompt inclusion.
 */
export function formatIssuesBlock(issues: IssueForPrompt[]): string {
  let block = '<ISSUES>\n'
  for (const issue of issues) {
    block += `<ISSUE slug="${escapeXml(issue.slug)}" name="${escapeXml(issue.name)}">${escapeXml(issue.description)}</ISSUE>\n`
  }
  block += '</ISSUES>'
  return block
}

/**
 * Format an array of stories as the `<ARTICLES>` prompt block,
 * using capacity tracking to handle Chinese-character articles.
 */
export function formatArticlesBlock(
  stories: StoryForPrompt[],
  batchSize = config.preassess.batchSize,
  contentMaxLength = config.preassess.contentMaxLength,
): string {
  let block = '<ARTICLES>'
  let capacity = batchSize
  for (const story of stories) {
    if (containsChineseCharacters(story.content)) {
      capacity -= 1.5
    } else {
      capacity -= 1
    }
    if (capacity > 0) {
      block += `\n\n-----\nArticle ID: ${story.id}`
      block += `\nTitle: ${story.title}`
      block += `\n${story.content.substring(0, contentMaxLength)} ...`
    }
  }
  block += '\n</ARTICLES>'
  return block
}
