# LinkedIn Integration

Spec counterpart: `.specs/social-posting.allium` (authoritative for posting behavior).

## Overview

Full channel: LLM-generated draft → admin review → publish → metrics. Posts go
out as a multi-image gallery (the Instagram carousel, reused verbatim when it
exists), falling back to a single image and then to an ARTICLE link card.

Key files: `server/src/lib/linkedin.ts` (API + auth), `server/src/services/linkedin.ts`
(drafts, publishing, metrics), `server/src/routes/admin/linkedin.ts`,
`server/src/routes/linkedinOAuth.ts` (public callback),
`server/src/jobs/linkedinCheckToken.ts`, `client/src/pages/admin/LinkedInPage.tsx`.

## Authentication

| Env var | Purpose |
|---------|---------|
| `LINKEDIN_ACCESS_TOKEN` | Member token used to publish. Bootstrap value only — see below |
| `LINKEDIN_AUTHOR_URN` | Author. Currently `urn:li:person:...` (a personal profile) |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | App credentials — introspection and reauthorization |
| `LINKEDIN_REDIRECT_URI` | Must match the app registration exactly. Defaults to `https://impactoindigena.news/api/linkedin/oauth/callback` |
| `LINKEDIN_OAUTH_SCOPES` | Defaults to `w_member_social` — the only scope used. Requesting a scope the app is not approved for fails the whole authorization |
| `LINKEDIN_TOKEN_WARN_THRESHOLD_DAYS` | Days of remaining life that trigger the alert (default 7) |
| `LINKEDIN_AUTO_POST_ENABLED` | Currently `false` — nothing publishes on its own |

Token read path: `getAccessToken()` prefers the row in `social_tokens`
(`provider='linkedin'`) and falls back to the env var. The env var is the
bootstrap; from the first reauthorization onwards the database wins.

**When rotating by hand, delete the row** — otherwise the stale database value
beats the new env var:

```sql
DELETE FROM social_tokens WHERE provider = 'linkedin';
```

### Token lifecycle (NOT auto-refreshed)

Member tokens last **60 days**. Unlike Instagram, they **cannot be renewed
programmatically**: LinkedIn issues refresh tokens only to approved Marketing
Developer Platform partners ([docs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens)),
and this app is not one. Every ~60 days a human must reauthorize.

So the goal here is not automation, it is **never being surprised**:

1. `linkedin_check_token` runs daily at 06:00 and introspects the live token.
2. It throws — which makes the scheduler send the failure alert — when the token
   is expired/revoked, or when fewer than `thresholdDays` remain.
3. Someone opens Panel → LinkedIn and clicks **Reautorizar** (one click).
4. The callback stores the new token in `social_tokens` with its real expiry.

Introspection uses `POST /oauth/v2/introspectToken`, which authenticates with the
*app* credentials rather than the token's scopes — so it works even though the
token only carries `w_member_social`, and it returns the exact `expires_at`.

### Why the check job had to exist

The token expired sometime before **11-jun-2026**. That day a manual publish
died with `401 EXPIRED_ACCESS_TOKEN` (serviceErrorCode 65602) and the channel
stayed down, unnoticed. The last successful post was **3-may-2026**.

Nothing caught it because **no automated code path exercised the token**.
`linkedin_update_metrics` runs four times a day, but `getOrgPostMetrics` returns
early when the author URN is not an organization — and it is a personal profile.
It never issued a single HTTP request. That is a worse blind spot than the
Instagram outage, where the job at least called the API and swallowed the error.

This is also why the metrics job is *not* the place to detect this: with a
personal-profile author it is a structural no-op. If the author ever moves to an
organization page, metrics start working and `updateMetrics()` will surface auth
failures too (it now aborts the loop and rethrows on `LinkedInAuthError`).

## Error handling

`LinkedInAuthError` (in `lib/linkedin.ts`) marks a 401 — token expired, revoked
or invalid. Retrying does not help; reauthorizing does. It aborts loops instead
of failing once per item: before this, one publish attempt with a dead token
produced **eight** error lines (one 401 per carousel slide, one for the post,
two cascades). Now it stops at the first.

Only 401 counts as an auth problem. A 403 is usually a missing scope, which
reauthorizing with the same scopes would not fix, so it must not trigger the
token alert. Non-auth upload failures still fall back to ARTICLE mode — a
transient image problem should not block the post.

### Before the first reauthorization works

In the LinkedIn Developer Portal, the app must list the exact redirect URL under
Auth → Authorized redirect URLs:

```
https://impactoindigena.news/api/linkedin/oauth/callback
```

The exchange fails without it. The app also needs the product that grants
`w_member_social` (Share on LinkedIn).

## OAuth reauthorization flow

The callback (`GET /api/linkedin/oauth/callback`) is **public by necessity**: the
browser arrives via LinkedIn's redirect, without the `Authorization` header that
admin routes require (sessions are JWT Bearer, not cookies).

What protects it is a **signed `state`** (`lib/linkedinOAuthState.ts`): HMAC over
the client secret, 10-minute TTL, issued only to an authenticated admin. Without
it, anyone could redeem their own code and leave the site posting to their
account. The state is verifiable on its own, so nothing is persisted; the
trade-off is that it is not single-use within its window, which is acceptable
because the window is minutes and reuse only repeats an authorization the same
admin just started.

The request logger in `app.ts` redacts `code` and `state` on any `/oauth/` URL —
authorization codes are short-lived credentials and logs get downloaded to debug.

## Jobs

| Job | Cron | Enabled | Purpose |
|-----|------|---------|---------|
| `linkedin_update_metrics` | `0 */6 * * *` | yes | Engagement metrics. No-op for personal-profile authors |
| `linkedin_check_token` | `0 6 * * *` | yes | Introspects the token; alerts before it lapses |

## Admin API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/linkedin/posts` | List posts (paginated, filter by status) |
| `GET` | `/api/admin/linkedin/posts/:id` | Single post |
| `POST` | `/api/admin/linkedin/posts/generate` | Generate draft from a story |
| `PUT` | `/api/admin/linkedin/posts/:id` | Edit draft text (accepts `draft` and `failed`) |
| `POST` | `/api/admin/linkedin/posts/:id/publish` | Publish (accepts `draft` and `failed`) |
| `DELETE` | `/api/admin/linkedin/posts/:id` | Delete record (DB only) |
| `POST` | `/api/admin/linkedin/metrics/refresh` | Refresh metrics now |
| `GET` | `/api/admin/linkedin/token/status` | Token health. Never returns the token |
| `POST` | `/api/admin/linkedin/token/authorize` | Returns the authorization URL with a signed state |
| `GET` | `/api/linkedin/oauth/callback` | Public callback. Redirects to the panel with `?auth=...` |
