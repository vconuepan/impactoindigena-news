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

## Title Capitalization Guardrail

Titles go through `fixCapitalization()` (`server/src/lib/title-capitalization.ts`) before they are persisted. It is a deterministic whitelist of acronyms and proper nouns — no LLM involved — applied at both write points: `services/analysis.ts` (Spanish) and `services/translation.ts` (English).

It exists because a `.describe()` is a **soft** constraint. Reinforcing the schema rule on 2026-08-10 had a measured effect of zero: 12% of titles kept shipping `en chile`, `estudio de ufal`. Binary rules need code, not instructions.

Two traps when working on this file:

- **Word boundaries must be Unicode-aware.** JavaScript's `\b` treats accented vowels as non-word characters, so entries ending in one (`Perú`, `Canadá`) never matched. Use the `NOT_LETTER_BEFORE` / `NOT_LETTER_AFTER` lookarounds, never `\b`.
- **Never measure the guardrail with its own whitelist.** Running `fixCapitalization()` over published titles to count what's still broken always returns zero — a whitelist can only miss terms it doesn't know. Measure the whole defect class instead: acronyms and place names in lowercase, listed or not.

## Shared Batch Classification

Both pre-assessment and reclassification use `runBatchClassification()` in `analysis.ts` — a generic helper that handles DB fetching, issue slug resolution, batching, semaphore-gated concurrent LLM calls, progress reporting, and DB transaction writes. Callers provide the LLM instance, schema, prompt builder, and an update function that determines which fields to write per story. The `fallbackToFeedIssue` option controls whether stories omitted from the LLM response get their `issueId` overwritten to the feed default (enabled for pre-assessment, disabled for reclassification to preserve existing assignments).

## Analysis Stages

### 0. Reclassification (Batch, Non-destructive)

Re-runs issue classification and emotion tagging without changing ratings or status. Uses the small model. Triggered manually via the admin bulk "Reclassify" action. Does not overwrite any fields for stories the LLM omits from its response.

**Zod schema**: `reclassifyResultSchema` — array of `{ articleId, issueSlug, emotionTag }`

**Use case**: Fix misclassified issues or update emotion tags after issue definitions change, without re-running the full pipeline.

### 1. Pre-assessment (Batch)

Screens multiple stories per LLM call (~10 per batch, fewer for Chinese text). In a single call, the LLM classifies each story into the most relevant issue, assigns a conservative rating (1-10), and assigns an emotion tag. Uses the medium model with medium reasoning effort. All stories are batched together regardless of issue — pre-assessment uses only the generic rating scale (1-10 impact criteria), not issue-specific guidelines. Falls back to `story.feed.issueId` if the LLM returns an invalid issue slug.

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
