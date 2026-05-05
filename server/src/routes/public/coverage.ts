import { Router } from 'express'
import { StoryStatus, type FeedRegion } from '@prisma/client'
import prisma from '../../lib/prisma.js'
import { TTLCache, cached } from '../../lib/cache.js'
import { createLogger } from '../../lib/logger.js'

const router = Router()
const log = createLogger('public:coverage')

const COVERAGE_TTL = 60 * 60 * 1000 // 1 hour
const coverageCache = new TTLCache<unknown>(COVERAGE_TTL)
const comparisonCache = new TTLCache<unknown>(COVERAGE_TTL)

const PERIOD_DAYS = 30

const REGION_LABELS: Record<FeedRegion, string> = {
  north_america: 'América del Norte',
  western_europe: 'Europa Occidental',
  eastern_europe: 'Europa del Este',
  middle_east_north_africa: 'Medio Oriente y Norte de África',
  sub_saharan_africa: 'África Subsahariana',
  south_southeast_asia: 'Asia del Sur y Sudeste',
  pacific: 'Pacífico',
  latin_america: 'Latinoamérica',
  global: 'Global',
}

interface RegionStat {
  region: FeedRegion
  label: string
  feedCount: number
  storyCount: number
  avgRelevance: number | null
}

interface CoverageResponse {
  periodDays: number
  since: string
  byRegion: RegionStat[]
  totalStories: number
  totalFeeds: number
}

interface CategoryStat {
  feedCount: number
  storyCount: number
  avgRelevance: number | null
}

interface ComparisonResponse {
  periodDays: number
  since: string
  indigenous: CategoryStat
  mainstream: CategoryStat
}

async function fetchCoverage(): Promise<CoverageResponse> {
  const since = new Date()
  since.setDate(since.getDate() - PERIOD_DAYS)

  // Get published stories in the period with feed region info
  const stories = await prisma.story.findMany({
    where: {
      status: StoryStatus.published,
      datePublished: { gte: since },
      relevance: { not: null },
    },
    select: {
      relevance: true,
      feed: {
        select: { region: true },
      },
    },
  })

  // Aggregate by region
  const regionMap = new Map<
    FeedRegion,
    { storyCount: number; relevanceSum: number; feedIds: Set<string> }
  >()

  // Count active feeds per region (independently of story period)
  const activeFeeds = await prisma.feed.findMany({
    where: { active: true },
    select: { id: true, region: true },
  })

  for (const feed of activeFeeds) {
    if (!feed.region) continue
    if (!regionMap.has(feed.region)) {
      regionMap.set(feed.region, { storyCount: 0, relevanceSum: 0, feedIds: new Set() })
    }
    regionMap.get(feed.region)!.feedIds.add(feed.id)
  }

  for (const story of stories) {
    const region = story.feed?.region
    if (!region) continue
    if (!regionMap.has(region)) {
      regionMap.set(region, { storyCount: 0, relevanceSum: 0, feedIds: new Set() })
    }
    const entry = regionMap.get(region)!
    entry.storyCount++
    if (story.relevance != null) entry.relevanceSum += story.relevance
  }

  const byRegion: RegionStat[] = Array.from(regionMap.entries())
    .map(([region, data]) => ({
      region,
      label: REGION_LABELS[region] ?? region,
      feedCount: data.feedIds.size,
      storyCount: data.storyCount,
      avgRelevance:
        data.storyCount > 0
          ? Math.round((data.relevanceSum / data.storyCount) * 10) / 10
          : null,
    }))
    // Sort by story count descending, regions with no stories at the bottom
    .sort((a, b) => b.storyCount - a.storyCount)

  return {
    periodDays: PERIOD_DAYS,
    since: since.toISOString(),
    byRegion,
    totalStories: stories.length,
    totalFeeds: activeFeeds.length,
  }
}

async function fetchComparison(): Promise<ComparisonResponse> {
  const since = new Date()
  since.setDate(since.getDate() - PERIOD_DAYS)

  // Get all active feeds split by category
  const allFeeds = await prisma.feed.findMany({
    where: { active: true },
    select: { id: true, feedCategory: true },
  })

  const indigenousFeedIds = allFeeds
    .filter(f => f.feedCategory === 'INDIGENOUS')
    .map(f => f.id)
  const mainstreamFeedIds = allFeeds
    .filter(f => f.feedCategory === 'MAINSTREAM')
    .map(f => f.id)

  // Get published stories per category in the period
  const stories = await prisma.story.findMany({
    where: {
      status: StoryStatus.published,
      datePublished: { gte: since },
      relevance: { not: null },
      feedId: { in: [...indigenousFeedIds, ...mainstreamFeedIds] },
    },
    select: { relevance: true, feedId: true },
  })

  function aggregate(feedIds: string[]): CategoryStat {
    const feedIdSet = new Set(feedIds)
    const relevant = stories.filter(s => s.feedId && feedIdSet.has(s.feedId))
    const storyCount = relevant.length
    const avgRelevance =
      storyCount > 0
        ? Math.round((relevant.reduce((sum, s) => sum + (s.relevance ?? 0), 0) / storyCount) * 10) /
          10
        : null
    return { feedCount: feedIds.length, storyCount, avgRelevance }
  }

  return {
    periodDays: PERIOD_DAYS,
    since: since.toISOString(),
    indigenous: aggregate(indigenousFeedIds),
    mainstream: aggregate(mainstreamFeedIds),
  }
}

/**
 * GET /api/public/coverage/comparison
 *
 * Returns aggregated relevance stats split by feed category (INDIGENOUS vs MAINSTREAM).
 * Powers the Compare page section showing that indigenous-focused media covers
 * indigenous topics more relevantly than mainstream international outlets.
 */
router.get('/comparison', async (_req, res) => {
  try {
    const data = await cached(comparisonCache, 'public-comparison', fetchComparison)
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(data)
  } catch (err) {
    log.error({ err }, 'failed to fetch comparison stats')
    res.status(500).json({ error: 'Failed to fetch comparison stats' })
  }
})

/**
 * GET /api/public/coverage
 *
 * Returns aggregated coverage stats for published stories over the last 30 days,
 * grouped by geographic region. Used by the Compare page to show that
 * Latin American indigenous media has higher average relevance scores than
 * mainstream international outlets covering the same topics.
 */
router.get('/', async (_req, res) => {
  try {
    const data = await cached(coverageCache, 'public-coverage', fetchCoverage)
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(data)
  } catch (err) {
    log.error({ err }, 'failed to fetch coverage stats')
    res.status(500).json({ error: 'Failed to fetch coverage stats' })
  }
})

export default router
