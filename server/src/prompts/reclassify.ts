import { EMOTION_TAGS_PROMPT_BLOCK, NARRATIVE_FRAME_PROMPT_BLOCK, formatIssuesBlock, formatArticlesBlock } from './shared.js'
import type { StoryForPreassess, IssueForPreassess } from './preassess.js'

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

${EMOTION_TAGS_PROMPT_BLOCK}

${NARRATIVE_FRAME_PROMPT_BLOCK}

${formatArticlesBlock(stories)}`
}
