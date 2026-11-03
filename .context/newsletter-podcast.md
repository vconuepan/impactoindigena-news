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

### Send status and the public archive (2-nov-2026)

A live send (`sendLive`, called by the `send_newsletter` and `send_weekly_newsletter` jobs and the panel's «Send to Subscribers») creates its `NewsletterSend` row **after** Brevo accepted `sendNow`, in status `sending` with `sentAt` = that moment. Nothing moved it to `sent` until 2-nov-2026, and the public archive (`routes/public/newsletters.ts`) required `sent`: all 52 editions came out with `sentAt: null`, and `/archivo/:id` built its meta description as «…del .».

- **The archive** now dates an edition by its latest non-test send in `sending` or `sent` with a `sentAt` (`ENVIO_A_LA_LISTA`). That fixed the whole history at once, with no database write.
- **The `sent` transition** happens in `refreshSendStats` («Refresh stats» in the panel): `brevo.getCampaignDelivery` reads the campaign once and returns stats, `status` and `sentDate`. Per Brevo's reference, `sentDate` only comes with `status: "sent"`. Nothing refreshes stats automatically yet, so rows stay `sending` until someone does.
- **The meta description** of `/archivo/:id` omits the date when there is none (`descripcionDe` in `NewsletterDetailPage.tsx`). It says «Boletín», not «Boletín semanal»: the archive mixes the weekly edition with the Monday and Thursday ones.

**Latent defect, not fixed:** with `scheduledFor`, `brevo.sendCampaign` sets `scheduledAt` and then calls `sendNow`, which Brevo documents as sending «by scheduling it for the current time». A scheduled send would go out at once. Nobody passes `scheduledFor` today (the panel and both jobs send immediately).

**Stale in this file:** the HTML template section still describes a Ko-fi link and Plunk's unsubscribe tag. Ko-fi is gone from the code (director, 2-3 oct-2026) and the provider is Brevo.

**Editor photo (2-nov-2026, with the director's permission):** the byline photo lives at `client/public/images/editor-venancio.jpg`, served as `${config.siteUrl}/images/editor-venancio.jpg`. Until then every email loaded it from `impactoindigena.com/wp-content/…/vc-vertical.webp`: another brand's WordPress, a WebP several desktop email clients don't show, 804×921 px and 125,738 bytes for a 40 px circle, squashed wherever `object-fit` is ignored. Now it is a 120×120 JPEG cropped to the face (6,081 bytes). `newsletter.test.ts` checks that the email points to the site and that the file is a square JPEG under 20 KB.

### Subscribers, unsubscribe and suppression (3-nov-2026)

> **Spec:** `.specs/subscription.allium` (rules `SuppressByEmail`, `RemoveFromNewsletter`, `CleanupExpiredPendingSubscriptions`).

The campaign goes to Brevo list `LISTA_BOLETIN` (`services/brevo.ts`), so **a subscriber exists in two places**: the `pending_subscriptions` row and the Brevo contact. Deleting only the row leaves the person on the list and the campaign keeps reaching them. Until 3-nov-2026 the panel's subscriber delete did exactly that, the admin user delete left newsletter, Brevo contact, alerts and feedback behind, alerts had no admin tool, the profile unsubscribe skipped Brevo when the row had no contact id (anyone who came back after an earlier unsubscribe), and abandoned signups left their Brevo contact forever (`subscribe()` creates it before confirmation).

Every deletion path now goes through `server/src/services/supresion.ts`:

| Path | Function | If Brevo fails |
|------|----------|----------------|
| `DELETE /api/auth/account` (ARCO self-service) | `suprimirPorCorreo` with `userId` | 503, nothing deleted; the profile says «No se pudo eliminar. Intenta de nuevo.» |
| `DELETE /api/admin/users/:id` | `suprimirPorCorreo` with `userId` | 502, nothing deleted |
| `POST /api/admin/supresion` («Suprimir por correo», Subscribers page, admins only) | `suprimirPorCorreo` | 502 |
| `DELETE /api/admin/subscribers/:id` | `borrarDelBoletin` (all rows of that email + contact) | 502 |
| `DELETE /api/auth/subscription` (profile) | `borrarDelBoletin` | 503 |

- **Brevo first, and a Brevo failure stops everything.** The contact is deleted by every stored contact id and by the email. Until the 3-nov review the ARCO path went ahead with Brevo down: the person stayed on the list, kept getting the campaign, and no record with their email remained to retry. «Nothing deleted» means in our database: Brevo may have deleted part (the id but not the email); retrying is safe because a 404 is not a failure.
- **With an account (`userId`) the account is matched by id only, and the data by the email the account has today in the database.** The member token carries the email for 30 days and an admin can change an account's email; the old email may already be someone else's account. Matching accounts by it deleted theirs (found by the 3-nov review). If the `userId` account no longer exists nothing is deleted, and the profile's `GET`/`DELETE /api/auth/subscription` answer «not subscribed» / 404: the email would come from a token that outlived its account (second review).
- **Email matching:** case-insensitive and exact. Prisma's `mode: 'insensitive'` is ILIKE, where `_` and `%` are wildcards, so candidates are re-compared in JS before deleting. Tables store the email as typed; the magic link lowercases it, which is why the profile's subscription lookup (`suscripcionesConfirmadas`) is case-insensitive too.
- **The ARCO export (`GET /api/auth/export`) reads with the same rule:** the account's current email, case-insensitive and exact, nothing by email if the account no longer exists. Access shows exactly what erasure would delete.
- **The audit log never stores the suppressed email**, only operator, action and row counts. **Logs neither:** Brevo identifies contacts by email in the URL (`/contacts/ana%40x.cl`), and `serializeError` (`lib/logger.ts`) now masks emails in an axios error's URL, message and stack (`redactarCorreos`). The regex is linear (a lookbehind anchors each match at the start of a run; without it a 16 KB run took half a second, synchronously, on every logged error) and requires a letters-only TLD, so `axios@1.7.2` in a stack trace is left alone.
- **Known limit:** Brevo answers 405 when deleting the email registered as the Brevo account itself; that is treated as a failure and blocks suppression of that one address.
- **Abandoned signups** (`cleanupExpiredPendingSubscriptions`): the Brevo contact is deleted only when no other row shares the email and the contact is on no list and not blacklisted. If Brevo fails the row stays for the next day, up to 30 days after expiry. Between the sibling check and the deletion a new signup can slip in; `confirmSubscription` repairs it: if updating the contact returns 404 it re-reads the row and, if the row still exists, creates the contact on the list. If the row is gone, the 404 was a deletion in progress and nothing is recreated. A deletion that already hit Brevo but not yet the rows still slips past that read. Both orders are closed: if the rows vanish before the confirmation marks its row, the P2025 makes it delete the contact it recreated; if they vanish after, the suppression's second Brevo deletion (`barridoFinal`, after `deleteMany`) removes it.
- **Backlog not cleaned by code:** on 3-nov-2026 Brevo held 7 contacts (of 20) on no list and not blacklisted, all older than a week. They predate this change, the daily cleanup does not reach them, and they were not cross-checked against the production database (counted with a read-only listing of the Brevo API).

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

### Subscribers and suppression
| Method | Path | Description |
|--------|------|-------------|
| DELETE | `/api/admin/subscribers/:id` | Remove that email from the newsletter: every row + Brevo contact |
| POST | `/api/admin/supresion/vista-previa` | Admin only. `{ email }` → counts of what would be deleted, nothing deleted |
| POST | `/api/admin/supresion` | Admin only. `{ email, confirm: 'SUPRIMIR' }` → full suppression |

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
| `server/src/services/supresion.ts` | The one deletion by email: account, newsletter + Brevo contact, alerts, magic links, feedback |
| `client/src/components/admin/SupresionPorCorreo.tsx` | «Suprimir por correo» dialog: preview, then delete |

## Modifying

- **To change newsletter format:** Edit the template loop in `newsletter.ts:generateContent()` and the HTML parser in `generateHtmlContent()`
- **To change newsletter intro prompt:** Edit `buildNewsletterIntroPrompt()` in `prompts/newsletter-intro.ts`
- **To change newsletter intro output structure:** Update `newsletterIntroSchema` in `schemas/llm.ts` AND the prompt
- **To change podcast prompt:** Edit `buildPodcastPrompt()` in `prompts.ts`
- **To change podcast output structure:** Update `podcastScriptSchema` in `schemas/llm.ts` AND the prompt
- **To add new carousel image layouts:** Edit `createStoryImage()` in `carousel.ts`
- **To use real branded assets:** Replace placeholder files in `server/assets/images/` and `server/assets/fonts/`
