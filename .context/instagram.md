# Instagram Integration

> **Spec:** [`.specs/social-posting.allium`](../.specs/social-posting.allium) — channel sum type, story selection, draft generation, publishing, duplicate prevention (shared across channels). This file covers Instagram-specific implementation details, authentication, carousel generation, R2 dependency, and admin API endpoints.

## Overview

Automated and manual posting of stories to Instagram via the Graph API v21.0. Every post is a **carousel built from the original article** — the same text, guards and slides as the panel's story carousel ([`story-carousel.md`](story-carousel.md)) — with a caption written from that same article. Slides are stored in Cloudflare R2. The post pipeline follows the unified draft-review-publish pattern shared with Bluesky, Mastodon, and Twitter.

> **Desde el 25-oct-2026 (decisión del director).** Hasta ese día el carrusel se armaba con el resumen y las razones que escribe la IA de Voces, con una portada de IA (`gpt-image-2`), sin nombrar al medio y con una lámina de cierre que decía dos afirmaciones que el director retiró del sitio el 4-oct. El 24-oct se publicó así una lámina que decía solo «limitingFactors» (una clave del esquema que el modelo coló en las razones) y una portada con uniformados y una retroexcavadora que el artículo de Radio Kurruf no reporta. Ver «Rejected» abajo.

## Authentication

Uses **long-lived access token** (not OAuth 2.0 code flow). Credentials stored in environment variables:

- `INSTAGRAM_ACCESS_TOKEN` — long-lived user access token from the Instagram Graph API
- `INSTAGRAM_USER_ID` — Instagram user ID (numeric string) associated with the business account

`isInstagramConfigured()` (`server/src/lib/instagram.ts`) returns `true` when both env vars are set.

### Token lifecycle (auto-refreshed)

Long-lived tokens expire after 60 days. The `instagram_refresh_token` job keeps the token alive by calling `GET /refresh_access_token?grant_type=ig_refresh_token`, which extends it another 60 days.

The refreshed value is a **new** token, and the process cannot rewrite its own App Service env var — so it is persisted in the `social_tokens` table instead. The read path is:

1. `getAccessToken()` reads `social_tokens` where `provider = 'instagram'`
2. If no row exists (or the DB read fails), falls back to `INSTAGRAM_ACCESS_TOKEN`

The env var is the **bootstrap**: set by hand once. After the first automatic refresh the DB value wins. An empty `social_tokens` table means "still on the env var", so the mechanism is inert until the job runs.

**A token that already expired cannot be refreshed** — the API requires a live token. In that case the job throws, which triggers the standard job-failure email, and a new long-lived token must be generated in the Meta Developer Console.

**A token younger than 24 hours cannot be refreshed either.** Meta returns code 190 for this too, but it means the opposite of a dead token: the token is fine, just new. `InstagramTokenTooYoungError` separates the two so the job waits for the next run instead of emailing a false alarm the night after a manual rotation.

**Auth errors are typed.** `InstagramAuthError` (Meta codes 190, 102, 463, 467) marks "the token is dead" as distinct from a one-off image or network failure, so loops over many posts abort on the first one instead of hammering the API.

## Post Types

### Carousel Post (R2 required)

`generateDraft()` builds the carousel with `buildStoryCarouselForSocial()` (`server/src/services/storyCarousel.ts`): the model writes the slide text from `story.sourceContent` (informative, without the director's reading), the guards in `lib/storyCarouselGuards.ts` check it, and `lib/storyCarouselRender.ts` draws it — cover, one idea per slide, and a closing slide with «Lee la nota completa» (outlet, author, original title, domain) and the AI line. Every slide carries «Reporteó: <medio>». **The cover and the closing slide carry the outlet's own photo** (`story.imageUrl` when `lib/fotoDelMedio.ts` says it is the outlet's: `oghero-` or served from the outlet's domain) with «Foto: <medio>»; **never an AI image nor the branded story card** (director, 29-oct-2026). Without one, both slides use the brand background.

Slides are uploaded to R2 by `subirCarrusel()` as `<storyId>-original-NN-<timestamp>.jpg`. The `-original-` marker is how `armadoDesdeElOriginal()` tells a carousel from the original apart from one built by the previous generator: those are never published (see below).

The Instagram Graph API **requires publicly accessible image URLs** — R2 public bucket URLs satisfy this requirement. Without R2 the draft fails: there is no single-image fallback anymore.

### Rejected (`status = 'rejected'`)

There is no editor to fix a warning, so any warning rejects the post: the carousel text (cita, identidad, pueblo, cifra), a slide whose text does not fit (espacio), a Google News URL or an original under `STORY_CAROUSEL_MIN_SOURCE_CHARS`, and the caption (cita, identidad, pueblo — hashtags included, «#PueblosIndígenas» reads as «Pueblos Indígenas»). The reason is saved in `error` and shown in the panel. Nothing is uploaded for a rejected post.

The auto-post job counts `rejected` as done for Instagram, so it does not pick the same story on every run. From the panel, generating again deletes the rejected record and asks the model for a new text.

## Caption Generation

Captions are LLM-generated via `buildInstagramCaptionPrompt()` (`server/src/prompts/instagram.ts`) using the **medium** model tier, in Venancio Coñuepán Mesías's first-person voice (decision of 12-apr-2026). Since 25-oct-2026 the prompt receives the **original article** (`sourceTitle`, `sourceContent` capped at `STORY_CAROUSEL_MAX_SOURCE_CHARS`, the outlet, `issueName`, `sourceCountry`) — never `summary`, `relevanceSummary`, `relevanceReasons` or `marketingBlurb`.

`revisarPie()` checks the caption with the same guards as the director's reading (no `cifra` guard: the caption may name a law). Then `pieConAtribucion()` appends «Reporteó: <medio>» and the story URL; if the total would not fit in **2,200 characters** together with the AI line added at publish time, the model's text is shortened, never the attribution or the link.

## Flows

### Manual: Single Story

1. Admin navigates to `/admin/instagram`
2. Selects a published story and clicks "Generar borrador"
3. `POST /api/admin/instagram/posts/generate` → `generateDraft()` returns the record in `generating` and builds the carousel and caption in the background; the panel polls until it is `draft` or `rejected`
4. Admin reviews caption and slides in the draft panel (a rejected post shows the reason and cannot be published)
5. Admin clicks "Publicar" → `POST /api/admin/instagram/posts/:id/publish`. `publishPost()` checks again: a carousel from the previous generator is refused, and an edited caption goes through `revisarPie()` again

### Automated: Cron Job (`social_auto_post`)

The unified `socialAutoPost` job runs on a schedule and posts to all enabled channels:

1. Checks `INSTAGRAM_AUTO_POST_ENABLED=true` and `isInstagramConfigured()` — skips if either is false
2. `findAutoPostCandidates()` finds recently published stories not yet posted to Instagram
3. `pickBestStoryForSocial()` uses LLM to select the best story
4. `generateDraft(storyId, { esperar: true })` waits for the draft, then `publishPost(postId)` runs in the same run. A `rejected` draft is not published. (Until 25-oct-2026 the job did not wait: it tried to publish a record still in `generating`, failed with «Can only publish draft posts», and the draft went out on a later run only if the model picked the same story again.)
5. A 2-second delay separates channel posts to avoid rate limit spikes

### Metrics Polling (`instagram_update_metrics`)

The `instagramUpdateMetrics` job runs on a schedule (default: disabled):

1. Fetches all `published` `InstagramPost` records from the last N days (`INSTAGRAM_METRICS_MAX_AGE_DAYS`, default 30)
2. Calls `getPostMetrics()` for each, which fetches `like_count` + `comments_count` from the Graph API
3. Updates `likeCount`, `commentCount`, `metricsUpdatedAt` on each record

No special "Insights" permission is required — basic media fields suffice.

If the token is dead, the loop aborts on the first post and the job fails loudly instead of retrying every post (which is what produced ~1956 useless API calls during the July 2026 outage).

### Token Refresh (`instagram_refresh_token`)

Daily at 05:30 server time, enabled by default:

1. Skips if Instagram is not configured
2. Reads `getTokenStatus()`; with no known expiry (first run, token still from the env var) it refreshes immediately to start tracking one
3. If more than `INSTAGRAM_TOKEN_REFRESH_THRESHOLD_DAYS` remain, does nothing — refreshing daily would waste quota, since each call extends from today
4. If the token already expired, throws so the failure email goes out (a dead token cannot be refreshed)
5. Otherwise refreshes and stores the new token plus its expiry

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
| `status` | `generating` → `draft` → `publishing` → `published` or `failed`. The two transient states exist because asset building and slide upload run in the background; the client polls. Both `draft` and `failed` accept an edit or a publish, so a failed post is fixed in place rather than deleted. |
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
| `INSTAGRAM_TOKEN_REFRESH_THRESHOLD_DAYS` | No | `15` | Refresh the token when fewer than this many days remain |
| `INSTAGRAM_TOKEN_LIFETIME_DAYS` | No | `60` | Assumed token lifetime when the API omits `expires_in` |
| `R2_ENDPOINT` | No | `''` | Cloudflare R2 endpoint (enables carousel mode) |
| `R2_ACCESS_KEY_ID` | No | `''` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | No | `''` | R2 secret key |
| `R2_PUBLIC_URL` | No | `''` | Public base URL for R2 bucket |
| `AZURE_IMAGE_ENDPOINT` | No | `''` | Separate Azure resource for image gen (Sweden Central) |
| `AZURE_IMAGE_API_KEY` | No | `''` | API key for the image gen resource |
| `AZURE_IMAGE_DEPLOYMENT` | No | `gpt-image-2` | Deployment name for image generation |
| `AZURE_IMAGE_QUALITY` | No | `high` | Quality for landscape images (website hero, not recompressed): low/medium/high |
| `AZURE_IMAGE_QUALITY_PORTRAIT` | No | `medium` | Quality for portrait images (Twitter recompresses on upload, so high is wasted). Instagram no longer uses an AI image: low/medium/high |

## Common Issues

**Token expiry:** Long-lived tokens expire after 60 days. The `instagram_refresh_token` job now renews the token before that happens, so this should not recur. Symptom when it does: every Instagram operation fails with `InstagramAuthError` and Graph API code 190 (`"Error validating access token: Session has expired on …"`).

Fix: generate a new long-lived token in the Meta Developer Console, update `INSTAGRAM_ACCESS_TOKEN`, and delete the stale row from `social_tokens` (otherwise the expired DB value keeps winning over the new env var):

```sql
DELETE FROM social_tokens WHERE provider = 'instagram';
```

This happened once, in July 2026: the token expired on 18-Jul and posting stayed broken for 12 days with no alert, because `updateMetrics()` swallowed the per-post error and the job kept reporting success. Both gaps are now closed — the refresh job and the typed auth error that aborts the loop.

**R2 image URLs not accessible:** The Graph API fetches images from the provided URLs at publish time. If R2 public bucket access is misconfigured or the URL is not publicly reachable, carousel item creation fails with "Failed to create carousel item". Verify R2 bucket is public and `R2_PUBLIC_URL` is correct.

**Carousel processing delay:** The Graph API sometimes needs extra time to process carousel items. If publishing fails immediately after container creation, the `withRetry` wrapper will retry with 3-second delays.

**Duplicate post prevention:** `generateDraft()` checks for an existing `InstagramPost` record with the same `storyId`. A `generating` record, or a `draft` built from the original, is returned as-is, so the panel reopens seamlessly. A `failed` or `rejected` record, or a `draft` from the previous generator (AI summary, saved before 25-oct-2026), is deleted and regenerated. Any other status (`published`, `publishing`) throws "Story already has an Instagram post" — delete the record from `/admin/instagram` to regenerate.

## Key Files

| File | Role |
|------|------|
| `server/src/lib/instagram.ts` | Low-level Graph API calls (create containers, publish, fetch metrics, refresh token, `InstagramAuthError`) |
| `server/src/lib/socialToken.ts` | Persistence for refreshed tokens (`social_tokens` table, raw SQL) |
| `server/src/jobs/instagramRefreshToken.ts` | Daily token-renewal job (`instagram_refresh_token`) |
| `server/src/services/instagram.ts` | Business logic: draft generation, caption LLM, metrics, CRUD |
| `server/src/routes/admin/instagram.ts` | Admin API route handlers |
| `server/src/jobs/socialAutoPost.ts` | Unified auto-post job (all social channels) |
| `server/src/jobs/instagramUpdateMetrics.ts` | Metrics polling cron job |
| `server/src/services/storyCarousel.ts` | `buildStoryCarouselForSocial`, `subirCarrusel`, `armadoDesdeElOriginal` |
| `server/src/lib/storyCarouselGuards.ts` | The guards, including `revisarPie` for the caption |
| `server/src/lib/storyCarouselRender.ts` | The slides |
| `server/src/lib/carouselGen.ts` | Shared canvas: font, palette, logo, background, footer, export |
| `server/src/prompts/instagram.ts` | Caption prompt builder (from the original article) |
