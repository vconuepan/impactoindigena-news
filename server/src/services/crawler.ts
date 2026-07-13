import { parseFeed } from './rssParser.js'
import { extractContent } from './extractor.js'
import { getExistingUrls, createStory } from './story.js'
import { getFeedById, getDueFeeds, updateCrawlStatus, updateFeedCacheHeaders } from './feed.js'
import { createLogger } from '../lib/logger.js'
import { Semaphore } from '../lib/semaphore.js'
import { config } from '../config.js'
import { normalizeUrl } from '../utils/urlNormalization.js'

const log = createLogger('crawler')

export interface CrawlResult {
  feedId: string
  feedTitle: string
  newStories: number
  skipped: number
  errors: number
  errorMessage?: string
}

export async function crawlFeed(feedId: string): Promise<CrawlResult> {
  const feed = await getFeedById(feedId)
  if (!feed) throw new Error('Feed not found')

  const result: CrawlResult = {
    feedId,
    feedTitle: feed.title,
    newStories: 0,
    skipped: 0,
    errors: 0,
  }

  // Parse RSS feed with conditional headers
  const rssResult = await parseFeed(feed.rssUrl, {
    etag: feed.lastEtag,
    lastModified: feed.lastModified,
  })

  // Persist cache headers if returned
  if (rssResult.cacheHeaders.etag || rssResult.cacheHeaders.lastModified) {
    await updateFeedCacheHeaders(feedId, rssResult.cacheHeaders)
  }

  // 304 Not Modified — nothing to do. hadSuccess=false so existing errors are preserved
  // (no errorMessage + !hadSuccess leaves lastCrawlError untouched in updateCrawlStatus)
  if (rssResult.notModified) {
    await updateCrawlStatus(feedId, { hadSuccess: false, newItemCount: 0, rssItemCount: 0, crawlResult: '304 not modified', notModified: true })
    return result
  }

  // RSS fetch/parse failed (404/403/invalid XML/timeout). Mark as a crawl
  // FAILURE — not an empty crawl — so a broken feed surfaces (red badge in
  // admin, fail counter) instead of silently accumulating "empty" like a
  // healthy but quiet feed.
  if (rssResult.error) {
    await updateCrawlStatus(feedId, {
      hadSuccess: false,
      feedFetchFailed: true,
      errorMessage: rssResult.error,
      newItemCount: 0,
      rssItemCount: 0,
      crawlResult: `Feed error: ${rssResult.error}`.slice(0, 200),
    })
    result.errors = 1
    result.errorMessage = rssResult.error
    return result
  }

  const rssItems = rssResult.items
  if (rssItems.length === 0) {
    await updateCrawlStatus(feedId, { hadSuccess: true, newItemCount: 0, rssItemCount: 0, crawlResult: 'No items in feed' })
    return result
  }

  // Normalize URLs and deduplicate within the RSS batch
  for (const item of rssItems) {
    item.url = normalizeUrl(item.url)
  }
  const seenUrls = new Set<string>()
  const uniqueItems = rssItems.filter(item => {
    if (seenUrls.has(item.url)) return false
    seenUrls.add(item.url)
    return true
  })

  // Deduplicate against existing stories
  const rssUrls = uniqueItems.map(item => item.url)
  const existingUrls = await getExistingUrls(rssUrls)
  const newItems = uniqueItems.filter(item => !existingUrls.has(item.url))
  result.skipped = rssItems.length - newItems.length  // includes RSS duplicates + DB matches

  // Extract content and create stories (parallel with concurrency limit).
  // The fail counters below are shared across concurrent tasks. This is safe because
  // Node.js is single-threaded: mutations happen synchronously between await points,
  // so concurrent tasks never interleave mid-increment. The first concurrent batch
  // (size = crawlArticles) all read the initial values; thresholds take effect for
  // subsequent batches after the first batch completes.
  const articleSemaphore = new Semaphore(config.concurrency.crawlArticles)
  const totalArticles = newItems.length
  let localFailCount = 0
  let totalFailCount = 0
  let skipLocal = false
  let skipAll = false
  let skippedDueToFailures = 0
  await Promise.allSettled(
    newItems.map(item => articleSemaphore.run(async () => {
      if (skipAll) {
        skippedDueToFailures++
        result.errors++
        return
      }
      try {
        const extracted = await extractContent(item.url, {
          htmlSelector: feed.htmlSelector,
          skipLocalExtraction: skipLocal,
          shouldAbort: () => skipAll,
        })

        if (!extracted) {
          totalFailCount++
          // Local extraction was attempted and failed — count toward skip-local threshold
          if (!skipLocal) localFailCount++
          if (localFailCount >= config.crawl.localFailThreshold) skipLocal = true
          if (totalFailCount >= config.crawl.totalFailThreshold) {
            skipAll = true
            log.warn({ feed: feed.title, totalFailCount, totalArticles }, 'all extraction methods failing, skipping remaining articles')
          }
          log.warn({ url: item.url }, 'no content extracted')
          result.errors++
          return
        }

        totalFailCount = 0
        if (extracted.method === 'selector' || extracted.method === 'readability') {
          localFailCount = 0
        } else {
          localFailCount++
        }
        if (localFailCount >= config.crawl.localFailThreshold) skipLocal = true

        // Reject articles with a publication date older than the configured max age.
        // Google News frequently resurfaces articles from months or years ago.
        const pubDateStr = item.datePublished || extracted.datePublished
        if (pubDateStr && config.crawl.maxArticleAgeDays > 0) {
          const pubDate = new Date(pubDateStr)
          const ageDays = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24)
          if (!isNaN(pubDate.getTime()) && ageDays > config.crawl.maxArticleAgeDays) {
            log.info({ url: item.url, pubDate: pubDateStr, ageDays: Math.round(ageDays) }, 'skipping old article')
            result.skipped++
            return
          }
        }

        await createStory({
        sourceUrl: item.url,
        sourceTitle: extracted.title || item.title,
        sourceContent: extracted.content,
        feedId,
        sourceDatePublished: pubDateStr || undefined,
        crawlMethod: extracted.method,
        imageUrl: item.imageUrl || null,
        })

        result.newStories++
      } catch (err: any) {
        // Unique constraint violation = URL was inserted by a concurrent crawl; treat as skip
        if (err?.code === 'P2002') {
          log.info({ url: item.url }, 'story already exists (concurrent insert), skipping')
          result.skipped++
          return
        }
        log.error({ url: item.url, err }, 'failed to process item')
        result.errors++
      }
    }))
  )

  if (result.errors > 0) {
    result.errorMessage = `${result.errors} of ${totalArticles} articles failed extraction`
  }

  const crawlResult = result.newStories > 0
    ? `${result.newStories} new article${result.newStories > 1 ? 's' : ''}`
    : result.errors > 0
      ? result.errorMessage!
      : 'No new articles'

  await updateCrawlStatus(feedId, {
    hadSuccess: result.newStories > 0,
    errorMessage: result.errorMessage,
    newItemCount: totalArticles,
    rssItemCount: rssItems.length,
    crawlResult,
  })
  return result
}

export async function crawlAllDueFeeds(): Promise<CrawlResult[]> {
  const dueFeeds = await getDueFeeds()
  log.info({ feedCount: dueFeeds.length }, 'feeds due for crawling')

  const feedSemaphore = new Semaphore(config.concurrency.crawlFeeds)
  const total = dueFeeds.length
  let completed = 0

  const settled = await Promise.allSettled(
    dueFeeds.map(feed => feedSemaphore.run(async () => {
      try {
        const result = await crawlFeed(feed.id)
        completed++
        log.info({ progress: `${completed}/${total}`, feed: result.feedTitle, new: result.newStories, skipped: result.skipped, errors: result.errors }, 'feed crawl complete')
        return result
      } catch (err) {
        completed++
        const errorMessage = `RSS fetch failed: ${err instanceof Error ? err.message : String(err)}`
        log.error({ feed: feed.title, err }, 'failed to crawl feed')
        await updateCrawlStatus(feed.id, { hadSuccess: false, errorMessage, newItemCount: 1, rssItemCount: 0 }).catch(() => {})
        return {
          feedId: feed.id,
          feedTitle: feed.title,
          newStories: 0,
          skipped: 0,
          errors: 1,
          errorMessage,
        }
      }
    }))
  )

  return settled.map(s => s.status === 'fulfilled' ? s.value : {
    feedId: '',
    feedTitle: 'unknown',
    newStories: 0,
    skipped: 0,
    errors: 1,
    errorMessage: 'Feed crawl failed unexpectedly',
  })
}

export async function crawlUrl(url: string, feedId: string): Promise<{ storyId: string } | null> {
  const feed = await getFeedById(feedId)
  if (!feed) throw new Error('Feed not found')

  url = normalizeUrl(url)

  // Check not already crawled
  const existing = await getExistingUrls([url])
  if (existing.has(url)) {
    throw new Error('URL already crawled')
  }

  const extracted = await extractContent(url, {
    htmlSelector: feed.htmlSelector,
  })

  if (!extracted) return null

  const story = await createStory({
    sourceUrl: url,
    sourceTitle: extracted.title || 'Untitled',
    sourceContent: extracted.content,
    feedId,
    sourceDatePublished: extracted.datePublished || undefined,
    crawlMethod: extracted.method,
  })

  return { storyId: story.id }
}
