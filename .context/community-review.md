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

**Score** (`gate_score`, orders the editor queue): 3 confrontation frame · 2 any Lista A term · 1 **B+B** · 0 learning mode only.

**B+B** (director's decision, 2026-10-11): with no Lista A term and no confrontation frame, two Lista B terms from **different families** corroborate each other (reason `listB+B:<term>`, score 1, bulk-releasable). Families (`FAMILIAS_B` in `gate.ts`): `fuerza` (operations, protocol 7.3.2), `justicia` (prosecutors, courts, criminal process, 7.3.8), `contexto` (everything else). Two `contexto` terms do not corroborate. Chosen by measurement over 1,842 texts with every candidate judged against the protocol: 34 extra holds, 31 pertinent (91 %); nine fine families with any pair gave 98 and 41 noise. Numbers and the rejected variants: `server/eval/README.md`.

**`GATE_VERSION`** (`gate.ts`): hash of both lists, the acronym length and the B+B families. Changing any of them re-evaluates machine rows only (B+B moved it from `9ce02db75908` to `57bad3d4ed9d`, so the first reconciler run after the deploy re-evaluates every machine row in both verticals; human rows are untouched).

## Reconciler

Job `reconcile_community_reviews`, hourly at :17, **seeded disabled**. Per vertical under review: creates missing rows, re-evaluates stale machine rows (list version, text source or learning mode changed, or story edited after evaluation), deletes machine rows whose story no longer matches, never touches `released`/`held`. Idempotent. Throws on error so it lands in `job_runs.lastError`.

## Initial load

`npm run migration:backfill-reviews --prefix server` simulates: baseline per vertical (same `where` as the page), configured and effective mode, what the gate would hold with **both** text variants, with and without learning mode, top reasons, and the stories with most reasons. `:apply` runs the reconciler on verticals not in `off`, logs to `.migraciones-log/`, and checks the public total did not change in shadow.

## Editor API (`/api/admin/reviews`)

`server/src/routes/admin/reviews.ts` → `services/communityReviewDecisions.ts`. Admin and editor decide; **only admin changes the mode** (`requireRole('admin')` on the route).

| Endpoint | What |
|---|---|
| `GET /` | Verticals under review (mode ≠ off) with `communityReviewStats` each, plus `learningMode` and `bulkReleaseMaxScore` |
| `GET /:slug?state=&page=&pageSize=` | The queue: ordered by `gateScore desc`, then the **story's** `datePublished desc`, then `id` (the row's `published_at` is null while pending, so ordering by it was random within a score; fixed 2026-10-06 in `12bd992`). Each row with the story and `alsoIn` (same story in other verticals) |
| `GET /:slug/stats` | «hoy se ven N · si aplicaras, M», counts by state, `missingRows`, queue age. **While learning mode is on, M is a projection** (`visibleIfEnforcedProjected: true`): auto + released + pending rows with `gateScore = 0`, i.e. what the gate would not hold without learning mode. The real enforce `where` would give 0 (every machine row is pending), which is what the director saw on 2026-10-06 |
| `GET /:slug/mode-preview?mode=` | Exact number of stories that would be hidden, **before** changing anything. Reads only |
| `PUT /:slug/mode` | Upserts `community_review_modes`. **409** to `enforce` while learning mode is on. Leaving `off` runs the reconciler so the queue exists at once |
| `POST /:slug/decide` | `{ storyId, decision: release·hold·reopen, code?, note? }`. `hold` requires `code` ∈ `sensitive` · `out_of_scope` (400 otherwise). `reopen` returns the row to the machine state (`auto` if `gate_decision = auto_publish`, else `pending`) and clears the human fields |
| `POST /:slug/bulk-decide` | Same, for up to 500 ids. **Bulk `release` is refused (409, with the ids) if any selected row has `gateScore > BULK_RELEASE_MAX_SCORE` (1)**: strong signals are released one at a time. Bulk `hold` is always allowed. Returns the real `updateMany` count and the ids with no row (`missing`) |

**Audit.** Every decision writes `audit_log` (`community_review.release|hold|reopen|mode`) with slug, story, `from`/`to`, gate score and reasons, code and note; bulk writes one row per story via `writeAuditLogs` (`createMany`). Both are fire-and-forget: a failed audit never blocks the decision. Since the same change, the four manual status routes in `admin/stories.ts` (`PUT /:id/status`, `POST /bulk-status`, `/:id/publish`, `/:id/reject`) audit `story.status` / `story.bulk_status` with the previous status read before writing.

## Editor screen (`/admin/revision`)

`client/src/pages/admin/ReviewsPage.tsx`, menu «Contenido › Revisión por marca». State in the URL (`?marca=&estado=&page=&open=`). One tab per vertical under review; a `role="status"` strip with the effective mode and «hoy se ven N · si aplicaras, M»; counters by state; the queue (score, then date) with gate reasons as badges and «también en:»; per-row and bulk Liberar/Retener; `ReviewDetailPanel` (EditPanel) with the triggering terms highlighted in the summary and the previous decision; `ReviewHoldDialog` requires a code. **Bulk release is disabled in the UI when any selected row has `gateScore > bulkReleaseMaxScore`** (the server refuses it too). Only an admin sees the mode selector (`ReviewModeControl`), which previews the exact number hidden before confirming; `enforce` is disabled while learning mode is on. Labels: `client/src/lib/review-labels.ts`; gate reasons are shown with the word as it appears in the story (`terminoVisible`: list stems like `desaloj` → «desalojo», acronyms upper-cased), and the summary highlight (`marcarTerminos`) mirrors the gate's matcher (word prefix, whole-word acronyms, multi-word sequences, diacritics ignored). The dashboard's integration-health panel lists each vertical's pending/held and the queue age.

## Keywords and queue age (Tanda B, item 15)

`PATCH /api/admin/communities/:id` accepts `keywords: string[]` (1–40, each 2–60 chars, deduplicated case-insensitively). It writes `audit_log` `community.keywords` with `from`/`to`, and if the vertical is under review runs `reconcileCommunityReviews({ force: true })` for it at once. `communityReviewStats` returns `oldestPendingAt/Hours` and `queueAlert` (true when the oldest pending exceeds `config.gate.queueAlertHours`, env `REVIEW_QUEUE_ALERT_HOURS`, default 48, **and learning mode is off**: with learning mode on everything is pending by design). **Queue age is measured from the row's `created_at`**, when the story entered the queue. Until 2026-10-11 it used `published_at ?? gate_evaluated_at`, and the reconciler rewrites `gate_evaluated_at` on every list change: a week-old queue looked brand new after each gate update and the alert switched itself off. A row the reconciler deletes and later recreates (keywords changed) starts over, which is correct: the story re-entered the queue. `GET /api/admin/integration-health` carries `communityReviews.verticals[]` with the same fields.

## Turning learning mode off (Tanda C)

Director's decision, 2026-10-11, «ambos»: by date **and** with data. `learningExitCriteria(communityId)` in `communityReview.ts`, returned as `stats.learningExit` and shown at `/admin/revision` (`LearningExitPanel`) only while learning mode is on. Three conditions, all required, each with its number:

| Condition | How it is computed | Config (env) |
|---|---|---|
| Two weeks under review | First row of the vertical (`MIN(created_at)`, the shadow backfill: 4-oct 19:46 UTC for Mapuche) + 14 days → 18-oct | `GATE_LEARNING_EXIT_MIN_DAYS` (14) |
| One week with the queue up to date | No row waited more than `queueAlertHours` without a human decision. Up to date since the last overdue row was decided (`MAX(reviewed_at)` where `reviewed_at > created_at + 48 h`), or since the start if none ever was; not up to date if a pending row is overdue now | `GATE_LEARNING_EXIT_WINDOW_DAYS` (7) |
| ≥ 9 of 10 score-0 stories released | Human decisions in the window on rows with `gate_score = 0` (the ones the gate would let through on its own): released ≥ 90 % of released + held, **and at least 10 decisions** («9 of 10» needs 10 to mean anything). Compared in integers, not floats | `GATE_LEARNING_EXIT_SCORE0_RATIO` (0.9), `GATE_LEARNING_EXIT_SCORE0_MIN` (10) |

Counts use each row's **current** state. «Entered the queue» is `created_at`, which the machine upsert resets when a row goes from `auto` to `pending` and a human «reopen» resets when the row goes back to `pending` from `released`/`held`; a row that stays `pending` keeps it. One query; verified against a local PostgreSQL 18 with the session in `America/Santiago`, and the upsert transitions verified the same way. It informs and blocks nothing: learning mode is turned off in Azure (`GATE_LEARNING_MODE=false`).

**Known limits** (adversarial review, 2026-10-11; none fixable without a migration, all narrow): an overdue `pending` row that the reconciler deletes (its story left the vertical) leaves no trace, so the queue can read as up to date when it briefly was not; and if the publish hook fails and the reconciler creates the row later, the wait is undercounted by up to one reconciler interval (an hour).

## Autopost (Tanda C)

Director's decision, 2026-10-11: autopost excludes what a vertical in `enforce` does not show. `findAutoPostCandidates` (`services/socialMedia.ts`) drops every id returned by `withheldInEnforcedVerticals` before asking the channels or the LLM. That function returns, per vertical whose **effective** mode is `enforce`, the candidate stories that belong to it (`membershipWhere`, the page's `where`) and have no `auto`/`released` row: pending, held, or still without a row (closed by default, same as the page). With learning mode on it returns nothing without querying (no vertical can be in effective enforce). **It fails closed**: if the modes cannot be read it withholds every candidate and that autopost run is skipped, the opposite of `getReviewMode` (which reads errors as `off` so the page never empties), because a post can wait for the next run and a held story on six channels cannot be taken back. `jobs/blueskyAutoPost.ts` is legacy and not registered in `handlers.ts`; the only automatic path is `social_auto_post`.

## Switching on (director)

1. Apply the SQL; `db:migrate:resolve`. It is inert (no mode rows → everything `off`), so it is safe **before** the deploy, and doing it first avoids one failed query per vertical page view (Postgres logs a `relation does not exist` ERROR for each while the code runs without the tables; the app itself reads `off` and serves normally). 2. Deploy the code. 3. Simulate the backfill: baseline numbers. 4. `INSERT INTO community_review_modes (community_id, mode) SELECT id, 'shadow' FROM communities WHERE slug IN ('mapuche','wallmapu-araucania') ON CONFLICT (community_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = CURRENT_TIMESTAMP;` 5. Choose the text source; `:apply`. 6. Enable the reconciler job. 7. Work the queue in shadow at `/admin/revision`. 8. Turn learning mode off when the panel says the director's criterion is met (above). 9. Vertical to `enforce`; redeploy the frontend so the prerendered vertical page refreshes.

## Not covered here

Brand domains and per-domain SEO (D3). Per-brand relevance (D5). Per-vertical permissions. «grupo mapuche» in the singular as a Lista A term (measured 2026-10-11, recommendation «do not include», awaits the director).
