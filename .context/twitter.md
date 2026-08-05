# X/Twitter Integration

> **Spec:** [`.specs/social-posting.allium`](../.specs/social-posting.allium) — channel sum type, story selection, draft generation, publishing, retry semantics (shared across channels). This file covers Twitter-specific implementation details, authentication, the admin surface, and how it differs from the other channels.

## Overview

Posting of stories to X (Twitter) via API v2. Each post is a single tweet: text plus one optional image. Drafts are reviewed and published from `/admin/twitter`, and the unified `social_auto_post` job can post automatically when enabled.

Twitter was headless until August 2026: it had a service, a table and a slot in the auto-post job, but no admin route and no page, so nothing could be seen, edited, published by hand or deleted. The panel closed that gap.

## Authentication

**OAuth 1.0a** with four static credentials (not the OAuth 2.0 code flow, and unlike Instagram and LinkedIn there is nothing to renew — these do not expire):

- `TWITTER_API_KEY` / `TWITTER_API_SECRET` — the app's consumer credentials
- `TWITTER_ACCESS_TOKEN` / `TWITTER_ACCESS_TOKEN_SECRET` — the account's tokens

`isTwitterConfigured()` (`server/src/lib/twitter.ts`) returns `true` only when all four are set. Twitter has no row in `social_tokens` and no token-refresh or token-check job, because static credentials cannot lapse on their own.

## Draft Generation

`generateDraft()` (`server/src/services/twitter.ts`) does **not** call an LLM. It reuses text that already exists, in this order:

1. The Bluesky post text for the same story, if there is one (most recent first)
2. `story.marketingBlurb`
3. `story.summary`
4. `story.title`

The story URL is appended after a blank line. If the whole thing exceeds 275 characters, the base text is cut to 235 plus an ellipsis, keeping the URL intact. The X limit is 280; 275 leaves headroom.

An image is generated via `generateStoryImage()` and attached when it succeeds. Failure is not fatal: the draft is created without an image.

Any existing `TwitterPost` for the story blocks generation with "Story already has a Twitter post" — regardless of status. Unlike Instagram and LinkedIn, a `failed` post is **not** auto-deleted and regenerated; delete it from the panel first.

## Retry Semantics (differs from Instagram and LinkedIn)

`publishPost()` and `updateDraft()` both accept **`draft` only**. Recovery from `failed` is delete-and-regenerate, matching Bluesky and Mastodon.

The two must stay in step. The panel saves the text before publishing, so a status that publish accepts but edit rejects makes the post unpublishable from the UI — the bug that hit Instagram (30-Jul-2026) and LinkedIn (1-Aug-2026). The panel reflects this: a `failed` post opens read-only, showing the error and the recovery path, with publishing disabled.

## Admin Surface

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/twitter/posts` | List posts (query: `status`, `page`, `limit`) |
| `GET` | `/api/admin/twitter/posts/:id` | Get single post |
| `POST` | `/api/admin/twitter/posts/generate` | Generate draft for a story (`{ storyId }`) |
| `PUT` | `/api/admin/twitter/posts/:id` | Update draft text (`{ postText }`) |
| `POST` | `/api/admin/twitter/posts/:id/publish` | Publish a draft |
| `DELETE` | `/api/admin/twitter/posts/:id` | Delete the record (the tweet stays up) |
| `POST` | `/api/admin/twitter/metrics/refresh` | Manually trigger metrics refresh |

All routes require admin or editor role. The page lives at `/admin/twitter` (nav group "Distribución", also reachable via ⌘K).

**Deletion only drops the local record.** The credentials cover posting and metrics, not deletion, so a published tweet stays on X. The confirm dialog says so. Deleting frees the story to be drafted again.

## Auto-Post

The unified `social_auto_post` job includes Twitter when `TWITTER_AUTO_POST_ENABLED=true` and all four credentials are set. It is one of five channels; see `.context/scheduler.md` for the job itself.

Since draft generation reuses Bluesky's text, running both channels in the same pass produces near-identical wording. That is intentional, not a bug.

## Metrics

`twitter_update_metrics` is not a registered job: metrics refresh only from the admin button (`updateMetrics()`), which reads posts published in the last 7 days (hardcoded, unlike other channels' configurable `maxAgeDays`) and updates `likeCount`, `retweetCount`, `replyCount`, `quoteCount`.

## Database Model (`TwitterPost`)

| Field | Description |
|-------|-------------|
| `storyId` | FK to Story (unique — one post per story) |
| `postText` | Tweet body including the story URL |
| `imageUrl` | Optional generated image, attached at publish time |
| `status` | `draft` → `published` or `failed` |
| `tweetId` / `tweetUrl` | Set after a successful publish |
| `publishedAt` | Timestamp of successful publish |
| `likeCount` / `retweetCount` / `replyCount` / `quoteCount` | Engagement metrics |
| `metricsUpdatedAt` | Last metrics refresh |
| `error` | Error message when status is `failed` |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWITTER_API_KEY` | Yes (for Twitter) | `''` | App consumer key |
| `TWITTER_API_SECRET` | Yes (for Twitter) | `''` | App consumer secret |
| `TWITTER_ACCESS_TOKEN` | Yes (for Twitter) | `''` | Account access token |
| `TWITTER_ACCESS_TOKEN_SECRET` | Yes (for Twitter) | `''` | Account access token secret |
| `TWITTER_AUTO_POST_ENABLED` | No | `false` | Include Twitter in `social_auto_post` |
| `TWITTER_METRICS_MAX_AGE_DAYS` | No | `7` | Present in config but unused: `updateMetrics()` hardcodes 7 days |

## Key Files

| File | Role |
|------|------|
| `server/src/lib/twitter.ts` | API v2 calls via OAuth 1.0a (create tweet, fetch metrics) |
| `server/src/services/twitter.ts` | Draft generation, CRUD, publishing, metrics |
| `server/src/routes/admin/twitter.ts` | Admin API route handlers |
| `server/src/schemas/twitter.ts` | Zod request schemas |
| `client/src/pages/admin/TwitterPage.tsx` | Admin page (list, filters, pagination) |
| `client/src/components/admin/TwitterDraftPanel.tsx` | Review, edit and publish panel |
| `server/src/jobs/socialAutoPost.ts` | Unified auto-post job (all channels) |
