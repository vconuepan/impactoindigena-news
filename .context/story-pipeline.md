# Story Pipeline

> **Spec:** [`.specs/story-pipeline.allium`](../.specs/story-pipeline.allium) -- status transitions, stage rules, config thresholds, entity definitions. This file covers implementation details, job schedules, admin endpoints, and field reference.

Stories are the core entity. They flow through a status pipeline from crawling to publication, driven by scheduled jobs and manual admin actions.

## Status Flow

```
fetched → pre_analyzed → analyzed → selected → published
                                  ↘ rejected
                       ↘ trashed
```

### Status Definitions

| Status | Set By | Meaning |
|--------|--------|---------|
| `fetched` | Crawler | Content extracted from RSS feed. Ready for LLM screening. |
| `pre_analyzed` | Pre-assess job | Batch LLM screening assigned a conservative rating (1-10) and emotion tag. |
| `analyzed` | Assess job | Full LLM analysis complete: detailed factors, ratings, summary, blurb, etc. |
| `selected` | Select job | LLM chose this story for publication from the analyzed pool. |
| `published` | Admin action | Live on the public site. |
| `rejected` | Assess job, select job, or admin | Not relevant enough, or manually excluded. |
| `trashed` | Admin action | Soft-deleted. |

**Archive behavior:** Rejected and trashed stories are retained indefinitely as a historical archive. There is no automated cleanup or purging. Admins can review rejected stories via the admin panel and manually re-assess or republish them if needed.

### Transition Rules

- **fetched → pre_analyzed**: Pre-assess job first assigns each story to an issue via LLM (nano model), then groups stories by assigned issue and batch pre-screens them (~10 per batch) using the medium model.
- **pre_analyzed → analyzed/rejected**: Assess job picks stories with `relevancePre >= threshold` (per-issue `minPreRating` or global `fullAssessmentThreshold`, default 5). Stories below threshold are rejected.
- **analyzed → selected/rejected**: Select job takes `analyzed` stories with `relevance >= config.selection.relevanceMin` (default 5). Stories below threshold are rejected. Remaining candidates go through LLM selection (~`config.selection.ratio`, default 50%, rounded up). The rest become `rejected`. When there are more than `config.selection.maxGroupSize` (default 20) candidates, they are split into roughly equal groups and each group is sent to the LLM separately (e.g. 25 stories → 2 groups of 13 + 12).
- **selected → published**: Publish job or manual admin action. The `publish_stories` job publishes all `selected` stories, sets `datePublished` if not already set, and generates a URL slug if the story doesn't have one yet. Embeddings must already exist from the assessment step; `ensureEmbedding()` acts as a safety net for edge cases.
- **Any → trashed**: Admin can trash any story at any time.

### La nota con claves (`story_bodies`, desde el 30-oct-2026)

Plan `.plans/2026-10-25_contenido-propio-y-ficha-con-claves.md`, B1-B4. Al publicar, el job
`publish_stories` llama a `draftStoryBodies()` (`services/storyBody.ts`) **antes** de traducir:
por cada noticia, el modelo (`config.storyBody.modelTier`, `medium`) lee el artículo original
completo (tope `maxSourceChars`, 15.000) con el medio y **siempre una fecha** (la del feed, si no
la de publicación, si no la de rastreo) y redacta bajada + cuatro claves (`prompts/story-body.ts`).
El resultado pasa por `limpiarCuerpo` (quita comillas de una cita no textual, vacía un «qué sigue»
que explica que no hay) y por `revisarCuerpo` (`lib/storyBodyGuards.ts`): cita, cifra, identidad,
pueblo, año futuro, copia de dieciséis palabras, agencia de la bajada y texto «meta» («el artículo…»)
**bloquean**; el largo solo avisa. Tres ajustes medidos en las cuatro primeras franjas (31-oct a
2-nov-2026, 20 de 36 bloqueadas): el día y el año de la fecha que el prompt da al modelo cuentan como
respaldo de cifras (`respaldoConFecha`: 11 de 13 bloqueos eran «cifra:bajada» por esa fecha); la
ventana de copia pasó de 12 a 16 (un nombre oficial con su artículo tiene quince); y «meta» ya no
mira «el informe», «el reportaje» ni «la nota», que son la noticia misma. El año futuro **no** se
quita a mitad de frase (borraría fechas futuras legítimas): una fuente con errata «2027» pierde el cuerpo. **Fallo cerrado:** con un bloqueante no se escribe nada y la ficha sale con el
resumen. Se salta sin llamar al modelo: URL de Google News, original bajo `minSourceChars` (1.200),
`STORY_BODY_ENABLED=false`, tabla ausente (P2021).

Tabla aparte (`StoryBody`, `story_bodies`), no columnas de `stories`: ver `database-migrations.md`
y el incidente del 26-oct con `editorials`. Todo lector tolera que no exista:
`getPublishedStoryBySlug` cae al `select` sin cuerpo. Nace con `method = ia_sin_revision` y
`reviewedBy = ''`; en el panel (`StoryBodySection`, rutas `GET/POST/PUT /api/admin/stories/:id/body`)
el editor corrige y da por revisada (→ `ia_revisada`), y una edición del texto borra la traducción
para que se vuelva a traducir. **Desde el 3-nov-2026 (decisión C7 del director) la ficha pública no
muestra un cuerpo `ia_sin_revision`**: `cuerpoPublico()` en `services/story.ts` lo devuelve como
`null` y la ficha sale con el resumen; `STORY_BODY_PUBLIC_UNREVIEWED=true` lo revierte. El cuerpo se
redacta y se traduce igual, para que revisarlo sea leer y aprobar. La medición que lo decidió, en el
plan (8 quater): 5 de 22 cuerpos con error de hecho que ningún candado ve. El script
`medir-contraste-nota-claves.ts` contrasta cada cuerpo con el original y sirve como lista de lectura
para quien revisa, no como candado. **La cola de revisión** es el filtro «Nota con claves → Por
revisar» de `/admin/stories` (`?bodyMethod=ia_sin_revision`, `where.body = { is: { method } }` en
`buildWhereClause`): con «Publicada» al lado, son las que el lector ve hoy con el resumen. La traducción (`translateStoryBody` en `services/translation.ts`)
corre dentro de `translateStory`, no fatal, con el mismo guardarraíl de copia decidido por `quePaso`.
Rezagadas: `npm run` no tiene atajo; `npx tsx src/scripts/backfill-story-bodies.ts --limit N [--apply]`,
simulación por defecto. Costo medido en A1: US$0,0013-0,0025 por nota.

### Slugs

Stories get a URL slug (e.g. `ai-breakthrough-in-protein-folding`) when they are first published. Slugs are **immutable by default** — changing the title of a published story does not regenerate the slug, preserving existing URLs. Admins can manually edit a slug via the story edit form.

**Generation rules:**
- Created from `title` (falls back to `sourceTitle`) using `server/src/utils/slugify.ts`
- Lowercase, hyphens only, max 80 chars (truncated at word boundary)
- Duplicates resolved by appending `-2`, `-3`, etc. (checked via `generateUniqueSlug()` in `story.ts`)
- Stored as `slug String? @unique` — nullable because unpublished stories don't have one

**Where slugs are set:** `updateStory()`, `updateStoryStatus()`, `bulkUpdateStatus()`, and `publishStory()` in `server/src/services/story.ts` — all check `!story.slug` before generating.

**Public routing:** `/stories/:slug` — the public API and client both use slug-based URLs exclusively.

### Automated Jobs

| Job | Schedule | What It Does |
|-----|----------|--------------|
| `crawl_feeds` | Every 6 hours | Fetches RSS feeds, extracts content, creates stories as `fetched` |
| `preassess_stories` | Configurable | Batch pre-screens the `fetched` stories crawled in the last `PREASSESS_MAX_AGE_DAYS` days (14). Older ones stay `fetched` untouched; throws when the first pass lets through under 50 % |
| `assess_stories` | Configurable | Full analysis on `pre_analyzed` stories with rating >= 3 |
| `select_stories` | Configurable | Selects top ~50% of `analyzed` stories with `relevance >= 5` (both configurable via `config.selection.*`), batched into groups of ≤20 |
| `publish_stories` | Configurable | Publishes all `selected` stories, sets `datePublished` if not already set |

### Manual Admin Endpoints

| Endpoint | Effect |
|----------|--------|
| `POST /api/admin/stories/preassess` | Trigger pre-assessment (optional story IDs) |
| `POST /api/admin/stories/:id/assess` | Trigger full assessment for one story |
| `POST /api/admin/stories/select` | Trigger selection on given story IDs |
| `POST /api/admin/stories/:id/publish` | Set status to `published` |
| `POST /api/admin/stories/:id/reject` | Set status to `rejected` |
| `POST /api/admin/stories/bulk-tag-emotions` | Backfill emotion tags only (no issue reassignment) |

## Key Files

| File | Role |
|------|------|
| `server/src/services/story.ts` | CRUD, filtering, status transitions |
| `server/src/services/analysis.ts` | LLM orchestration (preassess, assess, select) |
| `server/src/jobs/preassessStories.ts` | Scheduled pre-assessment |
| `server/src/jobs/assessStories.ts` | Scheduled full assessment |
| `server/src/jobs/selectStories.ts` | Scheduled selection |
| `server/src/jobs/publishStories.ts` | Scheduled publishing |
| `server/src/routes/admin/stories.ts` | Admin API endpoints |
| `server/src/routes/public/stories.ts` | Public API (published stories only) |

## Story Fields

Stories carry both crawled data and AI-generated analysis:

**Source data** (set during crawl): `sourceUrl`, `sourceTitle`, `sourceContent`, `sourceDatePublished`, `dateCrawled`, `feedId`, `crawlMethod`

**Issue assignment** (set during pre-assessment): `issueId` — the LLM-assigned issue for this story. Set by `assignIssuesToStories()` as the first step of pre-assessment. Falls back to `feed.issueId` if the LLM returns an invalid slug. Downstream code uses `story.issue ?? story.feed.issue` for issue lookup.

**Platform data**: `title` (AI-generated, nullable), `slug` (generated on publish), `datePublished` (set on first publish)

**Pre-assessment fields** (set during batch LLM screening):
- `relevancePre` — conservative rating (1-10), immutable after set
- `emotionTag` — one of: uplifting, frustrating, scary, calm

**Full assessment fields** (set during in-depth LLM analysis):
- `relevance` — single relevance rating (1-10)
- `summary` — 40-70 word summary
- `quote` — key quote with attribution
- `quoteAttribution` — speaker name/title, organization name, or "Original article" for non-quotes
- `marketingBlurb` — up to 230 chars, starts with publisher name
- `relevanceReasons` — detailed factor bullet points (newline-separated)
- `antifactors` — limiting factor bullet points (newline-separated)
- `relevanceCalculation` — rating calculation steps (newline-separated)
