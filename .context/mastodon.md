# Mastodon Integration

> **Spec:** [`.specs/social-posting.allium`](../.specs/social-posting.allium) -- channel sum type, story selection, draft generation, publishing, duplicate prevention (shared with Bluesky). This file covers Mastodon-specific implementation details, authentication, API endpoints, and configuration.

## Overview

Automated and manual posting of stories to Mastodon via the REST API. Stories can be posted manually from the admin stories page (single or bulk with LLM selection) or automatically via the unified `social_auto_post` cron job. Each post includes LLM-generated text, a metadata line, and a story URL (Mastodon auto-generates link previews from og: tags).

## Authentication

Uses **static access token** authentication (no OAuth flow). Credentials stored in environment variables:

- `MASTODON_URL` — Instance URL (e.g. `https://mastodon.social`)
- `MASTODON_TOKEN` — Access token generated in Mastodon settings (Development > New Application > access token)

The client (`server/src/lib/mastodon.ts`) creates a REST API client using the `masto` npm package. The client is lazily initialized as a singleton.

### How to Set Up

1. Go to your Mastodon instance settings > Development > New Application
2. Name: "Impacto Indígena Bot" (or similar)
3. Required scopes: `read:statuses`, `write:statuses`
4. Save, then copy the **access token**
5. Set `MASTODON_URL` and `MASTODON_TOKEN` in your `.env`

## Post Format

Each Mastodon post consists of:

1. **Editorial text** — LLM-generated hook (similar to Bluesky but with different constraints)
2. **Metadata line** — `Issue | Emotion | found on Publisher`
3. **Source URL** — Original article URL (appears first so Mastodon generates a link preview card from the original article's og: tags, giving readers context)
4. **Story URL** — Link to the Impacto Indígena story page (secondary link, no card preview)

Mastodon posts are limited to 500 characters (configurable via `MASTODON_CHAR_LIMIT`). The LLM text max chars are calculated dynamically as `charLimit - metaLine.length - sourceUrl.length - storyUrl.length - 3` (three newlines). If the LLM overshoots, the text is trimmed with an ellipsis. Unlike Bluesky, URLs are included in the post text (not as an external embed). The source URL appears first so Mastodon's auto-generated link preview card shows the original article's og:image, title, and description. Posts use `unlisted` visibility by default (configurable via `MASTODON_VISIBILITY`).

## Shared Social Media Logic

To avoid duplicating story selection and post generation across channels, shared logic lives in `server/src/services/socialMedia.ts`:

- **`findAutoPostCandidates(lookbackHours)`** — Finds published stories not yet posted to ALL enabled channels. A story posted to Bluesky but not Mastodon is still a candidate.
- **`pickBestStoryForSocial(storyIds)`** — Platform-agnostic LLM picker, reuses the Bluesky pick-best prompt (criteria are universal: timeliness, emotional appeal, shareability).

The unified `social_auto_post` job (`server/src/jobs/socialAutoPost.ts`) uses a channel adapter pattern: it finds candidates once, picks a best story once, then iterates over enabled channels to generate and publish posts. Each channel has its own text generation (different constraints) and publishing logic.

## Flows

### Manual: Single Story

1. Admin selects one published story on `/admin/stories`
2. Clicks "Post to Mastodon" in the bulk actions bar
3. `POST /api/admin/mastodon/posts/generate` calls LLM to generate draft text
4. `MastodonDraftPanel` side panel opens with editable text, character counter, and posting info
5. Admin can edit the text, then clicks "Post to Mastodon" to publish
6. `POST /api/admin/mastodon/posts/:id/publish` sends to Mastodon API

### Manual: Pick Best from Multiple

1. Admin selects multiple published stories
2. Clicks "Pick Best for Mastodon"
3. `POST /api/admin/mastodon/posts/pick-and-draft` uses LLM to pick the best story, then generates draft text
4. Same review panel flow as single story, with additional pick reasoning display

### Automated: Unified Social Auto-Post

The `social_auto_post` job replaces per-channel auto-post jobs:

1. Finds stories published in the last N hours (`SOCIAL_LOOKBACK_HOURS`, default 25)
2. Excludes stories posted to ALL enabled channels
3. Uses LLM to pick the best candidate (one pick for all channels)
4. For each enabled channel: generates platform-specific text and publishes
5. Continues to next channel on failure (one channel failing doesn't block others)

### Metrics Polling

The `mastodon_update_metrics` job runs on schedule:

1. Fetches all published MastodonPosts from the last N days (`MASTODON_METRICS_MAX_AGE_DAYS`, default 30)
2. Polls the Mastodon API for engagement counts (favourites, boosts, replies)
3. Updates the database

Manual refresh is also available via the admin Mastodon page.

### Admin Feed View

The admin Mastodon page (`/admin/mastodon`) shows a merged view of the account's live Mastodon feed plus DB-tracked posts:

1. Fetches the account's statuses from the Mastodon API (ID-based pagination using `maxId`)
2. Cross-references each status ID against `mastodon_posts` to identify tracked posts
3. Shows drafts/failed posts from DB at the top (first page only)
4. Filters: All, Tracked, Untracked, Draft, Failed (client-side filtering)
5. Tracked posts show a green "Tracked" badge and story title; untracked posts show "Untracked"

## Configuration

Story URLs in posts use the top-level `config.siteUrl` (`SITE_URL` env var, defaults to `https://impactoindigena.news`).

All settings in `server/src/config.ts`:

### Mastodon-specific (`config.mastodon`)

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `instanceUrl` | `MASTODON_URL` | `''` | Mastodon instance URL |
| `accessToken` | `MASTODON_TOKEN` | `''` | Static access token |
| `autoPost.enabled` | `MASTODON_AUTO_POST_ENABLED` | `false` | Enable in unified auto-post job |
| `metrics.maxAgeDays` | `MASTODON_METRICS_MAX_AGE_DAYS` | `30` | Only poll metrics for recent posts |
| `postDelayMs` | `MASTODON_POST_DELAY_MS` | `2000` | Delay between consecutive posts |
| `postModelTier` | — | `medium` | LLM model tier for post text generation |
| `visibility` | `MASTODON_VISIBILITY` | `unlisted` | Post visibility (`public`, `unlisted`, `private`) |
| `charLimit` | `MASTODON_CHAR_LIMIT` | `500` | Character limit per post |

### Shared (`config.socialAutoPost`)

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `lookbackHours` | `SOCIAL_LOOKBACK_HOURS` | `25` | Hours to look back for auto-post candidates |
| `pickModelTier` | — | `medium` | LLM model tier for story picking |

## API Endpoints

All under `/api/admin/mastodon/` (require auth):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/feed` | Merged API + DB feed (maxId-based, cross-referenced with DB) |
| `GET` | `/posts` | List posts (paginated, filterable by status) |
| `GET` | `/posts/:id` | Get single post with story details |
| `POST` | `/posts/generate` | Generate draft from a story |
| `POST` | `/posts/pick-and-draft` | Pick best from multiple stories + generate draft |
| `PUT` | `/posts/:id` | Update draft text |
| `POST` | `/posts/:id/publish` | Publish draft to Mastodon |
| `DELETE` | `/posts/:id` | Delete a post (draft or published; published posts are also removed from Mastodon) |
| `POST` | `/metrics/refresh` | Manually trigger metrics update |

## Database

`mastodon_posts` table (Prisma model `MastodonPost`):

- `id` — UUID primary key
- `storyId` — FK to `stories`
- `statusId` — Mastodon status ID (unique, set after publish)
- `statusUrl` — URL to the post on the Mastodon instance
- `status` — `draft` | `published` | `failed`
- `postText` — The generated/edited post text
- `error` — Error message if publishing failed
- `publishedAt` — When posted to Mastodon
- `favouriteCount`, `boostCount`, `replyCount` — Engagement metrics
- `metricsUpdatedAt` — Last metrics poll timestamp

## LLM Prompts

One prompt in `server/src/prompts/mastodon.ts`:

**`buildMastodonPostPrompt`** — Generates a short editorial hook for Mastodon. Similar to Bluesky and targets Mastodon's higher character limit. Requires 2-3 discovery hashtags at the end (Mastodon surfaces posts by hashtag, so this is how 0-follower accounts get reach). The LLM receives the story title, summary, and relevanceSummary. Max chars are dynamically calculated based on remaining space. Output: `mastodonPostTextSchema` (editorial text).

Story picking reuses `pickBestStoryForSocial()` from the shared service, which uses the Bluesky pick-best prompt (criteria are universal).

## File Locations

| File | Purpose |
|------|---------|
| `server/src/lib/mastodon.ts` | Mastodon REST API client (status CRUD, metrics) |
| `server/src/services/mastodon.ts` | Service layer (draft generation, publishing, metrics, feed) |
| `server/src/services/socialMedia.ts` | Shared social media logic (candidate finding, story picking) |
| `server/src/schemas/mastodon.ts` | Zod schemas for LLM output and API validation |
| `server/src/prompts/mastodon.ts` | LLM prompt builder for post text |
| `server/src/routes/admin/mastodon.ts` | Admin API routes |
| `server/src/jobs/socialAutoPost.ts` | Unified auto-post cron job handler |
| `server/src/jobs/mastodonUpdateMetrics.ts` | Metrics polling cron job handler |
| `server/src/config.ts` | Configuration (mastodon + socialAutoPost sections) |
| `server/prisma/schema.prisma` | MastodonPost model |
| `client/src/components/admin/MastodonDraftPanel.tsx` | Draft review side panel |
| `client/src/pages/admin/MastodonPage.tsx` | Admin Mastodon overview page |
| `client/src/components/admin/BulkActionsBar.tsx` | Mastodon action buttons |
