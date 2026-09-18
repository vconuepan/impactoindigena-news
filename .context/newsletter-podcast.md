# Newsletter & Podcast Generation

> **Spec:** [`.specs/newsletter-and-podcast.allium`](../.specs/newsletter-and-podcast.allium) -- workflow rules (assign, select, generate, send), entity models, issue ordering. This file covers implementation details, templates, API endpoints, and modification guides.

## Overview

Newsletters and podcasts are content formats generated from published/selected stories. Both follow a create-assign-generate workflow via admin API endpoints. Newsletters use template-based formatting; podcasts use LLM-generated scripts.

## Workflow

1. **Create** — `POST /api/admin/newsletters` or `/api/admin/podcasts` with a title
2. **Assign stories** — `POST /:id/assign` auto-assigns recent published/selected stories (last 7 days)
3. **Generate content** — `POST /:id/generate` produces the content
4. **Edit** — `PUT /:id` to manually edit generated content
5. **Publish** — `PUT /:id` with `status: 'published'`

## Newsletter

### Content generation (`POST /api/admin/newsletters/:id/generate`)

Generates markdown content in two phases:

1. **LLM editorial intro** — Calls the `contentModelTier` LLM with `buildNewsletterIntroPrompt()` to generate a 2-3 sentence warm, conversational opening that weaves together the edition's key themes. Falls back gracefully to no intro on failure.
2. **Template-based story blocks** — For each selected story, grouped by issue with section headers:
   - `# IssueName` section header (when the issue group changes)
   - Title as `##` heading
   - Metadata line with `{feed:id}` tag, publisher name, and links (feed ID is used for favicon in HTML)
   - Body text: alternates between `relevanceSummary` (2/3 of stories) and `quote` + `quoteAttribution` blockquote (1/3)

### HTML email template (`POST /api/admin/newsletters/:id/html`)

Converts the markdown content into a responsive HTML email and saves it to the newsletter record. The function both generates and persists the HTML (callers do not need to save separately).

Template structure:
- **Header** — Logo, tagline, four-color category strip (amber/teal/red/indigo), newsletter title (uppercase, bold)
- **Intro** — Editorial intro paragraph(s) if present
- **Issue sections** — Centered category headers with colored dot and decorative lines
- **Story blocks** — Title (linked), publisher favicon + name + "original article" / "relevance analysis" links, body text or blockquote
- **Support Us** — Ko-fi link with "Free. Independent. Without ads." tagline
- **AI disclaimer** — "Curated and written with care by AI" + bug/mistake notice
- **Footer** — Website link, Plunk `{{plunk_id}}` unsubscribe link

### Carousel images (`POST /api/admin/newsletters/:id/carousel`)

Generates a downloadable ZIP containing:
- One 1200x675 PNG per story (category header, title, publisher, date, summary)
- A PDF with all images as landscape pages

Uses `@napi-rs/canvas` for image generation, `pdfkit` for PDF, `archiver` for ZIP.

Category-specific header colors/images are mapped by keyword matching on the category name (human, planet, science, general, existential).

### Asset files

Located in `server/assets/`:
- `images/` — Header images (1200x80) and logo (112x80). Placeholders used until branded versions are provided.
- `fonts/` — Inter Bold and Inter Regular TTF files for image text rendering.

### Automated generation (`generate_newsletter` cron job)

The `generate_newsletter` job (default: Saturday 4am, `0 4 * * 6`) chains the full pipeline automatically:

1. Pre-checks for recent published stories (last 7 days); skips silently if none
2. Guards against duplicate titles (skips if "Week N, YYYY" already exists)
3. Creates newsletter, assigns stories, runs LLM selection, generates content + HTML, sends test email
4. On mid-pipeline failure: deletes the partially-built newsletter and re-throws to the scheduler

Handler: `server/src/jobs/generateNewsletter.ts`. Registered in `server/src/jobs/handlers.ts`.

## Podcast

### Script generation (`POST /api/admin/podcasts/:id/generate`)

LLM-generated using `getSmallLLM()` with `podcastScriptSchema` (Zod structured output).

The prompt (`buildPodcastPrompt` in `prompts.ts`) formats each story as an XML `<STORY>` block with:
- Category, title, summary, publisher
- Relevance reasons and limiting factors as bullet points

The prompt instructs the LLM to write a podcast script with:
- Intro (welcome to the **Voces Indígenas Podcast**)
- Sections by category
- Outro (feedback request, thanks)

After the LLM script, a story list with links is appended.

### Public RSS feed (`GET /api/podcast/feed.xml`)

Built in `routes/public/podcastFeed.ts`, cached 15 min. Apple Podcasts is the
strict consumer here, and two of its rules are not optional:

| Element | Value | Why it matters |
|---|---|---|
| `itunes:image` | `${siteUrl}/images/podcast-cover.jpg` | **Apple rejects a feed without cover art.** Missing until 17-sep-2026 |
| `image` | same URL | The plain-RSS equivalent, for non-Apple readers |
| `itunes:type` | `episodic` | Tells Apple to show newest first |
| `itunes:owner` → `itunes:email` | `config.podcast.ownerEmail` | **Public.** See below |

**The cover** is generated by `npm run images:podcast --prefix client`
(`client/scripts/generate-podcast-cover.ts`): 3000×3000, JPEG, sRGB — Apple
requires square, 1400–3000 px, RGB. Regenerate it if the brand changes.

**The owner email used to be `BREVO_FROM_EMAIL`**, and that coupling had a cost:
a Brevo sender can only change after being registered and verified in Brevo, so
the public feed stayed pinned to whatever that verification allowed. They are
different requirements — one address must be able to *send*, the other only to
*receive*. It is now `PODCAST_OWNER_EMAIL`, defaulting to
`contacto@fundacionkm.org`.

`podcastFeed.test.ts` locks all four rows plus the cover's dimensions on disk.

## API Endpoints

### Newsletters
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/newsletters` | List (paginated, filterable by status) |
| POST | `/api/admin/newsletters` | Create |
| GET | `/api/admin/newsletters/:id` | Get single |
| PUT | `/api/admin/newsletters/:id` | Update |
| DELETE | `/api/admin/newsletters/:id` | Delete |
| POST | `/api/admin/newsletters/:id/assign` | Auto-assign recent stories |
| POST | `/api/admin/newsletters/:id/generate` | Generate text content |
| POST | `/api/admin/newsletters/:id/carousel` | Generate carousel ZIP (download) |

### Podcasts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/podcasts` | List (paginated, filterable by status) |
| POST | `/api/admin/podcasts` | Create |
| GET | `/api/admin/podcasts/:id` | Get single |
| PUT | `/api/admin/podcasts/:id` | Update |
| DELETE | `/api/admin/podcasts/:id` | Delete |
| POST | `/api/admin/podcasts/:id/assign` | Auto-assign recent stories |
| POST | `/api/admin/podcasts/:id/generate` | Generate podcast script |

## Files

| File | Purpose |
|------|---------|
| `server/src/services/newsletter.ts` | Newsletter CRUD, story assignment, content generation, carousel orchestration |
| `server/src/services/podcast.ts` | Podcast CRUD, story assignment, LLM script generation |
| `server/src/services/carousel.ts` | Canvas image generation, PDF creation, ZIP bundling |
| `server/src/routes/admin/newsletters.ts` | Newsletter admin API endpoints |
| `server/src/routes/admin/podcasts.ts` | Podcast admin API endpoints |
| `server/src/schemas/newsletter.ts` | Newsletter request validation schemas |
| `server/src/schemas/podcast.ts` | Podcast request validation schemas |
| `server/src/schemas/llm.ts` | `podcastScriptSchema`, `newsletterIntroSchema` for LLM structured output |
| `server/src/prompts/newsletter-intro.ts` | `buildNewsletterIntroPrompt` for editorial intro generation |
| `server/src/prompts/newsletter-select.ts` | `buildNewsletterSelectPrompt` for story selection |
| `server/src/services/prompts.ts` | `buildPodcastPrompt` for podcast script generation |
| `server/src/jobs/generateNewsletter.ts` | Automated weekly newsletter generation cron job |

## Modifying

- **To change newsletter format:** Edit the template loop in `newsletter.ts:generateContent()` and the HTML parser in `generateHtmlContent()`
- **To change newsletter intro prompt:** Edit `buildNewsletterIntroPrompt()` in `prompts/newsletter-intro.ts`
- **To change newsletter intro output structure:** Update `newsletterIntroSchema` in `schemas/llm.ts` AND the prompt
- **To change podcast prompt:** Edit `buildPodcastPrompt()` in `prompts.ts`
- **To change podcast output structure:** Update `podcastScriptSchema` in `schemas/llm.ts` AND the prompt
- **To add new carousel image layouts:** Edit `createStoryImage()` in `carousel.ts`
- **To use real branded assets:** Replace placeholder files in `server/assets/images/` and `server/assets/fonts/`
