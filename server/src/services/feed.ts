import prisma from '../lib/prisma.js'
import type { Feed, FeedRegion, Prisma } from '@prisma/client'
import { config } from '../config.js'

interface FeedFilters {
  issueId?: string
  active?: boolean
}

export async function getFeeds(filters?: FeedFilters) {
  const where: Prisma.FeedWhereInput = {}
  if (filters?.issueId) where.issueId = filters.issueId
  if (filters?.active !== undefined) where.active = filters.active
  return prisma.feed.findMany({
    where,
    include: { issue: true },
    orderBy: { title: 'asc' },
  })
}

export async function getFeedById(id: string) {
  return prisma.feed.findUnique({
    where: { id },
    include: { issue: true },
  })
}

export async function createFeed(data: {
  title: string
  rssUrl: string
  url?: string
  displayTitle?: string
  language?: string
  region?: FeedRegion | null
  issueId: string
  crawlIntervalHours?: number
  htmlSelector?: string
}): Promise<Feed> {
  // Verify issue exists
  const issue = await prisma.issue.findUnique({ where: { id: data.issueId } })
  if (!issue) {
    throw new Error('Issue not found')
  }
  return prisma.feed.create({ data })
}

export async function updateFeed(id: string, data: Partial<{
  title: string
  rssUrl: string
  url: string | null
  displayTitle: string | null
  language: string
  region: FeedRegion | null
  issueId: string
  crawlIntervalHours: number
  htmlSelector: string | null
  active: boolean
}>): Promise<Feed> {
  if (data.issueId) {
    const issue = await prisma.issue.findUnique({ where: { id: data.issueId } })
    if (!issue) {
      throw new Error('Issue not found')
    }
  }
  return prisma.feed.update({ where: { id }, data })
}

export async function getDueFeeds() {
  // Use raw SQL to filter by each feed's own crawl_interval_hours, avoiding
  // the old coarse 1-hour filter that fetched too many rows
  const dueIds = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM feeds
    WHERE active = true
    AND (last_crawled_at IS NULL
      OR last_crawled_at + (crawl_interval_hours || ' hours')::interval < NOW())
  `
  if (dueIds.length === 0) return []
  return prisma.feed.findMany({
    where: { id: { in: dueIds.map(f => f.id) } },
    include: { issue: true },
  })
}

const MAX_CONSECUTIVE_FAILURES = 3

export interface CrawlOutcome {
  hadSuccess: boolean
  errorMessage?: string
  newItemCount: number
  rssItemCount: number
  crawlResult?: string
  notModified?: boolean
  /** The RSS fetch/parse itself failed (404/403/invalid XML/timeout) — a broken
   *  feed, not a healthy feed with zero items. Counts as a crawl failure and does
   *  NOT increment the empty-crawl counter. */
  feedFetchFailed?: boolean
}

export async function updateCrawlStatus(id: string, outcome: CrawlOutcome): Promise<void> {
  const now = new Date()
  const { hadSuccess, errorMessage, newItemCount, rssItemCount } = outcome

  // Determine whether to advance lastCrawledAt:
  // - Yes if at least one article succeeded
  // - Yes if no new items existed (normal "nothing new" scenario)
  // - Yes if consecutive failures exceeded max (prevent infinite retry)
  // - No if all new articles failed extraction
  // A broken feed (RSS fetch/parse failed) or a crawl where all new articles
  // failed extraction both count as crawl failures.
  const isFeedFetchFailure = outcome.feedFetchFailed === true
  const isTotalFailure = isFeedFetchFailure || (!hadSuccess && newItemCount > 0)

  const data: Record<string, unknown> = {
    lastCrawlResult: outcome.crawlResult || null,
  }

  // Only update error fields if there's a new error or a genuine success.
  // When !hadSuccess && !errorMessage (e.g., all items skipped after a previous error),
  // leave lastCrawlError/lastCrawlErrorAt unchanged so the error persists.
  if (errorMessage) {
    data.lastCrawlError = errorMessage
    data.lastCrawlErrorAt = now
  } else if (hadSuccess) {
    data.lastCrawlError = null
    data.lastCrawlErrorAt = null
  }

  if (isTotalFailure) {
    const feed = await prisma.feed.findUnique({ where: { id }, select: { consecutiveFailedCrawls: true } })
    const consecutiveFailures = (feed?.consecutiveFailedCrawls ?? 0) + 1

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      // Force advance after N consecutive total failures
      data.lastCrawledAt = now
      data.consecutiveFailedCrawls = 0
    } else {
      data.consecutiveFailedCrawls = consecutiveFailures
    }
  } else {
    data.lastCrawledAt = now
    data.consecutiveFailedCrawls = 0
  }

  // Health metrics: track empty crawls (RSS returned zero items).
  // 304 Not Modified is not an empty crawl — it means the feed is using caching correctly.
  // A broken feed (feedFetchFailed) is a failure, not an empty crawl, so it must NOT
  // increment the empty counter — otherwise a 404/403 feed looks like a quiet-but-healthy one.
  if (isFeedFetchFailure) {
    // tracked as a failure above; leave the empty counter untouched
  } else if (rssItemCount === 0 && !outcome.notModified) {
    data.consecutiveEmptyCrawls = { increment: 1 }
  } else if (hadSuccess) {
    data.consecutiveEmptyCrawls = 0
    data.lastSuccessfulCrawlAt = now
  }

  await prisma.feed.update({ where: { id }, data })
}

export async function updateFeedCacheHeaders(id: string, headers: { etag?: string | null; lastModified?: string | null }): Promise<void> {
  await prisma.feed.update({
    where: { id },
    data: {
      lastEtag: headers.etag || null,
      lastModified: headers.lastModified || null,
    },
  })
}

export async function deleteFeed(id: string): Promise<{ action: 'deleted' | 'deactivated' }> {
  const storyCount = await prisma.story.count({ where: { feedId: id } })
  if (storyCount > 0) {
    await prisma.feed.update({ where: { id }, data: { active: false } })
    return { action: 'deactivated' }
  }
  await prisma.feed.delete({ where: { id } })
  return { action: 'deleted' }
}

// ──── Feed Quality Metrics ─────────────────────────────────────────────────

export interface FeedQualityMetrics {
  totalCrawled: number
  publishedCount: number
  publishRate: number
  avgRelevance: number | null
  extractionMethods: Record<string, number>
}

interface RawQualityRow {
  feed_id: string
  total_crawled: bigint
  published_count: bigint
  avg_relevance: number | null
}

let qualityCache: { data: Map<string, FeedQualityMetrics>; expiry: number } | null = null

export async function getAllFeedQualityMetrics(): Promise<Map<string, FeedQualityMetrics>> {
  if (qualityCache && Date.now() < qualityCache.expiry) {
    return qualityCache.data
  }

  const rows = await prisma.$queryRaw<RawQualityRow[]>`
    SELECT
      f.id AS feed_id,
      COUNT(s.id) AS total_crawled,
      COUNT(s.id) FILTER (WHERE s.status = 'published') AS published_count,
      AVG(s.relevance) FILTER (WHERE s.relevance IS NOT NULL AND s.status IN ('analyzed', 'selected', 'published')) AS avg_relevance
    FROM feeds f
    LEFT JOIN stories s ON s.feed_id = f.id
    GROUP BY f.id
  `

  // Extraction method breakdown per feed
  const methodRows = await prisma.$queryRaw<{ feed_id: string; crawl_method: string; method_count: bigint }[]>`
    SELECT feed_id, crawl_method, COUNT(*) AS method_count
    FROM stories
    WHERE crawl_method IS NOT NULL
    GROUP BY feed_id, crawl_method
  `

  const methodsByFeed = new Map<string, Record<string, number>>()
  for (const row of methodRows) {
    let methods = methodsByFeed.get(row.feed_id)
    if (!methods) {
      methods = {}
      methodsByFeed.set(row.feed_id, methods)
    }
    methods[row.crawl_method] = Number(row.method_count)
  }

  const result = new Map<string, FeedQualityMetrics>()
  for (const row of rows) {
    const totalCrawled = Number(row.total_crawled)
    const publishedCount = Number(row.published_count)
    const avgRelevance = row.avg_relevance ? Math.round(row.avg_relevance * 10) / 10 : null
    const publishRate = totalCrawled > 0 ? Math.round((publishedCount / totalCrawled) * 1000) / 1000 : 0

    result.set(row.feed_id, {
      totalCrawled, publishedCount, publishRate, avgRelevance,
      extractionMethods: methodsByFeed.get(row.feed_id) || {},
    })
  }

  qualityCache = {
    data: result,
    expiry: Date.now() + config.feedQuality.cacheMinutes * 60 * 1000,
  }

  return result
}
