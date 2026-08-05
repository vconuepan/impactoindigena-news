# Facebook Page Integration

> **Spec:** [`.specs/social-posting.allium`](../.specs/social-posting.allium) — channel sum type, story selection, draft generation, publishing, credential lifecycle (shared across channels). This file covers Facebook-specific implementation details, why groups are impossible, the link-card approach, and the admin surface.

## Overview

Posting of stories to a Facebook **Page** via the Graph API v21.0. Each post is text plus the story link; Facebook renders the link card. Drafts are reviewed at `/admin/facebook` and the unified `social_auto_post` job can post automatically when enabled.

**Groups cannot be automated, at all.** Meta shut down the Groups API (`publish_to_groups`) in April 2024. No app publishes to a group via API, and no amount of work changes that. Sharing to a group is a human pasting a link. This matters editorially: Impacto Indígena's real audience is in groups, so this channel does not reach them. Links shared by hand into groups must carry `?_r=social`, because Facebook's in-app browser sends no referrer and those visits otherwise land in "direct".

## Authentication

A **Page Access Token**, which is *not* the Instagram token even though the Meta app is the same:

| | Instagram | Facebook Page |
|---|---|---|
| Host | `graph.instagram.com` | `graph.facebook.com` |
| Token | Instagram user token | Page access token |
| Renewal | Automatic (`ig_refresh_token`) | Human, no API path |

Env vars: `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, plus `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` for introspection. Permissions needed on the token: `pages_manage_posts` and `pages_read_engagement`.

`isFacebookConfigured()` requires the token and the page id. `isFacebookAppConfigured()` gates introspection separately, so a missing app secret degrades the *warning* without breaking *publishing*.

### Token lifecycle (check, not refresh)

Read path is DB-first, exactly like Instagram and LinkedIn: `getAccessToken()` reads `social_tokens` where `provider = 'facebook'`, falling back to the env var. The env var is the bootstrap.

`facebook_check_token` (daily 06:30, half an hour after LinkedIn's) calls `GET /debug_token`, which authenticates with `app_id|app_secret` rather than the token's own scopes — so it works on a publish-only token and returns the exact expiry. It throws (triggering the job-failure email) when the token is invalid or when fewer than `FACEBOOK_TOKEN_WARN_THRESHOLD_DAYS` (default 7) remain.

It does **not** renew. Minting a new Page token needs a live user token and the OAuth flow, which means a human. A **system user token does not expire**: `expires_at` comes back as 0, the job reports `neverExpires` and never alerts. Treating "no expiry" as "expired" would send a daily email about nothing.

**Rotating by hand:** delete the stored row or the old DB value keeps beating the new env var.

```sql
DELETE FROM social_tokens WHERE provider = 'facebook';
```

## Why a link post, not a photo post

`createPagePost()` calls `POST /{page-id}/feed` with `message` + `link`. Facebook builds the link card from the article's `og:image`, which the site already generates and re-hosts on R2 (PR #7).

The alternative, `POST /{page-id}/photos`, uploads an image — but the resulting photo does not click through to the article. For a news outlet that inverts the point of posting. Consequences of the choice: no image column on the table, no image generation cost, one request instead of three, and the card quality is exactly the `og:image` quality.

The returned id is `{pageId}_{postId}`; the permalink is derived from it.

## Retry Semantics

`publishPost()` and `updateDraft()` both accept `draft` and `failed`, like Instagram and LinkedIn. A publish failure here is usually a token or permission problem, so fixing the text and retrying beats regenerating. Edit and publish must accept the same statuses: the panel saves before publishing, and a status publish accepts but edit rejects makes the post unpublishable from the UI (the Instagram bug of 30-Jul-2026, repeated on LinkedIn on 1-Aug).

`generateDraft()` returns an existing `draft` as-is, deletes and regenerates a `failed` one, and refuses when a post is already published.

## Draft Generation

LLM-generated via `buildFacebookPostPrompt()` (`server/src/prompts/facebook.ts`), medium model tier.

**The voice is the outlet's, not Venancio's.** Instagram and LinkedIn write in first person from his profile; a Page is Impacto Indígena speaking, so the register is editorial: what happened, who it affects, why it matters. No hashtags (they add no reach on Facebook and clutter editorial text), no links in the body (the API sends the link separately), no emoji. 60-120 words, with the weight on the first two lines because that is all the feed shows before "Ver más".

## Admin Surface

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/facebook/token/status` | Token health for the card (always 200, even on a dead token) |
| `GET` | `/api/admin/facebook/posts` | List posts (query: `status`, `page`, `limit`) |
| `GET` | `/api/admin/facebook/posts/:id` | Get single post |
| `POST` | `/api/admin/facebook/posts/generate` | Generate draft for a story (`{ storyId }`) |
| `PUT` | `/api/admin/facebook/posts/:id` | Update draft text (`{ postText }`) |
| `POST` | `/api/admin/facebook/posts/:id/publish` | Publish to the Page |
| `DELETE` | `/api/admin/facebook/posts/:id` | Delete the record (the Page post stays up) |
| `POST` | `/api/admin/facebook/metrics/refresh` | Manually trigger metrics refresh |

All routes require admin or editor role. Page at `/admin/facebook`, nav group "Distribución", reachable via ⌘K.

`/token/status` answers 200 with `isValid: false` when introspection fails, because the card has to render precisely when the token is broken.

## Metrics

`facebook_update_metrics` (registered, disabled by default) reads posts published within `FACEBOOK_METRICS_MAX_AGE_DAYS` (default 30) and fetches `likes.summary(true)`, `comments.summary(true)` and `shares`. No Insights permission needed. Note `shares` is **absent**, not zero, when nobody shared.

A `FacebookAuthError` (Meta codes 190, 102, 463, 467, 200) aborts the loop and propagates, so the job fails loudly instead of reporting success over a dead channel — the failure mode that hid the July 2026 Instagram outage for 12 days.

## Database Model (`FacebookPost`)

| Field | Description |
|-------|-------------|
| `storyId` | FK to Story (unique — one post per story) |
| `postText` | Post body, no link (the API sends it separately) |
| `status` | `draft` → `published` or `failed` |
| `facebookPostId` | `{pageId}_{postId}`, set after publish |
| `permalink` | Derived from the returned id |
| `publishedAt` | Timestamp of successful publish |
| `likeCount` / `commentCount` / `shareCount` | Engagement metrics |
| `metricsUpdatedAt` | Last metrics refresh |
| `error` | Error message when status is `failed` |

Migration: `20260803000000_add_facebook_posts` — table, indexes, FK, and both `job_runs` rows. Idempotent.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Yes (for Facebook) | `''` | Page access token (bootstrap; DB wins once stored) |
| `FACEBOOK_PAGE_ID` | Yes (for Facebook) | `''` | Numeric Page id |
| `FACEBOOK_APP_ID` | For token checks | `''` | App id, used by `/debug_token` |
| `FACEBOOK_APP_SECRET` | For token checks | `''` | App secret, used by `/debug_token` |
| `FACEBOOK_AUTO_POST_ENABLED` | No | `false` | Include Facebook in `social_auto_post` |
| `FACEBOOK_METRICS_MAX_AGE_DAYS` | No | `30` | Days of posts to include in metrics polling |
| `FACEBOOK_TOKEN_WARN_THRESHOLD_DAYS` | No | `7` | Warn when fewer than this many days remain |

## Key Files

| File | Role |
|------|------|
| `server/src/lib/facebook.ts` | Graph API calls, `FacebookAuthError`, token read + introspection |
| `server/src/services/facebook.ts` | Draft generation, CRUD, publishing, metrics |
| `server/src/prompts/facebook.ts` | Post prompt (outlet voice) |
| `server/src/routes/admin/facebook.ts` | Admin API route handlers |
| `server/src/jobs/facebookCheckToken.ts` | Daily token check (`facebook_check_token`) |
| `server/src/jobs/facebookUpdateMetrics.ts` | Metrics polling job |
| `client/src/pages/admin/FacebookPage.tsx` | Admin page |
| `client/src/components/admin/FacebookDraftPanel.tsx` | Review, edit and publish panel |
| `client/src/components/admin/FacebookTokenCard.tsx` | Token countdown card |
