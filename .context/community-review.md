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

Consumers using it today: `GET /api/communities/:slug/stories` and `/signals`. Still composing membership by hand (Tanda B, tracked by `lib/community-visibility-contract.test.ts`): community RSS (`feed.ts`), weekly digest (`sendCommunityDigest.ts`), welcome email (`communities.ts`), opendata `community` filter. The contract test fails if a new one appears or if a listed one is fixed and not removed from the list.

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

**Text evaluated:** `config.gate.textSource` (`GATE_TEXT_SOURCE`, default `short` = title + label + summary; `full` adds the source body). Director's decision pending; recorded per row in `gate_text_source`.

**Score** (`gate_score`, orders the editor queue): 3 confrontation frame · 2 any Lista A term · 1 reserved (two Lista B families, pending director) · 0 learning mode only.

**`GATE_VERSION`** (`gate.ts`): hash of both lists and the acronym length. Changing a list re-evaluates machine rows only.

## Reconciler

Job `reconcile_community_reviews`, hourly at :17, **seeded disabled**. Per vertical under review: creates missing rows, re-evaluates stale machine rows (list version, text source or learning mode changed, or story edited after evaluation), deletes machine rows whose story no longer matches, never touches `released`/`held`. Idempotent. Throws on error so it lands in `job_runs.lastError`.

## Initial load

`npm run migration:backfill-reviews --prefix server` simulates: baseline per vertical (same `where` as the page), configured and effective mode, what the gate would hold with **both** text variants, with and without learning mode, top reasons, and the stories with most reasons. `:apply` runs the reconciler on verticals not in `off`, logs to `.migraciones-log/`, and checks the public total did not change in shadow.

## Switching on (director)

1. Apply the SQL; `db:migrate:resolve`. It is inert (no mode rows → everything `off`), so it is safe **before** the deploy, and doing it first avoids one failed query per vertical page view (Postgres logs a `relation does not exist` ERROR for each while the code runs without the tables; the app itself reads `off` and serves normally). 2. Deploy the code. 3. Simulate the backfill: baseline numbers. 4. `INSERT INTO community_review_modes (community_id, mode) SELECT id, 'shadow' FROM communities WHERE slug IN ('mapuche','wallmapu-araucania') ON CONFLICT (community_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = CURRENT_TIMESTAMP;` 5. Choose the text source; `:apply`. 6. Enable the reconciler job. 7. Work the queue in shadow (editor screen: Tanda B). 8. Turn learning mode off per the director's criterion. 9. Vertical to `enforce`; redeploy the frontend so the prerendered vertical page refreshes.

## Not covered here

Editor API and `/admin/revision` screen, audit of decisions, unifying RSS/digest/welcome/opendata (Tanda B). Brand domains and per-domain SEO (D3). Per-brand relevance (D5). Per-vertical permissions. Autopost exclusion of held stories (director's decision).
