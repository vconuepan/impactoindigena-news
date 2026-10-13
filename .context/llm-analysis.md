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
- **Deterministic copy check at the write point.** If `titleEn` or `summaryEn` equals the Spanish original (case- and whitespace-insensitive), nothing is written and `TranslationUnchangedError` is thrown; `translateStoriesBatch` counts it as failed and the site falls back to Spanish, which is what was already happening. `titleLabel` is exempt on purpose: a short kicker made of proper nouns ("COP30") is legitimately identical in both languages.

The unit test mocks the LLM, so it cannot catch the model copying; only the write-point check can. Backfill of the 290 untranslated and the copied ones: `npm run translations:backfill` (dry run, no model calls) then `npm run translations:backfill:apply`, optionally `-- --limit N`.

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
