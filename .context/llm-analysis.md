# LLM Analysis Pipeline

The analysis pipeline uses LangChain + OpenAI to evaluate story relevance through three stages. All stages use `withStructuredOutput` + Zod schemas for reliable parsing. Schema `.describe()` annotations carry format guidance (including Markdown instructions for longer text fields), so prompts use declarative constraints rather than procedural step-by-step instructions.

## Model Configuration

Configuration is centralized in `server/src/config.ts`. Three model tiers are available:

| Tier | Default Model | Reasoning Effort | Used By |
|------|--------------|-----------------|---------|
| Small | `gpt-5-nano` | `medium` | Reclassification (issue + emotion only) |
| Medium | `gpt-5-mini` | `medium` | Pre-assessment (includes issue assignment) |
| Large | `gpt-5.2` | `medium` | Full assessment, selection, podcast script |

Environment variables:
- `OPENAI_MODEL_SMALL` — default `gpt-5-nano`
- `OPENAI_MODEL_MEDIUM` — default `gpt-5-mini`
- `OPENAI_MODEL_LARGE` — default `gpt-5.2`
- `LLM_DELAY_MS` — rate limit delay between calls (default 1000ms)

## Prompts Directory

Prompt templates live in `server/src/prompts/`:

| File | Contents |
|------|----------|
| `shared.ts` | `Guidelines` interface, `buildGuidelinesXml()`, `escapeXml()`, `containsChineseCharacters()` |
| `preassess.ts` | `buildPreassessPrompt()` — batch screening + issue classification |
| `reclassify.ts` | `buildReclassifyPrompt()` — issue + emotion reclassification (no rating) |
| `assess.ts` | `buildAssessPrompt()` — full analysis |
| `select.ts` | `buildSelectPrompt()` — editorial curation |
| `podcast.ts` | `buildPodcastPrompt()` — podcast script generation |
| `index.ts` | Barrel re-exports all builders and types |

## Schema-Driven Format Guidance

The Zod schemas in `server/src/schemas/llm.ts` use `.describe()` to tell the LLM how to format each field. Key format decisions:

- **Markdown output**: `factors`, `limitingFactors`, `relevanceCalculation`, and `relevanceSummary` use Markdown with bold labels (e.g., `**Factor name:** explanation`)
- **Plain text**: `summary`, `quote`, `relevanceTitle`, `marketingBlurb` remain plain text
- **Emotion tags**: The five emotion definitions are embedded in the schema description

## Subject and Geography Are Two Axes

`Story.issueId` holds the **subject**; `Story.countryFocus` holds the **country** (ISO 3166-1 alpha-2, or null). A story belongs to its subject section through the issue and to a geographic section through the country, so it can appear in both.

Before 2026-08-16 the country was just another issue, competing for the same single slot: a Chilean story about land rights landed in Chile Intercultural and vanished from Derechos Indígenas. Measured across the 2000 published stories, **94 carried Chilean markers while sitting in other sections, absent from their own**, and the 367 inside Chile Intercultural had no subject at all.

Rules that keep this working:

- **The classifier never sees geographic issues.** `GEOGRAPHIC_ISSUE_SLUGS` (in `lib/country-focus.ts`) is filtered out of the `<ISSUES>` block. Offering a country-shaped option while instructing the model to classify by subject is a contradiction, and GPT-5 models burn reasoning tokens reconciling contradictions rather than ignoring one.
- **Country normalization is code, not prompt.** The model answers with a name ("Chile"); `normalizeCountry()` maps it to `"CL"` and rejects non-countries ("global", "América Latina", "Amazonía"). Same lesson as the title guardrail: a binary rule belongs in code.
- **Unrecognized means null, and null is fine.** Most articles are regional or global. A wrong country files a story under another nation; no country merely leaves it out of its own section. Prefer not marking.
- **Section membership lives in one place**: `buildIssueCondition()` in `services/story.ts`. It already had two paths (own issue, feed issue); the country is a third.

Backfill for stories predating the split: `npm run migration:backfill-country --prefix server` (simulation by default).

## No Topic Is the Fallback Bin

The four subject topics are Cambio Climático, Derechos Indígenas, Economías Indígenas and — since 2026-09-01 — Cultura y Conocimientos Ancestrales. The fifth issue, Chile Intercultural, is geographic and the classifier never sees it.

Culture was added because the pipeline was already collecting that material and had nowhere to file it. `preassess.ts` explicitly rates language, art, literature, archaeology and heritage at 5 or above, but the classifier was offered only three destinations, and Economías Indígenas was the one whose stored criteria admitted anything: its first criterion read *"Impacto económico **y social** en comunidades indígenas"*. Measured on 2026-09-01 over the 200 most recent stories in that section: **62 were economic, 31 borderline, 107 were not** — poetry, museums, powwows, film, sport.

Rules that keep this from happening again:

- **Economics requires the economic activity to be the central subject.** Selling something is not enough. A food festival, an art fair or a museum show is culture, even with ticketing and crafts on sale. `CLASSIFICATION_BLOCK` states this as a cut rule, not as a hint.
- **Nothing is the destination by default, and Economías least of all.** An article that fits none of the four goes to Derechos Indígenas, the most general one. This is written into the prompt because a taxonomy with no declared fallback grows one by itself, and it picks the loosest description.
- **The stored criteria reach the classifier.** `formatIssuesBlock()` sends `Issue.evaluationCriteria` into the prompt, so editing that DB field changes classification behavior. It is prompt surface, not just reader-facing copy.
- **Reclassification carries the same rules.** `buildReclassifyPrompt()` includes `CLASSIFICATION_BLOCK`. Until 2026-09-01 it did not: the tool for fixing wrong topics ran without the criteria that define the right one.

Migrations: `npm run migration:seed-cultura --prefix server` creates the topic and tightens Economías; `npm run migration:retema --prefix server` re-files existing stories. Both simulate by default.

## Title Capitalization Guardrail

Titles go through `fixCapitalization()` (`server/src/lib/title-capitalization.ts`) before they are persisted. It is a deterministic whitelist of acronyms and proper nouns — no LLM involved — applied at both write points: `services/analysis.ts` (Spanish) and `services/translation.ts` (English).

It exists because a `.describe()` is a **soft** constraint. Reinforcing the schema rule on 2026-08-10 had a measured effect of zero: 12% of titles kept shipping `en chile`, `estudio de ufal`. Binary rules need code, not instructions.

Two traps when working on this file:

- **Word boundaries must be Unicode-aware.** JavaScript's `\b` treats accented vowels as non-word characters, so entries ending in one (`Perú`, `Canadá`) never matched. Use the `NOT_LETTER_BEFORE` / `NOT_LETTER_AFTER` lookarounds, never `\b`.
- **Never measure the guardrail with its own whitelist.** Running `fixCapitalization()` over published titles to count what's still broken always returns zero — a whitelist can only miss terms it doesn't know. Measure the whole defect class instead: acronyms and place names in lowercase, listed or not.

## Translation Guardrail

`services/translation.ts` translates the six display fields (`titleLabel`, `title`, `summary`, `quote`, `marketingBlurb`, `relevanceSummary`) into `*En` columns right after publish (`jobs/publishStories.ts`). Two defenses, both added 2026-10-12 after measuring on the public API that 3131 of 3958 published stories had `title_en` identical to `title`:

- **Output fields are named differently from the input fields** (`titleEn`, never `title`), and the translator gets its role through a `SystemMessage`. From 2026-05-10 (`a1a2a73`, `functionCalling` forced for Azure compatibility) to 2026-10-12 the schema reused the input names and gpt-4o-mini filled the function by copying the Spanish values. Reproduced live on 3 stories: 3/3 copies with the same names, 0/3 with `*En` names plus the system message. `functionCalling` stays; what changed is what the model receives.
- **Deterministic copy check at the write point, decided by the summary.** If `summaryEn` equals the Spanish `summary` (case- and whitespace-insensitive), nothing is written and `TranslationUnchangedError` is thrown, whether or not the title came back translated; `translateStoriesBatch` counts it as failed and the site falls back to Spanish, which is what was already happening. A title identical on its own does **not** reject (2026-10-20): a title made of proper nouns ("Tapati Rapa Nui 2026") is legitimately the same in both languages, and until then it sank the whole story, translated summary included. A 2-3 sentence summary is never legitimately identical, so it is the discriminator; a story with no summary has nothing to discriminate with and passes. `titleLabel` is exempt for the same reason ("COP30"). The error still names every copied field (`fields`), which the backfill prints per story.

The unit test mocks the LLM, so it cannot catch the model copying; only the write-point check can. Backfill of the 290 untranslated and the copied ones: `npm run translations:backfill` (dry run, no model calls) then `npm run translations:backfill:apply`, optionally `-- --limit N` or `-- --limit=N`. The backfill uses the same summary-based criterion to decide what counts as a copy. `--limit` is parsed by `lib/cli-args.ts` (`parseLimitArg`): no value, or anything that is not an integer ≥ 0, aborts before the database is opened. Until 2026-10-20 `--limit=20` or `--limit veinte` silently meant "no limit".

## Publication Date and Year Guardrail (2026-10-25)

Measured on 2026-10-25 over all 4686 published stories (`/api/stories`, 47 pages of 100): 78 name a year later than their publication year somewhere in `title`, `summary` or `relevanceSummary`. 77 are legitimate (a 2027 budget, an election, a 2024-2038 plan, "Se planeó un panel en 2027"). One is not: `argentina-aprobo-ley-que-facilita-desalojos-expres-a-indigenas`, published 2026-10-25 from a source dated 2026-10-23, whose `summary` and `relevanceSummary` open with "En 2027, la Cámara de Diputados aprobó…". The source's own dateline carries the typo ("23 de octubre de 2027") and the model took it; it had nothing to check it against.

Two causes, two fixes:

- **The prompt gave a fresh story no date at all.** `<TEMPORAL_CONTEXT>` existed only for stories 3+ months old. It is now always present (`prompts/assess.ts`): today's date; the feed's publication date when known, which the model is told overrides anything the body says and to return unchanged as `publicationDate`; and the past-tense / year instructions only when the age warrants them, as before. `buildAssessPrompt` takes `now` so tests can pin the date.
- **The model's `publicationDate` overwrote `sourceDatePublished`**, so the typo could be stored as the source date. `parseLlmPublicationDate()` (`lib/future-year.ts`) rejects any date after today (one day of tolerance) in addition to the `1970` sentinel. Whether an LLM-read date should ever override a feed-provided date at all is an open design question; today it still does when the date is plausible.

**Deterministic guardrail at the write point** (`assessStory`, `rescoreStory`): `stripImpossibleHistoricalYear()` removes the leading historical marker "En AAAA, " from a sentence that narrates in the preterite with no future verb, when AAAA is later than the reference year (feed date, else the accepted LLM date, else today). That is exactly the template the prompt teaches for old stories ("En 2023, líderes mapuches firmaron…"), and a preterite placed in a future year is impossible by construction. It touches nothing else on purpose: the trailing form "… en 2027" dates the object rather than the verb, and all 11 live cases of it were legitimate (two of them with a preterite: "invitó a … impulsar al partido Morena en 2027"); edition and budget years ("presupuesto 2027", "Plan 2024-2038", "Amazônia 2030") are never touched. Calibrated against the 78 live cases, it would change exactly the two Argentine fields and nothing else. Every stripped field is logged (`stripped an impossible historical year`), and whatever still names a later year is logged too (`analysis names a year after the publication year`), so the residue is measured in the logs instead of discovered on the site.

Limit of the measurement: it only sees years *later* than publication. A wrong *earlier* year ("En 2024, …" for a 2026 event) is invisible without reading the source and is not covered.

## Shared Batch Classification

Both pre-assessment and reclassification use `runBatchClassification()` in `analysis.ts` — a generic helper that handles DB fetching, issue slug resolution, batching, semaphore-gated concurrent LLM calls, progress reporting, and DB transaction writes. Callers provide the LLM instance, schema, prompt builder, and an update function that determines which fields to write per story. The `fallbackToFeedIssue` option controls whether stories omitted from the LLM response get their `issueId` overwritten to the feed default (enabled for pre-assessment, disabled for reclassification to preserve existing assignments).

## Analysis Stages

### 0. Reclassification (Batch, Non-destructive)

Re-runs issue classification and emotion tagging without changing ratings or status. Uses the small model. Triggered manually via the admin bulk "Reclassify" action. Does not overwrite any fields for stories the LLM omits from its response.

**Zod schema**: `reclassifyResultSchema` — array of `{ articleId, issueSlug, emotionTag }`

**Use case**: Fix misclassified issues or update emotion tags after issue definitions change, without re-running the full pipeline.

### 1. Pre-assessment (Batch)

Screens multiple stories per LLM call (10 per batch, fewer for Chinese text). `formatArticlesBlock()` spends a budget of `preassess.batchSize`: each article costs 1, or 1.5 if its content has Chinese characters, and goes in only if its cost fits in what is left; one that doesn't fit is left for the next pass. Until 12-oct-2026 the cost was subtracted before comparing with `> 0`, so the 10th article of every full batch never reached the model. In a single call, the LLM classifies each story into the most relevant issue, assigns a conservative rating (1-10), and assigns an emotion tag. Uses the medium model with medium reasoning effort. All stories are batched together regardless of issue — pre-assessment uses only the generic rating scale (1-10 impact criteria), not issue-specific guidelines. Falls back to `story.feed.issueId` if the LLM returns an invalid issue slug.

**Failed batches** (shared by pre-assessment, reclassification and emotion tagging, in `runBatchClassification`): a batch the API rejects with a 400 is about its content and `withRetry` does not retry it, so it is retried story by story; the others pass and the one that fails is logged as `story failed on its own` with its `storyId`. Any other failure logs `batch failed` with the batch's `storyIds`. The known 400 was `Invalid body: failed to parse JSON value`: truncating with `substring` can split an emoji and leave half a surrogate pair, which `JSON.stringify` writes as `\ud83d` and Azure rejects. `sanitizeUntrustedContent()` replaces lone surrogates with U+FFFD, and every crawled text goes through it after truncation (preassess, assess, brand lane). Until 13-oct-2026 one such story sank its batch of 10 in every pass.

**Zod schema**: `preAssessResultSchema` — array of `{ articleId, issueSlug, rating, emotionTag }`

**Threshold**: Only stories rated >= 3 proceed to full assessment.

**Precedence**: Downstream code (assessStory, podcast, RSS feeds) uses `story.issue ?? story.feed.issue`.

### 2. Full Assessment (Individual)

Detailed analysis of a single story. Produces structured fields covering relevance factors, limiting factors, ratings, summary, title, and marketing blurb. Uses the large model with medium reasoning effort.

**Zod schema**: `assessResultSchema` — the largest schema, with detailed `.describe()` annotations guiding Markdown format for analytical fields.

### 3. Selection (Batch)

Takes all recently analyzed stories, formats them as XML with their AI metadata, and asks the LLM to select the top 50% by comparing articles directly. Uses the large model (important final curation step) with medium reasoning effort.

**Zod schema**: `selectResultSchema` — `{ selectedIds: string[] }`

## Issue-Specific Guidelines

Each Issue (topic category) has three prompt sections stored in the database:
- `promptFactors` — relevance factors specific to this topic
- `promptAntifactors` — topic-specific limiting factors
- `promptRatings` — rating criteria (1-10 scale definitions)

These are injected into prompt templates as `<FACTORS>`, `<TOPIC-SPECIFIC LIMITING FACTORS>`, and `<CRITERIA>` XML sections. They are used only in full assessment (stage 2), not in pre-assessment.

## Modifying Prompts or Output Format

To change prompts: edit the relevant file in `server/src/prompts/`. To change output format: update both the prompt AND the Zod schema in `server/src/schemas/llm.ts`. The schema `.describe()` annotations directly affect LLM output format.

See `.context/prompting.md` for GPT-5 prompt design principles that must be followed when modifying prompts.

## Key Files

| File | Role |
|------|------|
| `server/src/config.ts` | Centralized config: model names, reasoning effort, rate limits, batch sizes |
| `server/src/services/llm.ts` | LLM client: `getSmallLLM()`, `getMediumLLM()`, `getLargeLLM()`, rate limiting |
| `server/src/prompts/` | Prompt builders (shared, preassess, assess, select, podcast) |
| `server/src/services/analysis.ts` | Orchestration: runBatchClassification, preAssessStories, reclassifyStories, assessStory, selectStories |
| `server/src/schemas/llm.ts` | Zod schemas with `.describe()` format guidance for all LLM output |


## Guardrail on the classification enums (2026-10-12)

`withStructuredOutput` validates the whole batch against the Zod schema, so one
article with a value outside the enum used to throw an `OutputParserException`
and send the other nine back to `fetched` for the next pass. Measured in
production on 2026-10-12: 888 of 889 pre-assessment batches failed on
`narrativeFrame: "calm"` (the emotion-tag default, copied into the frame for
stories that are not about indigenous peoples), the `fetched` queue reached
8,882 stories and each run re-sent all of them five times. Nothing alerted,
because `Promise.allSettled` swallowed the batches and the job completed.

Two locks, both in code (the prompt instruction is soft and stays soft):

- `schemas/llm.ts`: `EMOTION_TAG_SCHEMA` is `.catch("calm")` and
  `NARRATIVE_FRAME_SCHEMA` is `.nullable().catch(null)`. zod-to-json-schema
  unwraps the catch, so the model still receives the full enum (plus `null` as a
  legal "none applies"); invalid values are corrected at write time. `batch
  complete` logs `noFrameCount` per batch.
- `jobs/preassessStories.ts`: if the first pass lets through fewer than half the
  stories, or the first pass makes no progress at all, the job throws **after**
  persisting what it could, so `lastError`, the panel badge and the failure alert
  fire. Stragglers that never come back right in a later pass (on 2026-10-12, 10 of
  4,145 in one batch Azure rejected with a 400) only log a warning.

`rating` stays strict: a missing rating still fails its batch.

The job also only takes `fetched` stories crawled in the last
`PREASSESS_MAX_AGE_DAYS` days (14, `config.preassess.maxAgeDays`). In steady state
the queue drains every six hours and the window is invisible; it exists so that
the backlog left by the parser failure is not pushed to assess and the front page
as if it were today's news.
