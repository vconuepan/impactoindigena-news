# Bluesky Integration

> **Spec:** [`.specs/social-posting.allium`](../.specs/social-posting.allium) -- channel sum type, story selection, draft generation, publishing, duplicate prevention (shared with Mastodon). This file covers Bluesky-specific implementation details, authentication, API endpoints, and configuration.

## Overview

Automated and manual posting of stories to Bluesky via the AT Protocol API. Stories can be posted manually from the admin stories page (single or bulk with LLM selection) or automatically via a twice-daily cron job. Each post includes LLM-generated text, a link card to the Actually Relevant story page, and an inline link to the original source article.

## Authentication

Uses **app password** authentication (not OAuth). Credentials stored in environment variables:

- `BLUESKY_HANDLE` — Bluesky handle (e.g. `actuallyrelevant.bsky.social`)
- `BLUESKY_APP_PASSWORD` — App-specific password generated in Bluesky settings

The client (`server/src/lib/bluesky.ts`) creates a session on first use, caches it, and re-authenticates on 401. No token refresh logic needed — app passwords generate fresh sessions.

## Post Format

Each Bluesky post consists of:

1. **Editorial text** — LLM-generated hook drawing from the relevanceSummary (not a summary of the article); this is the first thing readers see
2. **Metadata line** — `Issue | Emotion | found on Publisher` where Publisher links to the source article; emotion is capitalized
3. **Link card embed** — rich preview of the Actually Relevant story page (`titleLabel: title`, summary)

Bluesky posts are limited to 300 graphemes. The LLM text max chars are calculated dynamically as `300 - metaLine - 1` (newline). If the LLM overshoots, the text is trimmed with an ellipsis. A grapheme count safety check logs a warning if the assembled post exceeds 300. The text is assembled by `assemblePostText()` in the service layer and stored as the full draft text (editable by admin).

### Link Card Thumbnail

Bluesky does **not** auto-fetch og: metadata from URLs. The link card (title, description, thumbnail) is constructed at publish time in `publishPost()` (`server/src/services/bluesky.ts`). The thumbnail image is fetched from a hardcoded URL, uploaded as a blob to Bluesky, and attached to the embed.

**Current behavior:** All posts use the global `/og-image.png`. When per-story og:images are implemented, `publishPost()` must be updated to use the story-specific og:image URL instead. See also `.context/seo.md`.

## Flows

### Manual: Single Story

1. Admin selects one published story on `/admin/stories`
2. Clicks "Post to Bluesky" in the bulk actions bar
3. `POST /api/admin/bluesky/posts/generate` calls LLM to generate draft text
4. `BlueskyDraftPanel` side panel opens with editable text, grapheme counter, and link preview
5. Admin can edit the text, then clicks "Post to Bluesky" to publish
6. `POST /api/admin/bluesky/posts/:id/publish` sends to Bluesky API

### Manual: Pick Best from Multiple

1. Admin selects multiple published stories
2. Clicks "Pick Best for Bluesky"
3. `POST /api/admin/bluesky/posts/pick-and-draft` uses LLM to pick the best story, then generates draft text
4. Same review panel flow as single story, with additional "Selected from X stories" reasoning display

### Automated: Cron Job

The unified `social_auto_post` job handles auto-posting for all channels (see `.context/mastodon.md` for the shared flow). For Bluesky specifically:

1. Checks `BLUESKY_AUTO_POST_ENABLED` — skips if disabled
2. Generates Bluesky-specific post text for the picked story
3. Publishes with link card embed

### Metrics Polling

The `bluesky_update_metrics` job runs daily (default `0 3 * * *`, disabled by default):

1. Fetches all published BlueskyPosts from the last N days (`BLUESKY_METRICS_MAX_AGE_DAYS`, default 30)
2. Polls the Bluesky API for engagement counts (likes, reposts, replies, quotes)
3. Updates the database

Manual refresh is also available via the admin Bluesky page.

### Admin Feed View

The admin Bluesky page (`/admin/bluesky`) shows a merged view of the account's live Bluesky feed plus DB-tracked posts:

1. Fetches the account's author feed from the Bluesky API (cursor-based pagination)
2. Cross-references each post URI against `bluesky_posts` to identify tracked posts
3. Shows drafts/failed posts from DB at the top (first page only)
4. Filters: All, Tracked, Untracked, Draft, Failed (client-side filtering)
5. Tracked posts show a green "Tracked" badge and story title; untracked posts show "Untracked"

## Rate Limits

Bluesky uses a points-based system: 5,000 points/hour, 35,000 points/day. Posts cost 3 points each. At twice-daily auto-posting plus occasional manual posts, usage is negligible.

## Configuration

Story URLs in posts use the top-level `config.siteUrl` (`SITE_URL` env var, defaults to `https://impactoindigena.news`).

Channel-specific settings in `server/src/config.ts` under `config.bluesky`:

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `handle` | `BLUESKY_HANDLE` | `''` | Bluesky account handle |
| `appPassword` | `BLUESKY_APP_PASSWORD` | `''` | App-specific password |
| `serviceUrl` | `BLUESKY_SERVICE_URL` | `https://bsky.social` | AT Protocol service URL |
| `autoPost.enabled` | `BLUESKY_AUTO_POST_ENABLED` | `false` | Enable auto-post job |
| `autoPost.lookbackHours` | `BLUESKY_LOOKBACK_HOURS` | `12` | Hours to look back for candidates |
| `metrics.maxAgeDays` | `BLUESKY_METRICS_MAX_AGE_DAYS` | `30` | Only poll metrics for recent posts |
| `postDelayMs` | `BLUESKY_POST_DELAY_MS` | `2000` | Delay between consecutive posts |
| `postModelTier` | — | `medium` | LLM model tier for post text generation |
| `pickModelTier` | — | `medium` | LLM model tier for story picking |

## API Endpoints

All under `/api/admin/bluesky/` (require auth):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/feed` | Merged API + DB feed (cursor-based, cross-referenced with DB) |
| `GET` | `/posts` | List posts (paginated, filterable by status) |
| `GET` | `/posts/:id` | Get single post with story details |
| `POST` | `/posts/generate` | Generate draft from a story |
| `POST` | `/posts/pick-and-draft` | Pick best from multiple stories + generate draft |
| `PUT` | `/posts/:id` | Update draft text |
| `POST` | `/posts/:id/publish` | Publish draft to Bluesky |
| `DELETE` | `/posts/:id` | Delete a post (draft or published; published posts are also removed from Bluesky) |
| `POST` | `/metrics/refresh` | Manually trigger metrics update |

## Database

`bluesky_posts` table (Prisma model `BlueskyPost`):

- `id` — UUID primary key
- `storyId` — FK to `stories`
- `postUri` — AT Protocol URI (unique, set after publish)
- `postCid` — Content hash from Bluesky
- `status` — `draft` | `published` | `failed`
- `postText` — The generated/edited post text
- `error` — Error message if publishing failed
- `publishedAt` — When posted to Bluesky
- `likeCount`, `repostCount`, `replyCount`, `quoteCount` — Engagement metrics
- `metricsUpdatedAt` — Last metrics poll timestamp

## LLM Prompts

Two prompts in `server/src/prompts/bluesky.ts`:

1. **`buildBlueskyPostPrompt`** — Generates a short editorial hook (not a summary). The LLM receives the story title, summary, and relevanceSummary as context, with instructions to write a "why you should care" angle. Max chars are dynamically calculated based on remaining space after title and metadata lines. The hook ends with 2-3 discovery hashtags (auto-faceted by `RichText.detectFacets`); on Bluesky hashtags are how 0-follower accounts get reach. Output: `blueskyPostTextSchema` (editorial text).

2. **`buildBlueskyPickBestPrompt`** — Picks the most engagement-worthy story from a set. Receives each candidate's summary and relevanceSummary (as "Why it matters") alongside metadata. Considers timeliness, emotional appeal, broad relevance, shareability, and uniqueness. Output: `blueskyPickBestSchema` (storyId + reasoning).

Both use the `medium` model tier (configured separately as `postModelTier` and `pickModelTier`).

## File Locations

| File | Purpose |
|------|---------|
| `server/src/lib/bluesky.ts` | AT Protocol API client (auth, post creation, metrics) |
| `server/src/services/bluesky.ts` | Service layer (draft generation, publishing, metrics) |
| `server/src/schemas/bluesky.ts` | Zod schemas for LLM output and API validation |
| `server/src/prompts/bluesky.ts` | LLM prompt builders |
| `server/src/routes/admin/bluesky.ts` | Admin API routes |
| `server/src/jobs/blueskyAutoPost.ts` | Legacy Bluesky-only auto-post (unused; replaced by `socialAutoPost.ts`) |
| `server/src/jobs/socialAutoPost.ts` | Unified auto-post cron job for all channels |
| `server/src/jobs/blueskyUpdateMetrics.ts` | Metrics polling cron job handler |
| `server/src/config.ts` | Configuration (bluesky section) |
| `server/prisma/schema.prisma` | BlueskyPost model |
| `client/src/components/admin/BlueskyDraftPanel.tsx` | Draft review side panel |
| `client/src/pages/admin/BlueskyPage.tsx` | Admin Bluesky overview page |
| `client/src/components/admin/BulkActionsBar.tsx` | Bluesky action buttons |
