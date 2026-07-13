# Content Extraction

> **Spec:** [`.specs/crawl-and-extraction.allium`](../.specs/crawl-and-extraction.allium) -- extraction tiers, API throttle rules, adaptive failure tracking, feed crawl lifecycle. This file covers implementation details, resource limits, and operational guides.

The crawler fetches RSS feeds and extracts article content using a 3-tier fallback chain. Each tier is tried in order; the first one that produces enough text wins.

## Extraction Chain

```
1. CSS Selector (feed-specific)
   ↓ fails or too short
2. Mozilla Readability (ML-based)
   ↓ fails
3. Configured API (Diffbot or PipFeed, no fallback)
```

### Tier 1: CSS Selector

If the feed has an `htmlSelector` configured (e.g., `article.post-content`), the extractor queries that selector on the fetched HTML. This is the most reliable method for feeds with consistent layouts.

**When to use**: Set `htmlSelector` on a feed when Readability fails or extracts too much noise (nav, sidebars, etc.).

**Minimum length**: Content must be at least `config.crawl.minContentLength` characters (default 50) to be accepted. If shorter, falls through to Readability. This threshold applies to all three extraction tiers.

### Tier 2: Mozilla Readability

Uses `@mozilla/readability` with `jsdom` to extract the main article content. Works well for standard news articles. This is the primary extraction method for most feeds.

### Tier 3: External API

Only the configured `config.crawl.extractionApi` (default `diffbot`) is called — there is no fallback to the other API. Requires `DIFFBOT_TOKEN` or `PIPFEED_API_KEY` depending on which API is configured. Skipped if the required key isn't set.

All API calls go through a shared `ApiThrottle` that serializes requests and handles 429 rate limiting. On 429: waits a 30-second backoff, then doubles the inter-call delay (up to 30 seconds max). Successful calls gradually halve the delay back toward the base. This means the system slows down instead of stopping — it respects the provider's signal without abandoning the crawl.

### Local Extraction Skip

When consecutive articles in a feed all fail local extraction (tiers 1+2), the crawler skips local extraction for remaining articles (controlled by `config.crawl.localFailThreshold`, default 3). This avoids wasting time on HTTP 403s from sites that block scrapers. The counter increments both when extraction succeeds via API (local failed but API worked) and when extraction fails entirely (local + API both failed). The counter resets when any article succeeds via a local method. With the default concurrency of 3, the first batch always attempts local extraction; the threshold takes effect for subsequent articles.

### Total Failure Bail-Out

When consecutive articles all fail extraction entirely (local + API both return nothing), the crawler stops attempting remaining articles (controlled by `config.crawl.totalFailThreshold`, default 3). This prevents burning API quota on feeds where the source blocks all extraction methods. The counter resets when any article succeeds.

### Broken Feed vs Empty Crawl

The RSS fetch/parse layer (`rssParser.parseFeed`) distinguishes a **broken feed** from a **healthy-but-quiet feed**. On any fetch/parse failure (HTTP 404/403/5xx, invalid XML, timeout after retries) it returns `error` set instead of silently returning zero items. The crawler then records the crawl as a **failure** (`feedFetchFailed: true` → increments `consecutiveFailedCrawls`, sets `lastCrawlError`, red badge in the admin) rather than an **empty crawl** (`consecutiveEmptyCrawls`). Only a real `200 + valid XML + 0 items` counts as empty. Before this (fixed 2026-07), a 404/403 feed looked identical to a quiet healthy one, so broken feeds accumulated `empty` for months without surfacing. A broken feed auto-advances `lastCrawledAt` after `MAX_CONSECUTIVE_FAILURES` (3) to avoid infinite retry; `lastCrawlError` persists so it stays visible until a successful crawl clears it.

### Extraction Method Tracking

The extraction method that succeeded (`selector`, `readability`, `diffbot`, or `pipfeed`) is persisted to `Story.crawlMethod` when the story is created. This field is used by the feed quality metrics to show a per-feed breakdown of which extraction tiers are working. The admin panel displays the dominant method in the feed table and a full percentage breakdown in the feed edit panel. Stories created before this feature have `crawlMethod = null` and are excluded from the breakdown.

### Mid-Flight Cancellation

The crawler passes a `shouldAbort` callback (tied to the `skipAll` flag) through `extractContent()` → `extractByApi()` → `ApiThrottle.run()`. This allows in-flight extractions to bail out before making expensive API calls — even if they started before `skipAll` was set. The abort is checked at three points: before the API tier in `extractContent()`, before entering the throttle in `extractByApi()`, and after dequeuing/backoff-waiting inside `ApiThrottle.run()`. This prevents wasting 30+ seconds on API backoff waits for articles in a feed that has already been identified as failing.

## Resource Limits

HTTP responses from page fetches, RSS feeds, and external API calls (Diffbot, PipFeed) are capped at 5 MB (`maxContentLength`) to prevent OOM on pathological responses. JSDOM DOM objects are explicitly released via `dom.window.close()` in a `finally` block after Readability extraction, as JSDOM windows hold timers, event listeners, and expanded DOM trees that are not reliably garbage collected without explicit cleanup. Outbound webhook and email service (Plunk) responses are capped at 1 MB. The Bluesky og:image fetch uses `AbortSignal.timeout(10_000)` to prevent hanging. Favicon fetches use streaming reads with per-chunk size checks to avoid allocating large buffers for unexpected responses.

## Crawl Flow

```
RSS Feed → Parse items (max config.crawl.rssItemLimit, default 20)
         → Deduplicate against existing story URLs
         → For each new item (parallel, up to config.concurrency.crawlArticles):
            → Fetch page HTML (with retry, timeout config.crawl.httpTimeoutMs)
            → Extract content (3-tier chain)
            → Create story with status 'fetched'
         → Update feed's lastCrawledAt
```

Feeds are crawled in parallel (up to `config.concurrency.crawlFeeds`, default 5). Article extraction within each feed also runs in parallel (up to `config.concurrency.crawlArticles`, default 3). All HTTP requests (RSS parsing, page fetching, PipFeed API) use `withRetry()` from `server/src/lib/retry.ts` (3 attempts with exponential backoff).

### Deduplication

URLs are normalized (HTTPS, no trailing slash, no tracking params, sorted query) before any dedup logic. The crawler first removes duplicates within the RSS batch itself, then batch-checks remaining URLs against existing stories using `getExistingUrls()`. As a safety net, P2002 unique constraint errors during `createStory` (e.g., from concurrent crawls) are treated as skips rather than errors.

### Manual Crawling

- `POST /api/admin/stories/crawl-url` — crawl a single URL into a specific feed
- `POST /api/admin/feeds/:id/crawl` — trigger full RSS crawl for one feed
- `POST /api/admin/feeds/crawl-all` — crawl all feeds that are due

## Key Files

| File | Role |
|------|------|
| `server/src/services/crawler.ts` | Orchestration: RSS → deduplicate → extract → create stories |
| `server/src/services/extractor.ts` | 3-tier extraction chain |
| `server/src/services/rssParser.ts` | RSS/Atom feed parsing (max `config.crawl.rssItemLimit` items) |
| `server/src/lib/retry.ts` | Retry utility with exponential backoff (used by RSS parser, extractor) |
| `server/src/jobs/crawlFeeds.ts` | Scheduled job handler |

## Adding a New Feed

1. Create the feed via `POST /api/admin/feeds` with the RSS URL and issue ID
2. Test the crawl: `POST /api/admin/feeds/:id/crawl`
3. Check extracted content quality in the stories
4. If content is noisy or incomplete, set `htmlSelector` on the feed via `PUT /api/admin/feeds/:id`
