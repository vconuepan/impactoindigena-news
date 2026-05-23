# Instagram Integration

> **Spec:** [`.specs/social-posting.allium`](../.specs/social-posting.allium) — channel sum type, story selection, draft generation, publishing, duplicate prevention (shared across channels). This file covers Instagram-specific implementation details, authentication, carousel generation, R2 dependency, and admin API endpoints.

## Overview

Automated and manual posting of stories to Instagram via the Graph API v21.0. Posts are either **carousel posts** (4 slides — cover image + summary + relevance + URL slide, generated and stored in Cloudflare R2) or **single-image posts** (fallback when R2 is not configured). The post pipeline follows the unified draft-review-publish pattern shared with Bluesky, Mastodon, and Twitter.

## Authentication

Uses **long-lived access token** (not OAuth 2.0 code flow). Credentials stored in environment variables:

- `INSTAGRAM_ACCESS_TOKEN` — long-lived user access token from the Instagram Graph API
- `INSTAGRAM_USER_ID` — Instagram user ID (numeric string) associated with the business account

The token is used as-is for every API call. Long-lived tokens expire after 60 days — manual rotation is required. There is no automatic refresh logic. If the token expires, all Instagram posts will fail with a 400/401 error visible in Render logs.

`isInstagramConfigured()` (`server/src/lib/instagram.ts`) returns `true` when both env vars are set.

## Post Types

### Carousel Post (R2 required)

When `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_PUBLIC_URL` are all set, `generateDraft()` produces a 4-slide carousel:

1. **Slide 1** — AI-generated cover image (`generateStoryImage()`)
2. **Slide 2** — Summary text overlay
3. **Slide 3** — Relevance reasons text overlay
4. **Slide 4** — URL/CTA slide pointing to the story page

Slides are generated via `generateCarousel()` (`server/src/lib/carouselGen.ts`), uploaded to Cloudflare R2, and stored as public URLs in `InstagramPost.slideUrls` (string array).

The Instagram Graph API **requires publicly accessible image URLs** — R2 public bucket URLs satisfy this requirement.

### Single-Image Post (R2 not configured)

When R2 is absent, `generateDraft()` falls back to a single-image post using only the AI-generated cover image or a reused Twitter post image. `slideUrls` contains exactly one URL.

## AI Image Generation

`generateStoryImage()` (`server/src/lib/imageGen.ts`) is called during draft generation. Behavior:

1. Checks if a Twitter post already exists for this story with a non-fallback image — reuses it to avoid double generation
2. If no usable image, generates a new one via Azure OpenAI image generation (`AZURE_IMAGE_ENDPOINT` + `AZURE_IMAGE_DEPLOYMENT`, defaults to `gpt-image-2`)
3. If image generation fails, falls back to the Impacto Indígena logo URL

**Logo fallback detection:** `LOGO_FALLBACK_MARKERS = ['cropped-logo-impacto-indigena', '1-2.png']` — any image URL containing these strings is treated as a failed fallback and not reused.

## Caption Generation

Captions are LLM-generated via `buildInstagramCaptionPrompt()` (`server/src/prompts/instagram.ts`) using the **medium** model tier. The prompt receives: `title`, `titleLabel`, `summary`, `relevanceSummary`, `relevanceReasons`, `marketingBlurb`, `issueName`, and `sourceCountry`.

The story's canonical URL (`https://impactoindigena.news/stories/:slug`) is appended to every caption with a blank line separator. Total caption is capped at **2,200 characters** (truncated with `…` if exceeded).

## Flows

### Manual: Single Story

1. Admin navigates to `/admin/instagram`
2. Selects a published story and clicks "Generar borrador"
3. `POST /api/admin/instagram/posts/generate` → `generateDraft()` generates caption + images
4. Admin reviews caption and slides in the draft panel
5. Admin clicks "Publicar" → `POST /api/admin/instagram/posts/:id/publish`

### Automated: Cron Job (`social_auto_post`)

The unified `socialAutoPost` job runs on a schedule and posts to all enabled channels:

1. Checks `INSTAGRAM_AUTO_POST_ENABLED=true` and `isInstagramConfigured()` — skips if either is false
2. `findAutoPostCandidates()` finds recently published stories not yet posted to Instagram
3. `pickBestStoryForSocial()` uses LLM to select the best story
4. `generateDraft(storyId)` → `publishPost(postId)` run sequentially
5. A 2-second delay separates channel posts to avoid rate limit spikes

### Metrics Polling (`instagram_update_metrics`)

The `instagramUpdateMetrics` job runs on a schedule (default: disabled):

1. Fetches all `published` `InstagramPost` records from the last N days (`INSTAGRAM_METRICS_MAX_AGE_DAYS`, default 30)
2. Calls `getPostMetrics()` for each, which fetches `like_count` + `comments_count` from the Graph API
3. Updates `likeCount`, `commentCount`, `metricsUpdatedAt` on each record

No special "Insights" permission is required — basic media fields suffice.

## Publishing Pipeline (3 steps)

The Graph API requires a **3-step publish flow** with deliberate delays:

**For carousels (`createCarouselPost()`):**
1. For each image URL: `POST /{userId}/media` with `is_carousel_item: true` → child container ID (3s delay between each)
2. `POST /{userId}/media` with `media_type: CAROUSEL` + all child IDs → carousel container ID (3s wait)
3. `POST /{userId}/media_publish` with `creation_id` → published post ID

**For single images (`createSingleImagePost()`):**
1. `POST /{userId}/media` with `image_url` + `caption` → container ID (3s wait)
2. `POST /{userId}/media_publish` with `creation_id` → published post ID

**Base URL:** `https://graph.instagram.com/v21.0`

**Retry:** `withRetry({ retries: 2, baseDelayMs: 3000 })` wraps the full pipeline.

On success: `InstagramPost.status → 'published'`, `instagramPostId`, `permalink`, `publishedAt` set.
On failure: `InstagramPost.status → 'failed'`, `error` field set with the raw error message.

## Database Model (`InstagramPost`)

Key fields:

| Field | Description |
|-------|-------------|
| `storyId` | FK to Story (1:1 — enforced via `findFirst` check in service) |
| `caption` | Full LLM-generated caption including URL suffix |
| `imageUrl` | First slide URL (used for previews) |
| `slideUrls` | All slide URLs as string array (1 for single-image, 4 for carousel) |
| `status` | `draft` → `published` or `failed` |
| `instagramPostId` | Instagram's returned post ID (set after publish) |
| `permalink` | `https://www.instagram.com/p/:postId/` |
| `publishedAt` | Timestamp of successful publish |
| `likeCount` / `commentCount` | Engagement metrics (updated by cron) |
| `metricsUpdatedAt` | Last metrics poll timestamp |
| `error` | Error message if status is `failed` |

## Admin API Endpoints

All routes require admin or editor role (`requireAuth, requireRole('admin', 'editor')`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/instagram/posts` | List posts (query: `status`, `page`, `limit`) |
| `GET` | `/api/admin/instagram/posts/:id` | Get single post |
| `POST` | `/api/admin/instagram/posts/generate` | Generate draft for a story (`{ storyId }`) |
| `PATCH` | `/api/admin/instagram/posts/:id` | Update draft caption (`{ caption }`) |
| `POST` | `/api/admin/instagram/posts/:id/publish` | Publish a draft post |
| `DELETE` | `/api/admin/instagram/posts/:id` | Delete post record |
| `POST` | `/api/admin/instagram/metrics` | Manually trigger metrics refresh |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `INSTAGRAM_ACCESS_TOKEN` | Yes (for Instagram) | `''` | Long-lived Graph API user token |
| `INSTAGRAM_USER_ID` | Yes (for Instagram) | `''` | Numeric Instagram user ID |
| `INSTAGRAM_AUTO_POST_ENABLED` | No | `false` | Enable cron auto-posting |
| `INSTAGRAM_METRICS_MAX_AGE_DAYS` | No | `30` | Days of posts to include in metrics polling |
| `R2_ENDPOINT` | No | `''` | Cloudflare R2 endpoint (enables carousel mode) |
| `R2_ACCESS_KEY_ID` | No | `''` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | No | `''` | R2 secret key |
| `R2_PUBLIC_URL` | No | `''` | Public base URL for R2 bucket |
| `AZURE_IMAGE_ENDPOINT` | No | `''` | Separate Azure resource for image gen (Sweden Central) |
| `AZURE_IMAGE_API_KEY` | No | `''` | API key for the image gen resource |
| `AZURE_IMAGE_DEPLOYMENT` | No | `gpt-image-2` | Deployment name for image generation |

## Common Issues

**Token expiry:** Long-lived tokens expire after 60 days. Symptom: all Instagram operations fail with Graph API error codes 190 or 102. Fix: generate a new long-lived token from the Meta Developer Console and update `INSTAGRAM_ACCESS_TOKEN` in Render.

**R2 image URLs not accessible:** The Graph API fetches images from the provided URLs at publish time. If R2 public bucket access is misconfigured or the URL is not publicly reachable, carousel item creation fails with "Failed to create carousel item". Verify R2 bucket is public and `R2_PUBLIC_URL` is correct.

**Carousel processing delay:** The Graph API sometimes needs extra time to process carousel items. If publishing fails immediately after container creation, the `withRetry` wrapper will retry with 3-second delays.

**Duplicate post prevention:** `generateDraft()` checks for an existing `InstagramPost` record with the same `storyId`. If one exists (any status), generation throws "Story already has an Instagram post". Delete the existing record from `/admin/instagram` to regenerate.

## Key Files

| File | Role |
|------|------|
| `server/src/lib/instagram.ts` | Low-level Graph API calls (create containers, publish, fetch metrics) |
| `server/src/services/instagram.ts` | Business logic: draft generation, caption LLM, metrics, CRUD |
| `server/src/routes/admin/instagram.ts` | Admin API route handlers |
| `server/src/jobs/socialAutoPost.ts` | Unified auto-post job (all social channels) |
| `server/src/jobs/instagramUpdateMetrics.ts` | Metrics polling cron job |
| `server/src/lib/carouselGen.ts` | Slide image generation + R2 upload |
| `server/src/lib/imageGen.ts` | AI cover image generation via Azure OpenAI |
| `server/src/prompts/instagram.ts` | Caption prompt builder |
