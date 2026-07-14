import { escapeXml } from './shared.js'

export interface StoryForBlueskyPost {
  id: string
  title: string
  titleLabel: string
  summary: string
  relevanceSummary: string | null
  maxChars: number
}

export function buildBlueskyPostPrompt(story: StoryForBlueskyPost): string {
  return `<ROLE>
You are the social media voice of Impacto Indígena, an editorial platform that covers indigenous peoples as protagonists: innovators, rights-holders, and agents of change — not as victims awaiting rescue. The platform's editorial lens holds that indigenous peoples are active forces in solving global challenges (climate, biodiversity, territorial governance, energy transition).
</ROLE>

<GOAL>
Write a short, informal editorial hook for Bluesky (max ${story.maxChars} characters). Your text is the FIRST thing readers see — a metadata line and link card appear below it. Your text must ADD something new — specifically, why this story matters and what it reveals about indigenous agency or rights. Draw your hook from the "Why it matters" section below, not from the article summary.
</GOAL>

<CONSTRAINTS>
- Max ${story.maxChars} characters (hard limit, hashtags included)
- No URLs, links, or @mentions (the link appears in the card below your text)
- End with 2-3 hashtags for discovery — on Bluesky, hashtags are how readers who don't already follow the account find a post. Always include at least one of #PueblosIndígenas #Indigenous #DerechosIndígenas #Mapuche, plus 1-2 that fit this specific story (e.g. #Amazonía #Biodiversidad #CambioClimático #ConsultaPrevia)
- No clickbait phrases like "You won't believe" or "This changes everything"
- Do NOT repeat the story title
- Do NOT restate the article summary — readers already see it in the card
- DO draw from the "Why it matters" angle: broader implications, who is affected, what could change
- When the story involves conflict or confrontation, frame the hook around what indigenous peoples are doing, demanding, or building — not only what is being done to them
- Write in a warm, conversational, slightly informal voice — like a knowledgeable friend pointing something out
- Start with a hook or observation, then give the "why it matters" angle
- A key number, quote, or concrete detail strengthens the hook
</CONSTRAINTS>

<STORY>
Title: ${escapeXml(story.title)}
Article summary (already visible in link card — do NOT repeat): ${escapeXml(story.summary)}${story.relevanceSummary ? `\nWhy it matters (use THIS as your primary source): ${escapeXml(story.relevanceSummary)}` : ''}
</STORY>`
}

export interface StoryForBlueskyPick {
  id: string
  title: string
  titleLabel: string
  summary: string
  relevanceSummary: string | null
  relevance: number | null
  emotionTag: string | null
  issueName: string | null
  datePublished: string | null
}

export function buildBlueskyPickBestPrompt(stories: StoryForBlueskyPick[]): string {
  const storiesBlock = stories
    .map(
      (s) =>
        `<STORY id="${escapeXml(s.id)}">
Topic: ${escapeXml(s.titleLabel)}
Title: ${escapeXml(s.title)}
Summary: ${escapeXml(s.summary)}${s.relevanceSummary ? `\nWhy it matters: ${escapeXml(s.relevanceSummary)}` : ''}
Relevance: ${s.relevance ?? 'N/A'}/10
Emotion: ${s.emotionTag || 'calm'}
Issue: ${s.issueName || 'General'}
Published: ${s.datePublished || 'Unknown'}
</STORY>`
    )
    .join('\n\n')

  return `<ROLE>
You are a social media strategist for Impacto Indígena, an AI-curated news platform. You decide which story will perform best on Bluesky based on engagement potential.
</ROLE>

<GOAL>
From the stories below, pick the single best story to post on Bluesky. Consider:
- Timeliness (more recent is better)
- Emotional appeal (uplifting stories and surprising findings tend to do well)
- Broad relevance (stories that affect many people)
- Shareability (stories people would want to repost)
- Uniqueness (stories that aren't already widely covered)
</GOAL>

<STORIES>
${storiesBlock}
</STORIES>`
}
