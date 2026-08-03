import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { getLLMByTier, rateLimitDelay } from './llm.js'
import { buildBlueskyPickBestPrompt } from '../prompts/index.js'
import type { StoryForBlueskyPick } from '../prompts/index.js'
import { blueskyPickBestSchema } from '../schemas/bluesky.js'

const log = createLogger('social-media')

/**
 * The slice of a channel that candidate selection needs: which of these
 * stories it has already published. The caller owns the channel list, so
 * selection can never drift from the set of channels that will be posted to.
 */
export interface AutoPostChannel {
  name: string
  publishedStoryIds: (storyIds: string[]) => Promise<Set<string>>
}

/**
 * Find recently published stories that are candidates for social media posting.
 * A story is a candidate if at least one of the given channels has not
 * published it yet.
 *
 * The channels come from the caller rather than a hardcoded list, and that is
 * the point: a disabled channel can never keep a story in the running (which
 * would burn an LLM pick on a story nothing ends up posting), and enabling a
 * channel picks up the backlog on its own.
 *
 * @returns Array of candidate story IDs
 */
export async function findAutoPostCandidates(
  lookbackHours: number,
  channels: AutoPostChannel[],
): Promise<string[]> {
  if (channels.length === 0) return []

  const since = new Date()
  since.setHours(since.getHours() - lookbackHours)

  const publishedStories = await prisma.story.findMany({
    where: {
      status: 'published',
      datePublished: { gte: since },
      title: { not: null },
      summary: { not: null },
      slug: { not: null },
    },
    select: { id: true },
  })

  if (publishedStories.length === 0) return []

  const storyIds = publishedStories.map((s) => s.id)

  // One query per channel, in parallel.
  const postedPerChannel = await Promise.all(
    channels.map((channel) => channel.publishedStoryIds(storyIds)),
  )

  return storyIds.filter((id) => postedPerChannel.some((posted) => !posted.has(id)))
}

/**
 * Use LLM to pick the best story from a set for social media posting.
 * This is platform-agnostic — it picks based on content quality and engagement potential.
 *
 * Uses the same pick-best prompt as Bluesky (the criteria are universal).
 */
export async function pickBestStoryForSocial(storyIds: string[]): Promise<{ storyId: string; reasoning: string }> {
  const stories = await prisma.story.findMany({
    where: { id: { in: storyIds } },
    include: { issue: true },
  })

  if (stories.length === 0) throw new Error('No stories found')

  // If only one candidate, just return it
  if (stories.length === 1) {
    return { storyId: stories[0].id, reasoning: 'Only one candidate story.' }
  }

  const storiesForPrompt: StoryForBlueskyPick[] = stories.map((s) => ({
    id: s.id,
    title: s.title || s.sourceTitle,
    titleLabel: s.titleLabel || '',
    summary: s.summary || '',
    relevanceSummary: s.relevanceSummary,
    relevance: s.relevance,
    emotionTag: s.emotionTag,
    issueName: s.issue?.name ?? null,
    datePublished: s.datePublished?.toISOString() ?? null,
  }))

  // Reuse the Bluesky pick-best prompt — the criteria (timeliness, emotional appeal,
  // broad relevance, shareability, uniqueness) are universal across social platforms.
  const prompt = buildBlueskyPickBestPrompt(storiesForPrompt)
  const llm = getLLMByTier(config.socialAutoPost.pickModelTier)
  const structuredLlm = llm.withStructuredOutput(blueskyPickBestSchema, { method: 'functionCalling' })

  await rateLimitDelay()
  log.info({ candidateCount: stories.length }, 'picking best story for social media')
  const result = await structuredLlm.invoke([new HumanMessage(prompt)])

  // Validate the returned storyId exists in candidates
  const valid = stories.find((s) => s.id === result.storyId)
  if (!valid) {
    log.warn({ returnedId: result.storyId }, 'LLM returned invalid storyId, falling back to first candidate')
    return { storyId: stories[0].id, reasoning: 'LLM returned invalid ID; selected first candidate.' }
  }

  log.info({ storyId: result.storyId, reasoning: result.reasoning }, 'best story picked for social media')
  return result
}
