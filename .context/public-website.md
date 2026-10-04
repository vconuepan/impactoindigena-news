# Public Website

This document covers the public site's routes, components, data flow, and issue content. Pages render inside `PublicLayout`. There is no `NAV_LINKS`: in `PublicLayout.tsx`, links are added according to where they appear. `ISSUE_LINKS` holds the eight topics in the bar; `VERTICAL_LINKS` and `VERTICAL_LINKS_MAS` hold the verticals (Wallmapu -> `/comunidad/mapuche`, Chile and the world regions); the footer uses `FOOTER_NAV` (about, methodology, comunidades, archivo, casos, alertas, voces), `FOOTER_GUIDES`, `FOOTER_LEGAL`, `FOOTER_DISTRIBUTE` and `FOOTER_CONNECT`.

## Routes

| Path | Component | Description |
|---|---|---|
| `/` | `HomePage` | Hero + latest stories per issue |
| `/stories/:slug` | `StoryPage` | Story detail with AI analysis |
| `/issues/:slug` | `IssuePage` | Issue description + paginated stories + evaluation criteria |
| `/methodology` | `MethodologyPage` | Three-criteria framework explanation |
| `/about` | `AboutPage` | Mission and approach |
| `/imprint` | `ImprintPage` | Legal notice |
| `/feedback` | `FeedbackPage` (`pages/FeedbackPage.tsx`) | Contact: destination of the footer "Contacto" link (`FOOTER_CONNECT` in `PublicLayout.tsx`) |
| `/newsletter` | `NewsletterPage` | Inline subscribe form (reuses `SubscribeForm`) |

There is no `/contact` route or component: that path falls through to `NotFoundPage`.

All routes are registered in both `App.tsx` and `routes.ts` (for sitemap generation). Prerendered at build time: every path in `routes.ts` plus the issues, subsections and communities the build fetches from the API (`client/vite.config.ts`). Story pages are not prerendered: `/stories/*` is rewritten to `/api/og/story-html` (`staticwebapp.config.json`). Dynamic story routes are added to the sitemap via `generate-sitemap.ts`.

## Public API

- `GET /api/stories` — Paginated published stories. Response: `{ data, total, page, pageSize, totalPages }`; `page` defaults to 1, `pageSize` defaults to 25 (max 100; out of range returns 400). Filters: `issueSlug`; `search` (2-200 characters, stricter rate limit, switches to hybrid search); `emotionTags` (comma-separated list of `uplifting`, `calm`, `frustrating`, `scary`; a value outside that list returns 500; ignored when `search` is present); `dateFrom` / `dateTo` (`YYYY-MM-DD`; any other format returns 400). There is no `positivity` parameter: it is silently dropped.
- `GET /api/stories/:slug` — Single published story, looked up by its `slug` field, not by `id` (an id returns 404). If the slug is not found among published stories but belongs to a non-primary cluster member whose primary is published, it responds 302 to `/api/stories/<primary-slug>`; a non-primary member that is still published returns 200 with its own content. Also available: `GET /api/stories/:slug/related` and `GET /api/stories/:slug/cluster`.
- `GET /api/issues` — Root issues (`parentId` null), sorted by name, with their subsections nested in `children`. Each root issue has: `id`, `name`, `slug`, `description`, `intro`, `evaluationIntro`, `evaluationCriteria` (array of strings), `makeADifference` (array of `{ label, url }`), `parentId`, `sourceNames` (includes the sources of its subsections) and `children`. Each subsection has the same fields except `children`, with its own `sourceNames`. To list every issue, walk `children` too.
- `GET /api/issues/:slug` — Single issue by slug; same fields plus `parent` (`{ id, name, slug }`, null for a root issue). Each entry in `children` also carries `publishedStoryCount` (published stories assigned directly to that subsection).

API client: `client/src/lib/api.ts` (exports `publicApi` and `API_BASE`)
Hooks: `usePublicStories.ts`, `usePublicIssues.ts`

### RSS Feeds

Public RSS 2.0 feeds are available without authentication:

- `GET /api/feed` — Global feed of the 50 most recent published stories
- `GET /api/feed/:issueSlug` — Per-issue feed (e.g., `https://vocesindigenas.org/api/feed/cambio-climatico`)
- `GET /api/feed/comunidad/:slug` — Per-community feed (e.g., `https://vocesindigenas.org/api/feed/comunidad/mapuche`), registered before `/:issueSlug` in `feed.ts`

Feed items include: title, link to story page, AI-generated summary, publish date, and issue category. Responses use `Content-Type: application/rss+xml` with a 15-minute cache (`Cache-Control: public, max-age=900`).

**Discoverability:**
- Global RSS autodiscovery `<link>` tag is added via Helmet in `PublicLayout.tsx`
- Per-issue autodiscovery `<link>` tag is added via Helmet in `IssuePage.tsx`
- Visible RSS icon/link appears on each issue page header and in the footer Subscribe section
- All RSS hrefs use `API_BASE` (from `client/src/lib/api.ts`) so they resolve correctly in both dev (Vite proxy to `localhost:3001`) and production (Azure Static Web Apps with the Azure App Service backend linked, served on the same origin under `/api`)

**Key files:**
- `server/src/routes/public/feed.ts` — RSS feed route handler (uses `feed` npm package)
- `server/src/routes/public/index.ts` — Registers feed router at `/feed`
- `client/vite.config.ts` — Dev proxy for `/api` to `localhost:3001`

## Positivity Slider

A 5-position slider (0%, 25%, 50%, 75%, 100%) that controls the emotional tone of displayed stories. Default is 50% (balanced). Persisted in localStorage under `ar-positivity`. On the homepage the mix happens client-side with no extra request; on issue pages the slider position becomes an `emotionTags` filter sent to the server (see below).

- **Desktop:** In the logo bar, right side (the `hidden lg:flex` group after `BrandLogo`)
- **Mobile:** First item in the hamburger menu (centered), above issue categories
- **Scope:** Affects homepage and issue pages only. Search is not affected.
- **Architecture:** On the homepage the server returns three emotion buckets per issue (`uplifting`, `calm`, `negative`, where `negative` is `frustrating` + `scary`) and the client mixes them with `mixHomepageStories()` from `lib/mix-stories.ts`. On issue pages the client sends `emotionTags` and the server filters. No `positivity` param is sent to the server.
- **Homepage:** `GET /api/homepage` responds `{ issues, storiesByIssue, activeCases }`. `getHomepageData()` returns `{ storiesByIssue: { [issueSlug]: { uplifting, calm, negative } } }` for the eight homepage issues, up to 7 stories per bucket (`storiesPerIssue`). Client uses `mixHomepageStories()` to pick a fixed-count mix.
- **Issue pages:** The client maps the slider position to `emotionTags` with `positivityToEmotionTags()` and sends them to `GET /api/stories` along with `issueSlug`; the server filters and paginates (12 per page). Moving the slider triggers a new request and returns to page 1. Only the homepage mixes client-side (`mixHomepageStories()`).
- **Icons:** Storm (heavy news) on the left and sun (hopeful news) on the right, as SVG. Labels per position: 'Solo noticias pesadas', 'Mayormente pesadas', 'Mezcla equilibrada', 'Mayormente positivas', 'Solo noticias positivas'. The exported component is `MoodDialPanel`.
- **Info tooltip:** Click info icon next to slider for explanation

**Key files:**
- `client/src/components/PositivitySlider.tsx` — `MoodDialPanel`: slider UI with storm/sun icons, position labels and info tooltip
- `client/src/contexts/PositivityContext.tsx` — React Context + localStorage persistence
- `client/src/lib/mix-stories.ts` — `mixHomepageStories()` (homepage) and `positivityToEmotionTags()` (issue pages); `filterStoriesByPositivity()` is still exported but not used in production code
- `server/src/services/story.ts` — `getHomepageData()` returns `{ storiesByIssue }` with `{ uplifting, calm, negative }` per issue

## Shared Components

- `StoryCard` — Story card with title, rating, summary (used on homepage + issue pages)
- `Pagination` — Page navigation with ellipsis

## Issue Content

Issue evaluation criteria (`evaluationIntro`, `evaluationCriteria`), intro (`intro`) and "make a difference" links (`makeADifference`) are stored in the database, come from `GET /api/issues/:slug` and are edited in the admin (`/admin/issues/:id/edit`, `IssueEditPage`), not in a client file. Sources (`sourceNames`) are not stored: they are derived from the issue's active feeds (`displayTitle` or `title`) and change through the feeds; `IssueEditPage` only displays them.

Current topic slugs are the eight on the homepage (`HOMEPAGE_ISSUE_SLUGS` in `server/src/routes/public/homepage.ts`), each verified with 200 on `/api/issues/:slug` and `/api/feed/:slug` and with results on `/api/stories?issueSlug=` (story counts on 2026-10-04): `territorio-y-tierras` (491), `cambio-climatico` (939), `consulta-y-consentimiento` (386), `economias-indigenas` (179), `derechos-indigenas` (793), `defensores-y-proteccion` (460), `mujeres-indigenas` (244), `cultura-y-conocimientos-ancestrales` (508).

There are also eight geographic root issues (`chile-indigena`, `latinoamerica`, `africa`, `asia`, `europa-occidental`, `europa-oriental`, `oceania`, `sapmi`) and 18 subsections nested in `children` (e.g., `clima-bosques`, `consulta-fallos`).

The legacy slug `desarrollo-sostenible-y-autodeterminado` resolves as an alias of `economias-indigenas` on `/api/issues/:slug`, `/api/feed/:slug` and `/api/stories?issueSlug=` without search. Combined with `search`, it only resolves in the keyword leg (the semantic leg of `hybridSearch` in `server/src/services/story.ts` uses the raw slug), so it returns fewer results than the canonical slug.

The authoritative list is `GET /api/issues`, not this document.

## Design

- **Colors:** Editorial green `#0D5F3C` (`brand-800`) and terracotta `#C8473A` (`accent-500`) on paper `#FAFAF8`; the authoritative source is `DESIGN.md`
- **Layout:** Sticky header, dark footer, max-w-5xl content area
- **Mobile:** Hamburger menu at `lg` breakpoint

### Fonts

Self-hosted from `/fonts/`, defined as @font-face in `client/src/index.css` and preloaded in `client/index.html`. Only these fonts are loaded (adding more increases page load):

| Font | Weights | Tailwind Class | Use For |
|------|---------|----------------|---------|
| Lora | 400-700 (italic 400 only) | `font-lora` | Default body font (base `body` style) |
| Fraunces | 300-900 | `font-fraunces` | h1-h6 from the base layer, with the metric `Fraunces Fallback` |
| DM Sans | 300-700 | `font-dm-sans` | UI font |

Nexa and Roboto are not loaded, and `font-nexa` is not a defined class (its two uses, `VocesIndigenas.tsx:59` and `VocesIndigenasDetail.tsx:115`, have no effect). The old list of forbidden weights no longer applies: all three are variable fonts. The design reference is `DESIGN.md`.

Font definitions: `client/src/index.css` (@font-face)
Preload hints: `client/index.html`

## Key Files

- `client/src/layouts/PublicLayout.tsx` — Header, footer, navigation, positivity slider placement
- `client/src/pages/HomePage.tsx` — Homepage with issue sections
- `client/src/pages/StoryPage.tsx` — Story detail
- `client/src/pages/IssuePage.tsx` — Issue page with stories + issue content from the API
- `client/src/components/PositivitySlider.tsx` — Positivity slider UI
- `client/src/contexts/PositivityContext.tsx` — Positivity state + localStorage
- `client/src/pages/admin/IssueEditPage.tsx` — Admin editor for per-issue intro, evaluation criteria and "make a difference" links
- `client/src/lib/api.ts` — Public API client
- `server/src/routes/public/issues.ts` — Public issues endpoint
- `server/src/routes/public/homepage.ts` — Homepage data with emotion-bucketed stories
