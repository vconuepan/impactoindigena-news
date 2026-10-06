# Community review (retención por vertical, D4)

> Spec: `.specs/story-pipeline.allium`, regla `CommunityReview`. Diseño completo y decisiones: `.plans/2026-10-04_retencion-por-vertical.md`.

A story can be published on Voces Indígenas (the main site) and **held** in a vertical (Voces Mapuche, Voces Araucanía) until an editor releases it. `Story.status` is untouched: it stays the switch for the main site and its ~100 readers. Retention lives in two new tables.

## Tables

| Table | One row per | Notes |
|---|---|---|
| `community_review_modes` | vertical | `mode` ∈ `off` · `shadow` · `enforce`. **No row = `off`.** Separate table on purpose: adding a column to `communities` would break `prisma.community.findMany()` if code shipped before the SQL. |
| `story_community_reviews` | (story, vertical) | Machine fields `gate_*` are rewritten on re-evaluation. `review_state` ∈ `auto` · `pending` (machine) · `released` · `held` (human). **The machine never overwrites a human decision**: every machine write is `ON CONFLICT … WHERE review_state IN ('auto','pending')`. `published_at` is set once and never reset. Timestamps written by raw SQL are converted explicitly to UTC (`AT TIME ZONE 'UTC'`), like Prisma's own writes, so the reconciler's `stories.updated_at > gate_evaluated_at` comparison does not depend on the database session time zone. |

Migration: `server/prisma/migrations/20261004000000_add_story_community_reviews/`. The director applies it; deploy does not.

## What a vertical shows

One function decides it: `publicCommunityWhere({ community, temas, mode, learningMode })` in `server/src/lib/communityVisibility.ts`. All three arguments are mandatory.

| Effective mode | Vertical shows |
|---|---|
| `off` | Today's rule: published, relevance ≥ 3, community keywords (`buildCommunityCondition`) |
| `shadow` | Today's rule **minus** rows a human `held` |
| `enforce` | Today's rule **and** a row in `auto` or `released`; no row = invisible (fail-closed) |

`effectiveMode`: `enforce` with `config.gate.learningMode` on degrades to `shadow` (learning mode holds 100%; enforcing would empty the vertical). `getReviewMode` never throws: any error, including a missing table, reads as `off`.

**All five consumers use it** (Tanda B, 4-oct-2026): `GET /api/communities/:slug/stories`, `/signals`, the welcome email (`communities.ts`), the community RSS (`feed.ts`) and the weekly digest (`sendCommunityDigest.ts`). Before, the RSS required topic AND keywords and served 44 items where the page showed 389; the welcome email did not require relevance ≥ 3. `lib/community-visibility-contract.test.ts` fails if any public route, job or service composes membership by hand again, and checks that each consumer passes `mode: await getReviewMode(...)` (a hard-coded mode would silently disable retention there). Route-level tests: `feed-review-mode.test.ts`, `sendCommunityDigest-review.test.ts`, `communities-welcome-review.test.ts`, `communities-review-mode.test.ts`.

The RSS is cached (`config.feed.cacheMaxAge`, 15 min): a `hold` reaches the feed with that delay.

## Where the gate runs

`registerCommunityReviews(storyIds)` in `server/src/services/communityReview.ts`. **Never throws** (an error is logged; the main-site publish proceeds). Called from the five paths that leave a story published:

| Path | File |
|---|---|
| Publish job and `POST /api/admin/stories/bulk-status` | `story.ts` `bulkUpdateStatus` |
| Row menu (`PUT /:id/status`) | `story.ts` `updateStoryStatus` |
| Primary button (`POST /:id/publish`) | `story.ts` `publishStory` |
| Edit form status select (`PUT /:id`) | `story.ts` `updateStory` |
| `POST /api/admin/maintenance/republish-slug` | `maintenance.ts` |

Membership is decided with the same `where` as the public page (`membershipWhere`), so what the gate evaluated and what the vertical shows coincide.

**Text evaluated:** `config.gate.textSource` (`GATE_TEXT_SOURCE`, default `short` = title + label + summary; `full` adds the source body). **Director decided `short` on 2026-10-04** (simulation on production: short holds 204/389 Mapuche and 49/107 Araucanía without learning mode; full holds 265 and 62). Recorded per row in `gate_text_source`.

**Score** (`gate_score`, orders the editor queue): 3 confrontation frame · 2 any Lista A term · 1 reserved (two Lista B families, pending director) · 0 learning mode only.

**`GATE_VERSION`** (`gate.ts`): hash of both lists and the acronym length. Changing a list re-evaluates machine rows only.

## Reconciler

Job `reconcile_community_reviews`, hourly at :17, **seeded disabled**. Per vertical under review: creates missing rows, re-evaluates stale machine rows (list version, text source or learning mode changed, or story edited after evaluation), deletes machine rows whose story no longer matches, never touches `released`/`held`. Idempotent. Throws on error so it lands in `job_runs.lastError`.

## Initial load

`npm run migration:backfill-reviews --prefix server` simulates: baseline per vertical (same `where` as the page), configured and effective mode, what the gate would hold with **both** text variants, with and without learning mode, top reasons, and the stories with most reasons. `:apply` runs the reconciler on verticals not in `off`, logs to `.migraciones-log/`, and checks the public total did not change in shadow.

## Editor API (`/api/admin/reviews`)

`server/src/routes/admin/reviews.ts` → `services/communityReviewDecisions.ts`. Admin and editor decide; **only admin changes the mode** (`requireRole('admin')` on the route).

| Endpoint | What |
|---|---|
| `GET /` | Verticals under review (mode ≠ off) with `communityReviewStats` each, plus `learningMode` and `bulkReleaseMaxScore` |
| `GET /:slug?state=&page=&pageSize=` | The queue: ordered by `gateScore desc, publishedAt desc` (index `story_community_reviews_queue_idx`), each row with the story and `alsoIn` (same story in other verticals) |
| `GET /:slug/stats` | «hoy se ven N · si aplicaras, M», counts by state, `missingRows`, queue age. **While learning mode is on, M is a projection** (`visibleIfEnforcedProjected: true`): auto + released + pending rows with `gateScore = 0`, i.e. what the gate would not hold without learning mode. The real enforce `where` would give 0 (every machine row is pending), which is what the director saw on 2026-10-06 |
| `GET /:slug/mode-preview?mode=` | Exact number of stories that would be hidden, **before** changing anything. Reads only |
| `PUT /:slug/mode` | Upserts `community_review_modes`. **409** to `enforce` while learning mode is on. Leaving `off` runs the reconciler so the queue exists at once |
| `POST /:slug/decide` | `{ storyId, decision: release·hold·reopen, code?, note? }`. `hold` requires `code` ∈ `sensitive` · `out_of_scope` (400 otherwise). `reopen` returns the row to the machine state (`auto` if `gate_decision = auto_publish`, else `pending`) and clears the human fields |
| `POST /:slug/bulk-decide` | Same, for up to 500 ids. **Bulk `release` is refused (409, with the ids) if any selected row has `gateScore > BULK_RELEASE_MAX_SCORE` (1)**: strong signals are released one at a time. Bulk `hold` is always allowed. Returns the real `updateMany` count and the ids with no row (`missing`) |

**Audit.** Every decision writes `audit_log` (`community_review.release|hold|reopen|mode`) with slug, story, `from`/`to`, gate score and reasons, code and note; bulk writes one row per story via `writeAuditLogs` (`createMany`). Both are fire-and-forget: a failed audit never blocks the decision. Since the same change, the four manual status routes in `admin/stories.ts` (`PUT /:id/status`, `POST /bulk-status`, `/:id/publish`, `/:id/reject`) audit `story.status` / `story.bulk_status` with the previous status read before writing.

## Editor screen (`/admin/revision`)

`client/src/pages/admin/ReviewsPage.tsx`, menu «Contenido › Revisión por marca». State in the URL (`?marca=&estado=&page=&open=`). One tab per vertical under review; a `role="status"` strip with the effective mode and «hoy se ven N · si aplicaras, M»; counters by state; the queue (score, then date) with gate reasons as badges and «también en:»; per-row and bulk Liberar/Retener; `ReviewDetailPanel` (EditPanel) with the triggering terms highlighted in the summary and the previous decision; `ReviewHoldDialog` requires a code. **Bulk release is disabled in the UI when any selected row has `gateScore > bulkReleaseMaxScore`** (the server refuses it too). Only an admin sees the mode selector (`ReviewModeControl`), which previews the exact number hidden before confirming; `enforce` is disabled while learning mode is on. Labels: `client/src/lib/review-labels.ts`; gate reasons are shown with the word as it appears in the story (`terminoVisible`: list stems like `desaloj` → «desalojo», acronyms upper-cased), and the summary highlight (`marcarTerminos`) mirrors the gate's matcher (word prefix, whole-word acronyms, multi-word sequences, diacritics ignored). The dashboard's integration-health panel lists each vertical's pending/held and the queue age.

## Keywords and queue age (Tanda B, item 15)

`PATCH /api/admin/communities/:id` accepts `keywords: string[]` (1–40, each 2–60 chars, deduplicated case-insensitively). It writes `audit_log` `community.keywords` with `from`/`to`, and if the vertical is under review runs `reconcileCommunityReviews({ force: true })` for it at once. `communityReviewStats` returns `oldestPendingAt/Hours` and `queueAlert` (true when the oldest pending exceeds `config.gate.queueAlertHours`, env `REVIEW_QUEUE_ALERT_HOURS`, default 48, **and learning mode is off**: with learning mode on everything is pending by design). `GET /api/admin/integration-health` carries `communityReviews.verticals[]` with the same fields.

## Switching on (director)

1. Apply the SQL; `db:migrate:resolve`. It is inert (no mode rows → everything `off`), so it is safe **before** the deploy, and doing it first avoids one failed query per vertical page view (Postgres logs a `relation does not exist` ERROR for each while the code runs without the tables; the app itself reads `off` and serves normally). 2. Deploy the code. 3. Simulate the backfill: baseline numbers. 4. `INSERT INTO community_review_modes (community_id, mode) SELECT id, 'shadow' FROM communities WHERE slug IN ('mapuche','wallmapu-araucania') ON CONFLICT (community_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = CURRENT_TIMESTAMP;` 5. Choose the text source; `:apply`. 6. Enable the reconciler job. 7. Work the queue in shadow at `/admin/revision`. 8. Turn learning mode off per the director's criterion. 9. Vertical to `enforce`; redeploy the frontend so the prerendered vertical page refreshes.

## Not covered here

Brand domains and per-domain SEO (D3). Per-brand relevance (D5). Per-vertical permissions. Autopost exclusion of held stories (director's decision).
