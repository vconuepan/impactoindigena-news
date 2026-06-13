import prisma from '../lib/prisma.js'
import { type Story, Prisma, StoryStatus, EmotionTag } from '@prisma/client'
import { HumanMessage } from '@langchain/core/messages'
import { paginate } from '../lib/paginate.js'
import { slugify } from '../utils/slugify.js'
import { normalizeUrl } from '../utils/urlNormalization.js'
import { generateEmbeddingForContent, generateSearchEmbedding, ensureEmbedding, ensureEmbeddings } from './embedding.js'
import { searchByEmbedding, fetchStoryForEmbedding, saveEmbeddingTx } from '../lib/vectors.js'
import { createLogger } from '../lib/logger.js'
import { config } from '../config.js'
import { getLLMByTier, rateLimitDelay } from './llm.js'
import { buildRelatedStoriesPrompt } from '../prompts/related-stories.js'
import { relatedStoriesResultSchema } from '../schemas/llm.js'

const log = createLogger('story')

interface StoryFilters {
  status?: string
  issueId?: string
  feedId?: string
  crawledAfter?: string
  crawledBefore?: string
  ratingMin?: number
  ratingMax?: number
  rating?: string
  emotionTag?: string
  publishYear?: number
  search?: string
  sort?: string
  page?: number
  pageSize?: number
}

const SORT_MAP: Record<string, Prisma.StoryOrderByWithRelationInput> = {
  rating_asc: { relevance: 'asc' },
  rating_desc: { relevance: 'desc' },
  date_asc: { dateCrawled: 'asc' },
  date_desc: { dateCrawled: 'desc' },
  title_asc: { title: 'asc' },
  title_desc: { title: 'desc' },
}

export async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title)
  let candidate = base
  let suffix = 2

  while (true) {
    const existing = await prisma.story.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    })
    if (!existing) return candidate
    candidate = `${base}-${suffix}`
    suffix++
  }
}

function buildWhereClause(filters: StoryFilters): Prisma.StoryWhereInput {
  const where: Prisma.StoryWhereInput = {}
  const conditions: Prisma.StoryWhereInput[] = []

  if (filters.status === 'all') {
    // No status filter — show everything including trashed
  } else if (filters.status) {
    where.status = filters.status as StoryStatus
  } else {
    where.status = { not: StoryStatus.trashed }
  }
  if (filters.feedId) {
    where.feedId = filters.feedId
  }
  if (filters.issueId) {
    conditions.push({
      OR: [
        { issueId: filters.issueId },
        { issue: { parentId: filters.issueId } },
        {
          issueId: null,
          feed: { issue: { OR: [{ id: filters.issueId }, { parentId: filters.issueId }] } },
        },
      ],
    })
  }
  if (filters.crawledAfter || filters.crawledBefore) {
    where.dateCrawled = {}
    if (filters.crawledAfter) where.dateCrawled.gte = new Date(filters.crawledAfter)
    if (filters.crawledBefore) where.dateCrawled.lte = new Date(filters.crawledBefore)
  }
  if (filters.ratingMin !== undefined || filters.ratingMax !== undefined) {
    where.relevance = {}
    if (filters.ratingMin !== undefined) where.relevance.gte = filters.ratingMin
    if (filters.ratingMax !== undefined) where.relevance.lte = filters.ratingMax
  }
  if (filters.rating) {
    const match = filters.rating.match(/^(gte|lte)(\d+)$/)
    if (match) {
      const op = match[1] as 'gte' | 'lte'
      const val = parseInt(match[2], 10)
      const condition = { [op]: val }
      conditions.push({
        OR: [
          { relevance: condition },
          { relevance: null, relevancePre: condition },
        ],
      })
    }
  }
  if (filters.emotionTag) {
    where.emotionTag = filters.emotionTag as EmotionTag
  }
  if (filters.publishYear) {
    where.sourceDatePublished = {
      gte: new Date(`${filters.publishYear}-01-01`),
      lt: new Date(`${filters.publishYear + 1}-01-01`),
    }
  }
  if (filters.search) {
    conditions.push({
      OR: [
        { title: { contains: filters.search, mode: 'insensitive' as const } },
        { sourceTitle: { contains: filters.search, mode: 'insensitive' as const } },
        { summary: { contains: filters.search, mode: 'insensitive' as const } },
      ],
    })
  }

  if (conditions.length > 0) {
    where.AND = conditions
  }

  return where
}

const ADMIN_LIST_SELECT = {
  id: true,
  sourceUrl: true,
  sourceTitle: true,
  sourceDatePublished: true,
  feedId: true,
  status: true,
  dateCrawled: true,
  datePublished: true,
  relevancePre: true,
  relevance: true,
  emotionTag: true,
  slug: true,
  title: true,
  titleLabel: true,
  summary: true,
  quote: true,
  quoteAttribution: true,
  marketingBlurb: true,
  relevanceReasons: true,
  antifactors: true,
  relevanceCalculation: true,
  imageUrl: true,
  titleEn: true,
  titleLabelEn: true,
  summaryEn: true,
  quoteEn: true,
  marketingBlurbEn: true,
  relevanceSummaryEn: true,
  issueId: true,
  issue: { select: { id: true, name: true, slug: true } },
  crawlMethod: true,
  clusterId: true,
  cluster: { select: { primaryStoryId: true } },
  createdAt: true,
  updatedAt: true,
  feed: { select: { id: true, title: true, issue: { select: { id: true, name: true, slug: true } } } },
  _count: { select: { blueskyPosts: true, mastodonPosts: true, instagramPosts: true, linkedinPosts: true } },
} as const

export async function getStories(filters: StoryFilters) {
  const page = filters.page || 1
  const pageSize = filters.pageSize || 25
  const where = buildWhereClause(filters)
  const orderBy = filters.sort ? SORT_MAP[filters.sort] : { dateCrawled: 'desc' as const }

  return paginate({
    findMany: () =>
      prisma.story.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ADMIN_LIST_SELECT,
      }),
    count: () => prisma.story.count({ where }),
    page,
    pageSize,
  })
}

export async function getStoriesByIds(ids: string[]) {
  if (ids.length === 0) return []
  return prisma.story.findMany({
    where: { id: { in: ids } },
    select: {
      ...ADMIN_LIST_SELECT,
      issue: {
        select: {
          id: true,
          name: true,
          slug: true,
          parentId: true,
          parent: { select: { id: true, name: true, slug: true } },
        },
      },
      feed: {
        select: {
          id: true,
          title: true,
          issue: {
            select: {
              id: true,
              name: true,
              slug: true,
              parentId: true,
              parent: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
  })
}

export async function getStoryById(id: string) {
  return prisma.story.findUnique({
    where: { id },
    include: {
      issue: true,
      feed: { include: { issue: true } },
      cluster: {
        include: {
          _count: { select: { stories: true } },
          stories: {
            select: { id: true, title: true, sourceTitle: true, status: true },
            orderBy: { dateCrawled: 'asc' },
          },
        },
      },
      _count: { select: { blueskyPosts: true, mastodonPosts: true, instagramPosts: true, linkedinPosts: true } },
      blueskyPosts: {
        where: { status: 'published' },
        select: { postUri: true },
        take: 1,
        orderBy: { publishedAt: 'desc' },
      },
      mastodonPosts: {
        where: { status: 'published' },
        select: { statusUrl: true },
        take: 1,
        orderBy: { publishedAt: 'desc' },
      },
      instagramPosts: {
        select: { permalink: true },
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
      linkedinPosts: {
        select: { postUrl: true },
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

// CAMBIO 1: Agregado imageUrl a la interface y al create
export async function createStory(data: {
  sourceUrl: string
  sourceTitle: string
  sourceContent: string
  feedId: string
  sourceDatePublished?: string
  crawlMethod?: 'selector' | 'readability' | 'diffbot' | 'pipfeed'
  imageUrl?: string | null
}): Promise<Story> {
  const feed = await prisma.feed.findUnique({ where: { id: data.feedId } })
  if (!feed) {
    throw new Error('Feed not found')
  }
  return prisma.story.create({
    data: {
      sourceUrl: data.sourceUrl,
      sourceTitle: data.sourceTitle,
      sourceContent: data.sourceContent,
      feedId: data.feedId,
      sourceDatePublished: data.sourceDatePublished ? new Date(data.sourceDatePublished) : null,
      crawlMethod: data.crawlMethod || null,
      imageUrl: data.imageUrl || null,
    },
  })
}

export async function getExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set()
  const normalized = urls.map(normalizeUrl)
  const existing = await prisma.story.findMany({
    where: { sourceUrl: { in: normalized } },
    select: { sourceUrl: true },
  })
  return new Set(existing.map(s => s.sourceUrl))
}

async function preparePublishData(id: string): Promise<Record<string, any>> {
  const story = await prisma.story.findUnique({
    where: { id },
    select: { datePublished: true, slug: true, title: true, sourceTitle: true },
  })
  if (!story) return {}
  const data: Record<string, any> = {}
  if (!story.datePublished) data.datePublished = new Date()
  if (!story.slug) data.slug = await generateUniqueSlug(story.title || story.sourceTitle, id)
  return data
}

const EMBEDDING_RELEVANT_FIELDS = ['title', 'titleLabel', 'summary'] as const

export async function updateStory(id: string, data: Record<string, any>): Promise<Story> {
  const updateData = { ...data }
  // Convert date strings to Date objects if present
  if (updateData.sourceDatePublished !== undefined) {
    updateData.sourceDatePublished = updateData.sourceDatePublished ? new Date(updateData.sourceDatePublished) : null
  }
  if (updateData.datePublished !== undefined) {
    updateData.datePublished = updateData.datePublished ? new Date(updateData.datePublished) : null
  }
  // Auto-set datePublished and slug when status changes to published
  if (updateData.status === 'published' && updateData.datePublished === undefined) {
    const publishData = await preparePublishData(id)
    if (!updateData.slug && publishData.slug) updateData.slug = publishData.slug
    if (publishData.datePublished) updateData.datePublished = publishData.datePublished
  }

  // Check if this edit requires embedding regeneration
  const hasRelevantChange = EMBEDDING_RELEVANT_FIELDS.some((f) => f in updateData)
  if (hasRelevantChange) {
    // Single DB read to check status and get embedding content
    const currentStory = await fetchStoryForEmbedding(id)
    const isPublished = currentStory?.status === 'published' || updateData.status === 'published'

    if (isPublished) {
      if (!currentStory) throw new Error('Story not found')
      // Generate embedding before saving — roll back on failure

      const merged = {
        ...currentStory,
        ...(updateData.title !== undefined ? { title: updateData.title } : {}),
        ...(updateData.titleLabel !== undefined ? { titleLabel: updateData.titleLabel } : {}),
        ...(updateData.summary !== undefined ? { summary: updateData.summary } : {}),
      }

      const embeddingData = await generateEmbeddingForContent(merged)

      const story = await prisma.$transaction(async (tx) => {
        const s = await tx.story.update({ where: { id }, data: updateData })
        if (embeddingData) {
          await saveEmbeddingTx(tx, id, embeddingData.embedding, embeddingData.hash)
        }
        return s
      })
      relatedCache.clear()
      return story
    }
  }

  const result = await prisma.story.update({ where: { id }, data: updateData })
  relatedCache.clear()
  return result
}

export async function updateStoryStatus(id: string, status: string): Promise<Story> {
  const data: Record<string, any> = { status: status as StoryStatus }
  if (status === 'published') {
    Object.assign(data, await preparePublishData(id))
    await ensureEmbedding(id)
  }
  const result = await prisma.story.update({ where: { id }, data })
  relatedCache.clear()
  return result
}

export async function generateUniqueSlugs(
  stories: { id: string; title: string | null; sourceTitle: string }[],
): Promise<Map<string, string>> {
  if (stories.length === 0) return new Map()

  // Generate base slugs for all stories
  const baseSlugs = stories.map(s => ({
    id: s.id,
    base: slugify(s.title || s.sourceTitle),
  }))

  // Find all existing slugs that could conflict (matching any base pattern)
  const uniqueBases = [...new Set(baseSlugs.map(s => s.base))]
  const existingStories = await prisma.story.findMany({
    where: {
      slug: { not: null },
      id: { notIn: stories.map(s => s.id) },
      OR: uniqueBases.map(base => ({
        slug: { startsWith: base },
      })),
    },
    select: { slug: true },
  })
  const existingSlugs = new Set(existingStories.map(s => s.slug!))

  // Resolve conflicts: track slugs we're assigning in this batch too
  const assignedSlugs = new Set<string>()
  const result = new Map<string, string>()

  for (const { id, base } of baseSlugs) {
    let candidate = base
    let suffix = 2
    while (existingSlugs.has(candidate) || assignedSlugs.has(candidate)) {
      candidate = `${base}-${suffix}`
      suffix++
    }
    assignedSlugs.add(candidate)
    result.set(id, candidate)
  }

  return result
}

export async function bulkUpdateStatus(ids: string[], status: string) {
  if (status === 'published') {
    // Batch-generate slugs for stories that don't have them yet
    const storiesNeedingSlugs = await prisma.story.findMany({
      where: { id: { in: ids }, slug: null },
      select: { id: true, title: true, sourceTitle: true },
    })

    const slugMap = await generateUniqueSlugs(storiesNeedingSlugs)

    // Persist slugs before the transaction — slug writes are idempotent and don't
    // need to be atomic with the status update. Keeping them inside caused
    // transaction timeouts with large batches (25+ individual updates in 5s).
    await Promise.all(
      Array.from(slugMap.entries()).map(([storyId, slug]) =>
        prisma.story.update({ where: { id: storyId }, data: { slug } })
      )
    )

    // Ensure all stories have embeddings (no-op for already-embedded stories)
    await ensureEmbeddings(ids)

    // Fast transaction: only two bulk updates, well within the 5s timeout
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.story.updateMany({
        where: { id: { in: ids }, datePublished: { not: null } },
        data: { status: status as StoryStatus },
      })
      await tx.story.updateMany({
        where: { id: { in: ids }, datePublished: null },
        data: { status: status as StoryStatus, datePublished: now },
      })
    })

    return { count: ids.length }
  }
  return prisma.story.updateMany({
    where: { id: { in: ids } },
    data: { status: status as StoryStatus },
  })
}

export async function deleteStory(id: string): Promise<void> {
  // Check cluster membership before deletion
  const storyCluster = await prisma.story.findUnique({
    where: { id },
    select: { clusterId: true },
  })

  await prisma.story.delete({ where: { id } })

  // Clean up cluster after deletion
  if (storyCluster?.clusterId) {
    const remaining = await prisma.story.count({
      where: { clusterId: storyCluster.clusterId },
    })
    if (remaining <= 1) {
      // Dissolve cluster: remove remaining member, delete cluster
      await prisma.story.updateMany({
        where: { clusterId: storyCluster.clusterId },
        data: { clusterId: null },
      })
      await prisma.storyCluster.delete({
        where: { id: storyCluster.clusterId },
      })
      log.info({ clusterId: storyCluster.clusterId }, 'dissolved cluster after story deletion')
    } else {
      // Re-elect primary (import-safe: inline logic to avoid circular dependency)
      const cluster = await prisma.storyCluster.findUnique({
        where: { id: storyCluster.clusterId },
        select: { primaryStoryId: true },
      })
      if (!cluster?.primaryStoryId) {
        // Primary was the deleted story, need re-election
        const { updatePrimary } = await import('./dedup.js')
        await updatePrimary(storyCluster.clusterId)
      }
    }
  }

  // Clean up dangling storyId references in newsletters and podcasts
  const [newsletters, podcasts] = await Promise.all([
    prisma.newsletter.findMany({ where: { storyIds: { has: id } }, select: { id: true, storyIds: true } }),
    prisma.podcast.findMany({ where: { storyIds: { has: id } }, select: { id: true, storyIds: true } }),
  ])

  const updates: Promise<unknown>[] = []
  for (const nl of newsletters) {
    updates.push(prisma.newsletter.update({
      where: { id: nl.id },
      data: { storyIds: nl.storyIds.filter(sid => sid !== id) },
    }))
  }
  for (const pod of podcasts) {
    updates.push(prisma.podcast.update({
      where: { id: pod.id },
      data: { storyIds: pod.storyIds.filter(sid => sid !== id) },
    }))
  }
  if (updates.length > 0) await Promise.all(updates)
}

export async function dissolveCluster(storyId: string): Promise<void> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { clusterId: true },
  })

  if (!story?.clusterId) {
    throw new Error('Story is not in a cluster')
  }

  const clusterId = story.clusterId

  // Restore auto-rejected members to analyzed
  await prisma.story.updateMany({
    where: {
      clusterId,
      status: 'rejected',
    },
    data: { status: 'analyzed' },
  })

  // Remove all members from cluster
  await prisma.story.updateMany({
    where: { clusterId },
    data: { clusterId: null },
  })

  // Delete the cluster record
  await prisma.storyCluster.delete({ where: { id: clusterId } })

  log.info({ clusterId, triggeredBy: storyId }, 'dissolved cluster via admin action')
}

export async function getStoryStats() {
  const stats = await prisma.story.groupBy({
    by: ['status'],
    _count: { status: true },
  })
  return stats.reduce((acc, row) => {
    acc[row.status] = row._count.status
    return acc
  }, {} as Record<string, number>)
}

// Public endpoints — limited fields, only published stories

// CAMBIO 2: Agregado imageUrl a PUBLIC_STORY_SELECT
const PUBLIC_STORY_SELECT = {
  id: true,
  slug: true,
  sourceUrl: true,
  sourceTitle: true,
  title: true,
  titleLabel: true,
  dateCrawled: true,
  datePublished: true,
  status: true,
  relevancePre: true,
  relevance: true,
  emotionTag: true,
  summary: true,
  quote: true,
  quoteAttribution: true,
  marketingBlurb: true,
  relevanceReasons: true,
  relevanceSummary: true,
  antifactors: true,
  imageUrl: true,
  narrativeFrame: true,
  titleEn: true,
  titleLabelEn: true,
  summaryEn: true,
  quoteEn: true,
  marketingBlurbEn: true,
  relevanceSummaryEn: true,
  issue: {
    select: { name: true, slug: true },
  },
  feed: {
    select: {
      id: true,
      title: true,
      displayTitle: true,
      issue: {
        select: { name: true, slug: true },
      },
    },
  },
} as const

function buildIssueCondition(issueSlug: string): Prisma.StoryWhereInput {
  return {
    OR: [
      {
        issue: {
          OR: [
            { slug: issueSlug },
            { parent: { slug: issueSlug } },
          ],
        },
      },
      {
        issue: null,
        feed: {
          issue: {
            OR: [
              { slug: issueSlug },
              { parent: { slug: issueSlug } },
            ],
          },
        },
      },
    ],
  }
}

const RRF_FETCH_LIMIT = 50
const RRF_K = 60
const RRF_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos
const rrfCache = new Map<string, { rankedIds: string[]; expiry: number }>()

async function hybridSearch(options: {
  query: string
  issueSlug?: string
  page: number
  pageSize: number
}) {
  const { query, issueSlug, page, pageSize } = options

  // Build issue filter SQL fragment for semantic search
  const issueFilter = issueSlug
    ? Prisma.sql`AND (
        EXISTS (SELECT 1 FROM issues i WHERE i.id = s.issue_id AND (i.slug = ${issueSlug} OR i.parent_id IN (SELECT pi.id FROM issues pi WHERE pi.slug = ${issueSlug})))
        OR (s.issue_id IS NULL AND EXISTS (
          SELECT 1 FROM feeds f2 JOIN issues fi ON fi.id = f2.issue_id
          WHERE f2.id = s.feed_id AND (fi.slug = ${issueSlug} OR fi.parent_id IN (SELECT pi.id FROM issues pi WHERE pi.slug = ${issueSlug}))
        ))
      )`
    : Prisma.empty

  // Check RRF cache
  const cacheKey = `${query}::${issueSlug ?? ''}`
  const cached = rrfCache.get(cacheKey)
  const rankedIds = cached && cached.expiry > Date.now()
    ? cached.rankedIds
    : await (async () => {
  // Run semantic and text searches in parallel
  const [semanticIds, textIds] = await Promise.all([
    // Semantic search leg
    (async () => {
      try {
        const queryEmbedding = await generateSearchEmbedding(query)
        const rows = await searchByEmbedding(queryEmbedding, {
          limit: RRF_FETCH_LIMIT,
          issueFilter,
        })
        return rows.map((r) => r.id)
      } catch (err) {
        log.warn({ err }, 'semantic search failed, falling back to text-only')
        return []
      }
    })(),
    // Text search leg
    (async () => {
      const conditions: Prisma.StoryWhereInput[] = []
      conditions.push({
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } },
        ],
      })
      if (issueSlug) {
        conditions.push(buildIssueCondition(issueSlug))
      }
      const rows = await prisma.story.findMany({
        where: { status: 'published', AND: conditions },
        select: { id: true },
        orderBy: [{ datePublished: 'desc' }, { dateCrawled: 'desc' }],
        take: RRF_FETCH_LIMIT,
      })
      return rows.map((r) => r.id)
    })(),
  ])

  // Compute RRF scores
  const scores = new Map<string, number>()
  semanticIds.forEach((id, i) => {
    scores.set(id, (scores.get(id) || 0) + 1 / (RRF_K + i + 1))
  })
  textIds.forEach((id, i) => {
    scores.set(id, (scores.get(id) || 0) + 1 / (RRF_K + i + 1))
  })

  // Sort by RRF score
  const ids = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)

  rrfCache.set(cacheKey, { rankedIds: ids, expiry: Date.now() + RRF_CACHE_TTL_MS })
  return ids
  })()

  const total = rankedIds.length
  const pageIds = rankedIds.slice((page - 1) * pageSize, page * pageSize)

  if (pageIds.length === 0) {
    return { data: [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  // Fetch full story data in ranked order
  const stories = await prisma.story.findMany({
    where: { id: { in: pageIds } },
    select: PUBLIC_STORY_SELECT,
  })

  // Restore RRF rank order
  const storyMap = new Map(stories.map((s) => [s.id, s]))
  const ordered = pageIds.map((id) => storyMap.get(id)).filter((s): s is NonNullable<typeof s> => s != null)

  return {
    data: ordered,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export async function getPublishedStories(options: {
  page?: number
  pageSize?: number
  issueSlug?: string
  search?: string
  emotionTags?: string[]
}) {
  const page = options.page || 1
  const pageSize = options.pageSize || 25

  // Use hybrid search when search query is provided
  if (options.search) {
    return hybridSearch({
      query: options.search,
      issueSlug: options.issueSlug,
      page,
      pageSize,
    })
  }

  // Non-search: standard paginated query
  const conditions: Prisma.StoryWhereInput[] = []
  if (options.issueSlug) {
    conditions.push(buildIssueCondition(options.issueSlug))
  }
  if (options.emotionTags?.length) {
    conditions.push({ emotionTag: { in: options.emotionTags as EmotionTag[] } })
  }

  const orderBy: Prisma.StoryOrderByWithRelationInput[] = [{ datePublished: 'desc' }, { dateCrawled: 'desc' }]

  const where: Prisma.StoryWhereInput = {
    status: 'published',
    ...(conditions.length > 0 && { AND: conditions }),
  }

  return paginate({
    findMany: () =>
      prisma.story.findMany({
        where,
        select: PUBLIC_STORY_SELECT,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    count: () => prisma.story.count({ where }),
    page,
    pageSize,
  })
}

// In-memory cache for LLM-ranked related story IDs
const relatedCache = new Map<string, { ids: string[]; expiry: number }>()
const MAX_RELATED_CACHE_SIZE = 500
const EVICTION_INTERVAL = 60 * 60 * 1000 // 1 hour
let lastEviction = Date.now()

function evictExpiredCache() {
  const now = Date.now()
  if (now - lastEviction < EVICTION_INTERVAL) return
  lastEviction = now
  for (const [key, value] of relatedCache) {
    if (value.expiry <= now) relatedCache.delete(key)
  }
}

/** Evict the entry with the earliest expiry to make room for a new one. */
function evictOldestEntry() {
  let oldestKey: string | null = null
  let oldestExpiry = Infinity
  for (const [key, value] of relatedCache) {
    if (value.expiry < oldestExpiry) {
      oldestExpiry = value.expiry
      oldestKey = key
    }
  }
  if (oldestKey) relatedCache.delete(oldestKey)
}

export async function getRelatedStories(slug: string, limit: number = config.relatedStories.displayCount) {
  evictExpiredCache()

  // Always work with displayCount for caching consistency, then slice to requested limit
  const displayCount = config.relatedStories.displayCount

  // 1. Check in-memory cache
  const cached = relatedCache.get(slug)
  if (cached && cached.expiry > Date.now()) {
    const ids = cached.ids.slice(0, limit)
    const stories = await prisma.story.findMany({
      where: { id: { in: ids } },
      select: PUBLIC_STORY_SELECT,
    })
    const storyMap = new Map(stories.map((s) => [s.id, s]))
    return ids.map((id) => storyMap.get(id)).filter((s): s is NonNullable<typeof s> => s != null)
  }

  // 2. Find the source story and verify it has an embedding
  const rows = await prisma.$queryRaw<{ id: string; title: string | null; title_label: string | null }[]>`
    SELECT id, title, title_label FROM stories
    WHERE slug = ${slug} AND status = 'published' AND embedding IS NOT NULL
    LIMIT 1
  `
  if (rows.length === 0) return []

  const source = rows[0]
  const candidateCount = displayCount * config.relatedStories.candidateMultiplier

  // 3. Get a larger candidate pool via cosine distance
  const candidates = await prisma.$queryRaw<{ id: string; title: string | null; title_label: string | null }[]>`
    SELECT s.id, s.title, s.title_label
    FROM stories s
    WHERE s.id != ${source.id}
      AND s.status = 'published'
      AND s.embedding IS NOT NULL
    ORDER BY s.embedding <=> (SELECT embedding FROM stories WHERE id = ${source.id})
    LIMIT ${candidateCount}
  `
  if (candidates.length === 0) return []

  // 4. If we have fewer candidates than needed, skip LLM and return all
  let selectedIds: string[]
  if (candidates.length <= displayCount) {
    selectedIds = candidates.map((c) => c.id)
  } else {
    // 5. LLM re-ranking
    try {
      const prompt = buildRelatedStoriesPrompt(
        { titleLabel: source.title_label, title: source.title },
        candidates.map((c) => ({ id: c.id, titleLabel: c.title_label, title: c.title })),
        displayCount,
      )

      await rateLimitDelay()
      const llm = getLLMByTier(config.relatedStories.modelTier)
      const structuredLlm = llm.withStructuredOutput(relatedStoriesResultSchema, { method: 'functionCalling' })
      const response = await structuredLlm.invoke([new HumanMessage(prompt)])

      // Validate returned IDs against candidate pool
      const candidateIdSet = new Set(candidates.map((c) => c.id))
      const validIds = response.selectedIds.filter((id) => candidateIdSet.has(id))

      if (validIds.length > 0) {
        selectedIds = validIds.slice(0, displayCount)
        log.info({ slug, candidateCount: candidates.length, selectedCount: selectedIds.length }, 'LLM re-ranked related stories')
      } else {
        // LLM returned no valid IDs — fall back to cosine order
        log.warn({ slug }, 'LLM returned no valid IDs for related stories, falling back to cosine')
        selectedIds = candidates.slice(0, displayCount).map((c) => c.id)
      }
    } catch (err) {
      // LLM failed — fall back to cosine order
      log.warn({ err, slug }, 'LLM re-ranking failed for related stories, falling back to cosine')
      selectedIds = candidates.slice(0, displayCount).map((c) => c.id)
    }
  }

  // 6. Cache the result (evict oldest if at capacity)
  if (!relatedCache.has(slug) && relatedCache.size >= MAX_RELATED_CACHE_SIZE) {
    evictOldestEntry()
  }
  relatedCache.set(slug, {
    ids: selectedIds,
    expiry: Date.now() + config.relatedStories.cacheHours * 60 * 60 * 1000,
  })

  // 7. Fetch full story data in LLM-selected order, sliced to requested limit
  const returnIds = selectedIds.slice(0, limit)
  const stories = await prisma.story.findMany({
    where: { id: { in: returnIds } },
    select: PUBLIC_STORY_SELECT,
  })
  const storyMap = new Map(stories.map((s) => [s.id, s]))
  return returnIds.map((id) => storyMap.get(id)).filter((s): s is NonNullable<typeof s> => s != null)
}

interface StatusFilterOptions {
  ratingMin?: number
  relevanceMin?: number
  hoursAgo?: number
  issueId?: string | null
  limit?: number
}

function buildStatusWhereClause(
  status: string,
  options: StatusFilterOptions = {},
): Prisma.StoryWhereInput {
  const where: Prisma.StoryWhereInput = { status: status as StoryStatus }
  if (options.ratingMin !== undefined) {
    where.relevancePre = { gte: options.ratingMin }
  }
  if (options.relevanceMin !== undefined) {
    where.relevance = { gte: options.relevanceMin }
  }
  if (options.hoursAgo !== undefined) {
    where.dateCrawled = { gte: new Date(Date.now() - options.hoursAgo * 60 * 60 * 1000) }
  }
  if (options.issueId !== undefined) {
    where.issueId = options.issueId
  }
  return where
}

export async function getStoryIdsByStatus(
  status: string,
  options: StatusFilterOptions = {},
): Promise<string[]> {
  const where = buildStatusWhereClause(status, options)
  const stories = await prisma.story.findMany({
    where,
    select: { id: true },
    orderBy: { dateCrawled: 'desc' },
    ...(options.limit ? { take: options.limit } : {}),
  })
  return stories.map(s => s.id)
}

export async function getStoriesByStatus(
  status: string,
  options: StatusFilterOptions = {},
) {
  const where = buildStatusWhereClause(status, options)
  return prisma.story.findMany({
    where,
    include: { feed: { include: { issue: true } } },
    orderBy: { dateCrawled: 'desc' },
    take: options.limit ?? 200,
  })
}

export async function publishStory(id: string): Promise<Story> {
  const publishData = await preparePublishData(id)
  await ensureEmbedding(id)
  return prisma.story.update({
    where: { id },
    data: {
      status: StoryStatus.published,
      ...publishData,
    },
  })
}

export async function rejectStory(id: string): Promise<Story> {
  return prisma.story.update({
    where: { id },
    data: { status: StoryStatus.rejected },
  })
}

export async function getPublishedStoryBySlug(slug: string) {
  return prisma.story.findFirst({
    where: { slug, status: 'published' },
    select: PUBLIC_STORY_SELECT,
  })
}

export async function getClusterRedirectSlug(slug: string): Promise<string | null> {
  const story = await prisma.story.findFirst({
    where: { slug, clusterId: { not: null } },
    select: {
      id: true,
      cluster: {
        select: {
          primaryStoryId: true,
          primaryStory: { select: { slug: true, status: true } },
        },
      },
    },
  })

  if (!story?.cluster?.primaryStory) return null
  if (story.id === story.cluster.primaryStoryId) return null
  if (story.cluster.primaryStory.status !== 'published') return null
  if (!story.cluster.primaryStory.slug) return null

  return story.cluster.primaryStory.slug
}

export async function getClusterMembers(slug: string): Promise<{
  sources: { feedTitle: string; sourceUrl: string }[]
} | null> {
  const story = await prisma.story.findFirst({
    where: { slug, status: 'published' },
    select: { id: true, clusterId: true },
  })

  if (!story?.clusterId) return null

  const clusterStories = await prisma.story.findMany({
    where: {
      clusterId: story.clusterId,
      id: { not: story.id },
      title: { not: null },
      summary: { not: null },
      status: { in: ['analyzed', 'selected', 'published', 'rejected'] },
    },
    select: {
      sourceUrl: true,
      feed: { select: { displayTitle: true, title: true } },
    },
    orderBy: { dateCrawled: 'asc' },
  })

  if (clusterStories.length === 0) return null

  return {
    sources: clusterStories.map(s => ({
      feedTitle: s.feed.displayTitle || s.feed.title,
      sourceUrl: s.sourceUrl,
    })),
  }
}

const NEGATIVE_EMOTIONS: EmotionTag[] = [EmotionTag.frustrating, EmotionTag.scary]

export async function getHomepageData(issueSlugs: string[], storiesPerIssue = 7) {
  const buildIssueCondition = (slug: string) => ({
    OR: [
      { issue: { OR: [{ slug }, { parent: { slug } }] } },
      { issue: null, feed: { issue: { OR: [{ slug }, { parent: { slug } }] } } },
    ],
  })

  // Sort by original article date, not platform ingestion date
  const orderBy: Prisma.StoryOrderByWithRelationInput[] = [{ sourceDatePublished: 'desc' }, { datePublished: 'desc' }]

  // Only surface articles published within the last 18 months
  const eighteenMonthsAgo = new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000)

  const storiesPromises = issueSlugs.map(async (slug) => {
    const baseWhere: Prisma.StoryWhereInput = {
      status: 'published',
      sourceDatePublished: { gte: eighteenMonthsAgo },
      ...buildIssueCondition(slug),
    }

    const [uplifting, calm, negative] = await Promise.all([
      prisma.story.findMany({
        where: { ...baseWhere, emotionTag: EmotionTag.uplifting },
        select: PUBLIC_STORY_SELECT, orderBy, take: storiesPerIssue,
      }),
      prisma.story.findMany({
        where: { ...baseWhere, emotionTag: EmotionTag.calm },
        select: PUBLIC_STORY_SELECT, orderBy, take: storiesPerIssue,
      }),
      prisma.story.findMany({
        where: { ...baseWhere, emotionTag: { in: NEGATIVE_EMOTIONS } },
        select: PUBLIC_STORY_SELECT, orderBy, take: storiesPerIssue,
      }),
    ])

    return { slug, uplifting, calm, negative }
  })

  const issueResults = await Promise.all(storiesPromises)

  const storiesByIssue: Record<string, { uplifting: unknown[]; calm: unknown[]; negative: unknown[] }> = {}
  for (const { slug, uplifting, calm, negative } of issueResults) {
    storiesByIssue[slug] = { uplifting, calm, negative }
  }

  return { storiesByIssue }
}
