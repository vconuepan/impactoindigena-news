import { EMOTION_TAGS_PROMPT_BLOCK, NARRATIVE_FRAME_PROMPT_BLOCK, formatArticlesBlock } from './shared.js'
import type { StoryForPreassess, IssueForPreassess } from './preassess.js'

/**
 * Prompt for emotion-tag-only classification.
 * Accepts the issues parameter for compatibility with runBatchClassification,
 * but only asks the LLM to assign emotion tags (no issue classification or rating).
 * The issueSlug field is still required in the response schema, so we include
 * a minimal issue reference to satisfy it.
 */
export function buildEmotionTagPrompt(
  stories: StoryForPreassess[],
  issues: IssueForPreassess[],
): string {
  // We include a single dummy issue so the LLM can satisfy the required issueSlug field.
  // The actual issue assignment is ignored in the buildUpdate.
  const fallbackSlug = issues[0]?.slug ?? 'unknown'

  return `<ROLE>
You are a classifier analyzing news articles.
</ROLE>

<GOAL>
For each article: assign an emotion tag and a narrative frame.
Use issue slug "${fallbackSlug}" for all articles (issue classification is not needed).
Do not rate the articles.
</GOAL>

${EMOTION_TAGS_PROMPT_BLOCK}

${NARRATIVE_FRAME_PROMPT_BLOCK}

${formatArticlesBlock(stories)}`
}
