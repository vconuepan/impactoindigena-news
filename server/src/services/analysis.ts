import { HumanMessage } from '@langchain/core/messages'
import type { ChatOpenAI } from '@langchain/openai'
import type { z } from 'zod'
import prisma from '../lib/prisma.js'
import { EmotionTag, Prisma } from '@prisma/client'
import { config } from '../config.js'
import { Semaphore } from '../lib/semaphore.js'
import { splitIntoGroups } from '../lib/utils.js'
import { createLogger } from '../lib/logger.js'
import { taskRegistry } from '../lib/taskRegistry.js'
import { getSmallLLM, getMediumLLM, getLLMByTier, rateLimitDelay } from './llm.js'
import { withRetry } from '../lib/retry.js'
import { buildPreassessPrompt, buildReclassifyPrompt, buildEmotionTagPrompt, buildAssessPrompt, buildSelectPrompt } from '../prompts/index.js'
import type { StoryForPreassess, IssueForPreassess } from '../prompts/index.js'
import { preAssessResultSchema, reclassifyResultSchema, assessResultSchema, selectResultSchema } from '../schemas/llm.js'
import type { Guidelines } from '../prompts/shared.js'
import { detectAndCluster } from './dedup.js'
import { generateEmbeddingForContent } from './embedding.js'
import { saveEmbeddingTx } from '../lib/vectors.js'

const log = createLogger('analysis')

export type ProgressCallback = (
  event: { type: 'completed'; count: number } | { type: 'failed'; count: number; error: string }
) => void

function getGuidelines(issue: { promptFactors: string; promptAntifactors: string; promptRatings: string }): Guidelines {
  return {
    factors: issue.promptFactors,
    antifactors: issue.promptAntifactors,
    ratings: issue.promptRatings,
  }
}

// --- Shared batch classification helper ---

interface BatchClassificationOptions<T extends { articleId: string; issueSlug: string; emotionTag: string }> {
  storyIds: string[]
  llm: ChatOpenAI
  schema: z.ZodType<{ articles: T[] }>
  buildPrompt: (stories: StoryForPreassess[], issues: IssueForPreassess[]) => string
  buildUpdate: (item: T, issueId: string | null) => Prisma.StoryUpdateInput
  /** Whether to assign feed issue to stories not returned by the LLM. Default true (pre-assess behavior). */
  fallbackToFeedIssue?: boolean
  onProgress?: ProgressCallback
  batchSize: number
  concurrency: number
  label: string
}

async function runBatchClassification<T extends { articleId: string; issueSlug: string; emotionTag: string }>(
  options: BatchClassificationOptions<T>,
): Promise<{ storyId: string; item: T }[]> {
  const { storyIds, llm, schema, buildPrompt, buildUpdate, fallbackToFeedIssue = true, onProgress, batchSize, concurrency, label } = options

  const issues = await prisma.issue.findMany({
    select: { id: true, slug: true, name: true, description: true },
  })

  const slugToId = new Map(issues.map(i => [i.slug, i.id]))

  // Split IDs into batches — stories are loaded per-batch to avoid holding all sourceContent in memory
  const idBatches: string[][] = []
  for (let i = 0; i < storyIds.length; i += batchSize) {
    idBatches.push(storyIds.slice(i, i + batchSize))
  }

  log.info({ batchCount: idBatches.length, storyCount: storyIds.length }, `${label} batches prepared`)

  // Force functionCalling — Azure doesn't support jsonSchema (Structured Outputs strict mode)
  // for non-gpt-4o models, causing "fetch failed" / connection errors at the network level.
  const structuredLlm = llm.withStructuredOutput(schema, { method: 'functionCalling' })
  const semaphore = new Semaphore(concurrency)
  const totalBatches = idBatches.length
  let batchesDone = 0

  const settled = await Promise.allSettled(
    idBatches.map((batchIds, batchIdx) =>
      semaphore.run(async () => {
        const batchLabel = `batch ${batchIdx + 1}/${totalBatches}`

        // Load stories for this batch only — avoids holding all sourceContent in memory
        const batch = await prisma.story.findMany({
          where: { id: { in: batchIds } },
          select: {
            id: true,
            sourceTitle: true,
            sourceContent: true,
            feed: { select: { issueId: true } },
          },
        })

        log.info({ batch: batchLabel, storyCount: batch.length }, 'processing batch')

        const prompt = buildPrompt(
          batch.map(s => ({ id: s.id, title: s.sourceTitle, content: s.sourceContent })),
          issues,
        )

        await rateLimitDelay()
        const response = await withRetry(() => structuredLlm.invoke([new HumanMessage(prompt)]))
        batchesDone++
        log.info({ progress: `${batchesDone}/${totalBatches}`, resultCount: response.articles.length, batch: batchLabel }, 'batch complete')

        const storyMap = new Map(batch.map(s => [s.id, s]))
        const batchResults: { storyId: string; item: T }[] = []
        const updates: ReturnType<typeof prisma.story.update>[] = []
        for (const item of response.articles) {
          const story = storyMap.get(item.articleId)
          if (!story) {
            log.warn({ articleId: item.articleId }, 'LLM returned unknown articleId')
            continue
          }

          let issueId = slugToId.get(item.issueSlug)
          if (!issueId) {
            log.warn({ articleId: item.articleId, issueSlug: item.issueSlug }, 'invalid issue slug, falling back to feed issue')
            issueId = story.feed.issueId
          }

          updates.push(prisma.story.update({
            where: { id: story.id },
            data: buildUpdate(item, issueId),
          }))

          batchResults.push({
            storyId: story.id,
            item,
          })
        }

        // Fallback: assign feed issue to stories not returned by LLM (opt-in)
        if (fallbackToFeedIssue) {
          for (const story of batch) {
            if (!batchResults.some(r => r.storyId === story.id)) {
              updates.push(prisma.story.update({
                where: { id: story.id },
                data: { issueId: story.feed.issueId },
              }))
            }
          }
        }

        if (updates.length > 0) {
          await prisma.$transaction(updates)
        }
        onProgress?.({ type: 'completed', count: batchResults.length })
        const missing = batch.length - batchResults.length
        if (missing > 0) {
          onProgress?.({ type: 'failed', count: missing, error: `Story not returned in ${label} results` })
        }
        return batchResults
      }),
    ),
  )

  const results: { storyId: string; item: T }[] = []
  let errors = 0
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(...result.value)
    } else {
      errors++
      log.error({ err: result.reason }, 'batch failed')
      onProgress?.({ type: 'failed', count: 1, error: result.reason instanceof Error ? result.reason.message : 'Batch failed' })
    }
  }
  if (errors > 0) log.warn({ errorCount: errors }, 'some batches failed')

  return results
}

// --- Pre-assessment ---

export async function preAssessStories(
  storyIds: string[],
  onProgress?: ProgressCallback,
): Promise<{ storyId: string; rating: number; emotionTag: string }[]> {
  const results = await runBatchClassification({
    storyIds,
    llm: getMediumLLM(),
    schema: preAssessResultSchema,
    buildPrompt: buildPreassessPrompt,
    buildUpdate: (item, issueId) => ({
      issueId,
      relevancePre: Math.max(1, item.rating), // clamp: model may return 0 for very low relevance
      emotionTag: item.emotionTag as EmotionTag,
      status: 'pre_analyzed',
    }),
    onProgress,
    batchSize: config.preassess.batchSize,
    concurrency: config.concurrency.preassess,
    label: 'pre-assessment',
  })

  return results.map(r => ({
    storyId: r.storyId,
    rating: r.item.rating,
    emotionTag: r.item.emotionTag,
  }))
}

// --- Reclassification ---

export async function reclassifyStories(
  storyIds: string[],
  onProgress?: ProgressCallback,
): Promise<{ storyId: string; emotionTag: string }[]> {
  const results = await runBatchClassification({
    storyIds,
    llm: getSmallLLM(),
    schema: reclassifyResultSchema,
    buildPrompt: buildReclassifyPrompt,
    buildUpdate: (item, issueId) => ({
      issueId,
      emotionTag: item.emotionTag as EmotionTag,
    }),
    fallbackToFeedIssue: false,
    onProgress,
    batchSize: config.preassess.batchSize,
    concurrency: config.concurrency.reclassify,
    label: 'reclassification',
  })

  return results.map(r => ({
    storyId: r.storyId,
    emotionTag: r.item.emotionTag,
  }))
}

// --- Emotion-only tagging ---

export async function tagEmotionOnly(
  storyIds: string[],
  onProgress?: ProgressCallback,
): Promise<{ storyId: string; emotionTag: string }[]> {
  const results = await runBatchClassification({
    storyIds,
    llm: getSmallLLM(),
    schema: reclassifyResultSchema,
    buildPrompt: buildEmotionTagPrompt,
    buildUpdate: (item) => ({
      emotionTag: item.emotionTag as EmotionTag,
    }),
    fallbackToFeedIssue: false,
    onProgress,
    batchSize: config.preassess.batchSize,
    concurrency: config.concurrency.reclassify,
    label: 'emotion-tagging',
  })

  return results.map(r => ({
    storyId: r.storyId,
    emotionTag: r.item.emotionTag,
  }))
}

// --- Full assessment ---

export async function assessStory(storyId: string): Promise<void> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { issue: true, feed: { include: { issue: true } } },
  })
  if (!story) throw new Error('Story not found')

  log.info({ storyId, title: story.sourceTitle?.slice(0, 80) }, 'assessing story')

  const guidelines = getGuidelines(story.issue ?? story.feed.issue)
  const publisher = story.feed.title
  const prompt = buildAssessPrompt(story.sourceTitle, story.sourceContent, publisher, story.sourceUrl, guidelines, story.sourceDatePublished?.toISOString())

  await rateLimitDelay()
  const llm = getLLMByTier(config.assess.modelTier)
  // Force functionCalling — same reason as batchLlmProcess above
  const structuredLlm = llm.withStructuredOutput(assessResultSchema, { method: 'functionCalling' })
  let parsed: Awaited<ReturnType<typeof structuredLlm.invoke>>
  try {
    parsed = await withRetry(() => structuredLlm.invoke([new HumanMessage(prompt)]))
  } catch (err) {
    const status = (err as any)?.status
    const cause = (err as any)?.cause                        // e.g. TypeError "fetch failed"
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : undefined
    const causeCode = (cause as any)?.code
    const rootCause = (cause as any)?.cause                  // e.g. actual network Error
    const rootMsg = rootCause instanceof Error ? rootCause.message : rootCause ? String(rootCause) : undefined
    const rootCode = (rootCause as any)?.code                // e.g. ECONNRESET, ETIMEDOUT, ENOTFOUND
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ storyId, status, causeMsg, causeCode, rootMsg, rootCode, err }, 'assess LLM call failed')
    const detail = [
      status ? `status=${status}` : '',
      causeMsg ? `cause=${causeMsg}` : '',
      causeCode ? `causeCode=${causeCode}` : '',
      rootMsg  ? `root=${rootMsg}` : '',
      rootCode ? `rootCode=${rootCode}` : '',
    ].filter(Boolean).join(' ')
    throw new Error(`LLM call failed: ${msg}${detail ? ` [${detail}]` : ''}`)
  }

  log.info({ storyId, rating: parsed.conservativeRating, title: parsed.relevanceTitle?.slice(0, 60) }, 'assessment complete')

  // Parse publication date returned by the LLM. The sentinel "1970-01-01" means
  // the LLM couldn't find it — treat as unknown and leave the field untouched.
  const parsedPubDate = parsed.publicationDate ? new Date(parsed.publicationDate) : null
  const sourceDatePublished =
    parsedPubDate && !isNaN(parsedPubDate.getTime()) && parsedPubDate.getFullYear() > 1970
      ? parsedPubDate
      : undefined

  const analysisData = {
    titleLabel: parsed.titleLabel || null,
    title: parsed.relevanceTitle || null,
    summary: parsed.summary || null,
    quote: parsed.quote || null,
    quoteAttribution: parsed.quoteAttribution || null,
    marketingBlurb: parsed.marketingBlurb || null,
    relevanceSummary: parsed.relevanceSummary || null,
    relevanceReasons: parsed.factors.join('\n'),
    antifactors: parsed.limitingFactors.join('\n'),
    relevanceCalculation: parsed.relevanceCalculation.join('\n'),
    relevance: parsed.conservativeRating,
    status: 'analyzed' as const,
    ...(sourceDatePublished !== undefined && { sourceDatePublished }),
  }

  // Generate embedding from analysis results BEFORE saving — throws on failure
  let embeddingData: Awaited<ReturnType<typeof generateEmbeddingForContent>> | undefined
  try {
    embeddingData = await generateEmbeddingForContent({
      title: analysisData.title,
      titleLabel: analysisData.titleLabel,
      summary: analysisData.summary,
      embeddingContentHash: null, // force generation
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Embedding failed: ${msg}`)
  }

  // Save analysis + embedding atomically
  await prisma.$transaction(async (tx) => {
    await tx.story.update({ where: { id: storyId }, data: analysisData })
    if (embeddingData) {
      await saveEmbeddingTx(tx, storyId, embeddingData.embedding, embeddingData.hash)
    }
  })

  // Dedup runs after the transaction — embedding is guaranteed to exist
  if (config.dedup.enabled) {
    detectAndCluster(storyId)
      .then(result => {
        if (result.clusterId) {
          log.info({ storyId, ...result }, 'post-assessment dedup result')
        }
      })
      .catch(err => {
        log.error({ err, storyId }, 'post-assessment dedup failed')
      })
  }
}

/** Orchestrate concurrent assessment of multiple stories. */
export async function assessStories(
  storyIds: string[],
  onProgress?: ProgressCallback,
): Promise<{ completed: number; errors: number; firstError: string[] }> {
  const semaphore = new Semaphore(config.concurrency.assess)
  let completed = 0
  let errors = 0

  const settled = await Promise.allSettled(
    storyIds.map(id =>
      semaphore.run(async () => {
        await assessStory(id)
        completed++
        onProgress?.({ type: 'completed', count: 1 })
      }),
    ),
  )

  const firstError: string[] = []
  for (const result of settled) {
    if (result.status === 'rejected') {
      errors++
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
      log.error({ storyId: storyIds[settled.indexOf(result)], err: result.reason }, 'story assessment failed')
      onProgress?.({ type: 'failed', count: 1, error: msg })
      if (firstError.length < 3) firstError.push(msg)
    }
  }

  return { completed, errors, firstError }
}

export async function selectStories(storyIds: string[]): Promise<{ selected: string[]; rejected: string[] }> {
  const stories = await prisma.story.findMany({
    where: { id: { in: storyIds } },
    include: { cluster: { select: { primaryStoryId: true } } },
  })

  if (stories.length === 0) return { selected: [], rejected: [] }

  // Dedup safety net: keep only primary (or unclustered) stories for LLM selection
  const dedupFiltered = stories.filter(s => {
    if (!s.cluster) return true // no cluster — keep
    return s.cluster.primaryStoryId === s.id // only primary
  })
  const dedupRejectedIds = stories
    .filter(s => s.cluster && s.cluster.primaryStoryId !== s.id)
    .map(s => s.id)

  if (dedupRejectedIds.length > 0) {
    // Safety net: re-reject non-primary stories that may have been manually un-rejected
    log.info({ filtered: dedupRejectedIds.length }, 'filtered non-primary cluster members from selection')
    await prisma.story.updateMany({
      where: { id: { in: dedupRejectedIds } },
      data: { status: 'rejected' },
    })
  }

  if (dedupFiltered.length === 0) return { selected: [], rejected: dedupRejectedIds }

  log.info({ storyCount: dedupFiltered.length }, 'selecting from stories')

  const toSelect = Math.ceil(dedupFiltered.length * config.selection.ratio)
  const prompt = buildSelectPrompt(
    dedupFiltered.map(s => ({
      id: s.id,
      title: s.title,
      summary: s.summary,
      relevanceReasons: s.relevanceReasons,
      antifactors: s.antifactors,
      relevanceCalculation: s.relevanceCalculation,
      emotionTag: s.emotionTag,
    })),
    toSelect,
  )

  await rateLimitDelay()
  const llm = getLLMByTier(config.selection.modelTier)
  const structuredLlm = llm.withStructuredOutput(selectResultSchema, { method: 'functionCalling' })
  const response = await withRetry(() => structuredLlm.invoke([new HumanMessage(prompt)]))

  log.info({ selectedCount: response.selectedIds.length }, 'LLM selection response received')

  const selectedSet = new Set(response.selectedIds)
  const selected: string[] = []
  const rejected: string[] = [...dedupRejectedIds]

  for (const story of dedupFiltered) {
    if (selectedSet.has(story.id)) {
      selected.push(story.id)
    } else {
      rejected.push(story.id)
    }
  }

  if (selected.length > 0) {
    await prisma.story.updateMany({
      where: { id: { in: selected } },
      data: { status: 'selected' },
    })
  }
  const llmRejected = rejected.filter(id => !dedupRejectedIds.includes(id))
  if (llmRejected.length > 0) {
    await prisma.story.updateMany({
      where: { id: { in: llmRejected } },
      data: { status: 'rejected' },
    })
  }

  return { selected, rejected }
}

/** Split stories into groups and run concurrent selection across groups. */
export async function selectStoriesInGroups(
  storyIds: string[],
  onProgress?: ProgressCallback,
): Promise<{ selected: number; rejected: number; errors: number }> {
  const groups = splitIntoGroups(storyIds, config.selection.maxGroupSize)
  const semaphore = new Semaphore(config.concurrency.select)

  log.info({ storyCount: storyIds.length, groupCount: groups.length }, 'selecting stories in groups')

  let totalSelected = 0
  let totalRejected = 0
  let errors = 0

  const settled = await Promise.allSettled(
    groups.map((group, i) =>
      semaphore.run(async () => {
        log.info({ group: i + 1, totalGroups: groups.length, storyCount: group.length }, 'processing group')
        const result = await selectStories(group)
        const processed = result.selected.length + result.rejected.length
        onProgress?.({ type: 'completed', count: processed })
        const unprocessed = group.length - processed
        if (unprocessed > 0) {
          onProgress?.({ type: 'failed', count: unprocessed, error: 'Story not included in selection result' })
        }
        return result
      }),
    ),
  )

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      totalSelected += result.value.selected.length
      totalRejected += result.value.rejected.length
    } else {
      errors++
      const msg = result.reason instanceof Error ? result.reason.message : 'Unknown error'
      log.error({ err: result.reason }, 'group selection failed')
      const groupIndex = settled.indexOf(result)
      const failedCount = groups[groupIndex]?.length ?? 0
      onProgress?.({ type: 'failed', count: failedCount, error: msg })
    }
  }

  return { selected: totalSelected, rejected: totalRejected, errors }
}

// --- Bulk wrappers with task progress tracking ---

function taskProgressCallback(taskId: string): ProgressCallback {
  return (event) => {
    if (event.type === 'completed') {
      for (let i = 0; i < event.count; i++) taskRegistry.increment(taskId, 'completed')
    } else {
      for (let i = 0; i < event.count; i++) taskRegistry.increment(taskId, 'failed', event.error)
    }
  }
}

export async function bulkPreAssess(storyIds: string[], taskId: string): Promise<void> {
  try {
    await preAssessStories(storyIds, taskProgressCallback(taskId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    log.error({ err, taskId }, 'bulk pre-assess failed')
    for (const _id of storyIds) {
      taskRegistry.increment(taskId, 'failed', msg)
    }
  } finally {
    taskRegistry.complete(taskId)
  }
}

export async function bulkReclassify(storyIds: string[], taskId: string): Promise<void> {
  try {
    await reclassifyStories(storyIds, taskProgressCallback(taskId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    log.error({ err, taskId }, 'bulk reclassify failed')
    for (const _id of storyIds) {
      taskRegistry.increment(taskId, 'failed', msg)
    }
  } finally {
    taskRegistry.complete(taskId)
  }
}

export async function bulkTagEmotions(storyIds: string[], taskId: string): Promise<void> {
  try {
    await tagEmotionOnly(storyIds, taskProgressCallback(taskId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    log.error({ err, taskId }, 'bulk emotion tagging failed')
    for (const _id of storyIds) {
      taskRegistry.increment(taskId, 'failed', msg)
    }
  } finally {
    taskRegistry.complete(taskId)
  }
}

export async function bulkAssess(storyIds: string[], taskId: string): Promise<void> {
  try {
    await assessStories(storyIds, taskProgressCallback(taskId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    log.error({ err, taskId }, 'bulk assess failed')
    for (const _id of storyIds) {
      taskRegistry.increment(taskId, 'failed', msg)
    }
  } finally {
    taskRegistry.complete(taskId)
  }
}

export async function bulkSelect(storyIds: string[], taskId: string): Promise<void> {
  try {
    await selectStoriesInGroups(storyIds, taskProgressCallback(taskId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    log.error({ err, taskId }, 'bulk select failed')
    for (const _id of storyIds) {
      taskRegistry.increment(taskId, 'failed', msg)
    }
  } finally {
    taskRegistry.complete(taskId)
  }
}
