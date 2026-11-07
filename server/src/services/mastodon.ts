import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { getLLMByTier, rateLimitDelay } from './llm.js'
import { createStatus, getStatusMetrics, deleteStatus as deleteMastodonStatus, isMastodonConfigured, getAccountStatuses } from '../lib/mastodon.js'
import { buildMastodonPostPrompt } from '../prompts/index.js'
import type { StoryForMastodonPost } from '../prompts/index.js'
import { mastodonPostTextSchema } from '../schemas/mastodon.js'
import { TTLCache, cached } from '../lib/cache.js'
import type { AccountStatusesResult } from '../lib/mastodon.js'
import { limpiarPost } from '../lib/personasSensibles.js'

const log = createLogger('mastodon-service')

// Cache Mastodon API feed responses for 2 minutes.
const feedCache = new TTLCache<AccountStatusesResult>(2 * 60 * 1000)

/** Clear the feed cache (call after any mutation that changes the Mastodon feed). */
export function invalidateFeedCache(): void {
  feedCache.clear()
}

// ---------------------------------------------------------------------------
// Text assembly helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Build the metadata line: "Issue | Emotion | found on Publisher" */
function buildMetaLine(parts: {
  issueName: string | null
  emotionTag: string | null
  publisherName: string
}): string {
  const segments = [
    parts.issueName,
    parts.emotionTag ? capitalize(parts.emotionTag) : null,
    `found on ${parts.publisherName}`,
  ].filter(Boolean)
  return segments.join(' | ')
}

/**
 * Assemble the structured post text from parts.
 * Format: editorial text\nmetadata\nsource URL\nstory URL
 *
 * The source URL (original article) appears first so Mastodon generates
 * its link preview card from the original article, not the AR page.
 */
export function assemblePostText(parts: {
  blurb: string
  issueName: string | null
  emotionTag: string | null
  publisherName: string
  sourceUrl: string
  storyUrl: string
}): string {
  const metaLine = buildMetaLine(parts)
  return `${parts.blurb}\n${metaLine}\n${parts.sourceUrl}\n${parts.storyUrl}`
}

/**
 * Calculate max chars for the LLM editorial text given the metadata line and both URLs.
 */
function calcMaxBlurbChars(parts: {
  issueName: string | null
  emotionTag: string | null
  publisherName: string
  sourceUrl: string
  storyUrl: string
}): number {
  const metaLine = buildMetaLine(parts)
  // charLimit minus metadata line, source URL, story URL, and three newlines
  return Math.max(50, config.mastodon.charLimit - metaLine.length - parts.sourceUrl.length - parts.storyUrl.length - 3)
}

// ---------------------------------------------------------------------------
// Draft generation
// ---------------------------------------------------------------------------

/**
 * Generate a Mastodon post draft for a story using LLM.
 * Saves a MastodonPost record with status "draft".
 */
export async function generateDraft(storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      feed: true,
      issue: true,
    },
  })

  if (!story) throw new Error('Story not found')
  if (!story.title || !story.summary) throw new Error('Story must be fully analyzed (title and summary required)')

  // Prevent duplicate posts
  const existingPost = await prisma.mastodonPost.findFirst({
    where: { storyId },
  })
  if (existingPost) throw new Error('Story already has a Mastodon post')

  const publisherName = story.feed.displayTitle || story.feed.title
  const issueName = story.issue?.name ?? null
  const emotionTag = story.emotionTag
  const sourceUrl = story.sourceUrl
  const storyUrl = `${config.siteUrl}/stories/${story.slug}`

  const maxChars = calcMaxBlurbChars({
    issueName,
    emotionTag,
    publisherName,
    sourceUrl,
    storyUrl,
  })

  const storyForPrompt: StoryForMastodonPost = {
    id: story.id,
    title: story.title,
    titleLabel: story.titleLabel || '',
    summary: story.summary,
    relevanceSummary: story.relevanceSummary,
    maxChars,
  }

  const prompt = buildMastodonPostPrompt(storyForPrompt)
  const llm = getLLMByTier(config.mastodon.postModelTier)
  const structuredLlm = llm.withStructuredOutput(mastodonPostTextSchema, { method: 'functionCalling' })

  await rateLimitDelay()
  log.info({ storyId, maxChars }, 'generating Mastodon post draft')
  const result = await structuredLlm.invoke([new HumanMessage(prompt)])

  // Trim LLM output to maxChars if it overshot
  // Candado de personas antes de recortar: puede acortar el texto. Ver lib/personasSensibles.ts.
  const candado = limpiarPost(result.postText.trim())
  if (candado.resumen.hubo) log.warn({ storyId, red: 'mastodon', campos: candado.resumen.campos }, 'candado de personas: post editado antes de guardar')
  let blurb = candado.texto
  if (blurb.length > maxChars) {
    log.warn({ storyId, blurbLength: blurb.length, maxChars }, 'LLM blurb exceeded max chars, trimming')
    blurb = blurb.slice(0, maxChars - 1) + '\u2026'
  }

  const fullText = assemblePostText({
    blurb,
    issueName,
    emotionTag,
    publisherName,
    sourceUrl,
    storyUrl,
  })

  // Character count safety check
  if (fullText.length > config.mastodon.charLimit) {
    log.warn({ storyId, charCount: fullText.length }, 'assembled post exceeds char limit')
  }

  const post = await prisma.mastodonPost.create({
    data: {
      storyId,
      postText: fullText,
      status: 'draft',
    },
    include: { story: { include: { feed: true, issue: true } } },
  })

  log.info({ postId: post.id, storyId, textLength: fullText.length }, 'draft generated')
  return post
}

// ---------------------------------------------------------------------------
// Pick best story (uses shared social media service)
// ---------------------------------------------------------------------------

/**
 * Pick the best story from a set and generate a Mastodon draft for it.
 * Uses the platform-agnostic picker from socialMedia.ts (does NOT filter by
 * Bluesky posts — only considers story quality).
 */
export async function pickAndDraft(storyIds: string[]) {
  const { pickBestStoryForSocial } = await import('./socialMedia.js')
  const { storyId, reasoning } = await pickBestStoryForSocial(storyIds)
  const post = await generateDraft(storyId)
  return { ...post, pickReasoning: reasoning }
}

// ---------------------------------------------------------------------------
// Draft management
// ---------------------------------------------------------------------------

export async function updateDraft(postId: string, postText: string) {
  const post = await prisma.mastodonPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')
  if (post.status !== 'draft') throw new Error('Can only edit draft posts')

  return prisma.mastodonPost.update({
    where: { id: postId },
    data: { postText },
    include: { story: { include: { feed: true, issue: true } } },
  })
}

/**
 * Delete a Mastodon post. For published posts, also deletes from Mastodon.
 */
export async function deletePostRecord(postId: string) {
  const post = await prisma.mastodonPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')

  // If published with a status ID, delete from Mastodon first
  if (post.status === 'published' && post.statusId) {
    try {
      await deleteMastodonStatus(post.statusId)
      log.info({ postId, statusId: post.statusId }, 'deleted status from Mastodon')
    } catch (err) {
      log.warn({ err, postId, statusId: post.statusId }, 'failed to delete status from Mastodon, removing DB record anyway')
    }
  }

  await prisma.mastodonPost.delete({ where: { id: postId } })
  invalidateFeedCache()
  log.info({ postId, status: post.status }, 'deleted Mastodon post record')
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * Publish a draft post to Mastodon.
 */
export async function publishPost(postId: string) {
  if (!isMastodonConfigured()) {
    throw new Error('Mastodon credentials not configured')
  }

  const post = await prisma.mastodonPost.findUnique({
    where: { id: postId },
    include: { story: { include: { feed: true } } },
  })

  if (!post) throw new Error('Post not found')
  if (post.status !== 'draft') throw new Error('Can only publish draft posts')

  try {
    const result = await createStatus(post.postText)

    const updated = await prisma.mastodonPost.update({
      where: { id: postId },
      data: {
        status: 'published',
        statusId: result.id,
        statusUrl: result.url,
        publishedAt: new Date(),
      },
      include: { story: { include: { feed: true, issue: true } } },
    })

    invalidateFeedCache()
    log.info({ postId, statusId: result.id, url: result.url }, 'post published to Mastodon')
    return updated
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    await prisma.mastodonPost.update({
      where: { id: postId },
      data: { status: 'failed', error: errorMessage },
    })
    log.error({ err, postId }, 'failed to publish to Mastodon')
    throw err
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Update engagement metrics for all recent published posts.
 */
export async function updateMetrics() {
  if (!isMastodonConfigured()) {
    log.warn('Mastodon not configured, skipping metrics update')
    return
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - config.mastodon.metrics.maxAgeDays)

  const posts = await prisma.mastodonPost.findMany({
    where: {
      status: 'published',
      statusId: { not: null },
      publishedAt: { gte: cutoff },
    },
  })

  if (posts.length === 0) {
    log.info('no published posts to update metrics for')
    return
  }

  log.info({ postCount: posts.length }, 'updating Mastodon engagement metrics')

  let updated = 0
  let failed = 0

  for (const post of posts) {
    try {
      const metrics = await getStatusMetrics(post.statusId!)
      await prisma.mastodonPost.update({
        where: { id: post.id },
        data: {
          favouriteCount: metrics.favouriteCount,
          boostCount: metrics.boostCount,
          replyCount: metrics.replyCount,
          metricsUpdatedAt: new Date(),
        },
      })
      updated++
    } catch (err) {
      log.warn({ err, postId: post.id, statusId: post.statusId }, 'failed to update metrics for post')
      failed++
    }
  }

  invalidateFeedCache()
  log.info({ updated, failed }, 'metrics update complete')
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export async function listPosts(options: { status?: string; page?: number; limit?: number }) {
  const { status, page = 1, limit = 20 } = options
  const skip = (page - 1) * limit

  const where = status ? { status } : {}

  const [posts, total] = await Promise.all([
    prisma.mastodonPost.findMany({
      where,
      include: { story: { include: { issue: true, feed: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.mastodonPost.count({ where }),
  ])

  return { posts, total, page, limit }
}

export async function getPostById(postId: string) {
  return prisma.mastodonPost.findUnique({
    where: { id: postId },
    include: { story: { include: { issue: true, feed: true } } },
  })
}

// ---------------------------------------------------------------------------
// Feed (merged API + DB view)
// ---------------------------------------------------------------------------

/**
 * Fetch the Mastodon account statuses and cross-reference with DB records.
 * Returns feed items enriched with tracking info, plus any draft/failed DB posts
 * on the first page (no maxId).
 */
export async function getFeed(options: { maxId?: string; limit?: number }) {
  const { maxId, limit = 25 } = options

  if (!isMastodonConfigured()) {
    return { feed: [], nextMaxId: undefined, dbOnlyPosts: [] }
  }

  const cacheKey = `${maxId ?? ''}:${limit}`
  const apiResult = await cached(feedCache, cacheKey, () => getAccountStatuses({ maxId, limit }))

  // Cross-reference API status IDs with DB + fetch draft/failed in parallel
  const apiStatusIds = apiResult.items.map((item) => item.id)

  const [trackedPosts, pendingPosts] = await Promise.all([
    apiStatusIds.length > 0
      ? prisma.mastodonPost.findMany({
          where: { statusId: { in: apiStatusIds } },
          include: { story: { include: { issue: true, feed: true } } },
        })
      : Promise.resolve([]),
    !maxId
      ? prisma.mastodonPost.findMany({
          where: { status: { in: ['draft', 'failed'] } },
          include: { story: { include: { issue: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma type not generated until migration applied
  const trackedByStatusId = new Map((trackedPosts as any[]).map((p) => [p.statusId, p]))

  // Enrich API items with DB data
  const feed = apiResult.items.map((item) => {
    const tracked = trackedByStatusId.get(item.id)
    return {
      ...item,
      trackedPostId: tracked?.id ?? null,
      storyTitle: tracked?.story?.title ?? null,
      storySlug: tracked?.story?.slug ?? null,
      issueName: tracked?.story?.issue?.name ?? null,
      dbStatus: tracked?.status ?? null,
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma type not generated until migration applied
  const dbOnlyPosts = (pendingPosts as any[]).map((p) => ({
    id: p.id,
    postText: p.postText,
    status: p.status,
    error: p.error,
    createdAt: p.createdAt.toISOString(),
    storyTitle: p.story?.title ?? null,
    storySlug: p.story?.slug ?? null,
    issueName: p.story?.issue?.name ?? null,
  }))

  return { feed, nextMaxId: apiResult.nextMaxId, dbOnlyPosts }
}
