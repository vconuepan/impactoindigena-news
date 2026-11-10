# SEO: Sitemap and Robots

## Files

| File | Location | Type |
|------|----------|------|
| `robots.txt` | `client/public/robots.txt` | Static |
| `sitemap.xml` | `server/src/routes/public/sitemap.ts` | Dynamic (server-generated) |

## robots.txt

Static file that rarely changes. Points crawlers to the sitemap.

```txt
User-agent: *
Allow: /

Sitemap: https://vocesindigenas.org/sitemap.xml
Sitemap: https://vocesindigenas.org/sitemap-news.xml
```

> El dominio es `vocesindigenas.org` desde el rebrand del 4-sep-2026.
> `impactoindigena.news` solo redirige — y su `robots.txt` bloquea nueve bots de
> IA, por lo que **no** sirve como referencia de este archivo.

## sitemap.xml

Served dynamically by the backend at `GET /api/sitemap.xml`. In production an Azure Static Web Apps rewrite maps `/sitemap.xml` to that endpoint, so crawlers see it at the canonical URL.

### How It Works

1. `GET /api/sitemap.xml` queries all published stories (slug + datePublished) from the database
2. Combines with hardcoded static routes (same list as `client/src/routes.ts`)
3. Generates XML with `<lastmod>` for stories using `datePublished`
4. Response is cached in-memory (TTL: `config.sitemap.cacheMaxAge`, default 1 hour)
5. `Cache-Control: public, max-age=3600` header allows CDN/proxy caching
6. New stories appear in the sitemap automatically within the cache TTL

### Serving it at the canonical URL (Azure Static Web Apps)

`client/public/staticwebapp.config.json` rewrites `/sitemap.xml` →
`/api/sitemap.xml` and `/sitemap-news.xml` → `/api/sitemap-news.xml`, so crawlers
see both at the root.

**Rule order still matters:** the sitemap rewrites must come **before** the SPA
catch-all, or the catch-all wins and serves the app shell.

**No static `sitemap.xml` may exist in `client/public/`** — static files are
served before rewrites apply, so one would shadow the generated sitemap
permanently.

> The Render rewrite this file used to document is gone: the project runs on
> Azure App Service + Static Web Apps since the migration of 2026-05.

### Configuration

| Config Key | Env Var | Default | Description |
|-----------|---------|---------|-------------|
| `config.sitemap.cacheMaxAge` | `SITEMAP_CACHE_MAX_AGE` | `3600` | Cache TTL in seconds |

### Legacy Build-Time Generation

The build-time sitemap generator (`client/scripts/generate-sitemap.ts`) is kept for local development/testing but is no longer part of the client build command.

## Adding a New Route

Which of the two kinds of route you are adding decides what you have to touch.

### Static routes — two places, kept in sync by a test

1. `client/src/routes.ts` — for prerendering
2. `server/src/routes/public/sitemap.ts` `STATIC_ROUTES` array — for the dynamic sitemap

The server can't resolve the `@shared` alias, so the two lists are duplicated on
purpose. **`sitemap-sincronia.test.ts` reads both files and fails if they
diverge** — in either direction, plus a check that every declared route has its
`<Route>` in `App.tsx`. Don't add a route to one list only; the test exists
because that happened twice.

### Dynamic routes (sections, communities) — same URL, two different queries

These are not in either list. The sitemap queries the database directly and the
prerender fetches slugs over HTTP at build time, which is where they can drift
apart without any list looking wrong:

| | Sitemap (`sitemap.ts`) | Prerender (`vite.config.ts`) |
|---|---|---|
| Sections | `prisma.issue.findMany()`, **no `where`** — all 34 | `/api/issues` → `rutasDeSecciones()` |
| Communities | `prisma.community.findMany()` | `/api/communities` |
| Stories | all published | **not prerendered** — `/stories/*` is rewritten to `/api/og/story-html` so OG tags stay fresh |

**The trap, and it cost 18 pages on 2026-09-10:** `getPublicIssues()` filters
`parentId: null` and returns the 18 subsections **nested under `children`**, so
mapping the top level silently dropped them. The sitemap declared all 34 — the 18
subsections answered with the homepage byte for byte, which is a soft 404, and a
declared one. `client/src/lib/issue-routes.ts` flattens them; that module's
header explains why prerendering them was the fix rather than hiding them from
the sitemap.

So: **when you add a new kind of dynamic route, add its prefix on both sides.**
`sitemap-sincronia.test.ts` compares the URL prefixes each side emits and fails
if one has a prefix the other doesn't.

### The build bakes every page with its data, or it stops (B23, 10-nov-2026)

The prerender bakes 85 routes (35 fixed, 34 sections, 16 communities) in about two minutes, and every page asks the public API for its data through the proxy in `vite.config.ts`. That API allows **100 requests per 15 minutes per IP** (`apiLimiter`). Measured on 10-nov with a counting proxy: a build made **204** requests, 85 of them `POST /api/track` (a page view the server already discarded by User-Agent). From request 101 on, every answer was 429. TanStack Query waits about a second before retrying, there is no fetch open during that wait, the old "network is quiet" check in `main.tsx` took the page as finished and the prerender saved it **in its loading skeleton**: homepage title, no description, no social card. The build was still green. In production it happened on 7-nov (9 of the 16 communities) and not on 9-nov, depending on how much quota the CI runner had.

What stops it now:

- **No page view from the build.** `usePageTracking` returns early when `estaPrerenderizando()`. That took the build from 204 to 122 requests (measured: 99 answered, 23 got 429, because it is still over 100).
- **The page is never saved half-loaded.** `avisarCuandoTermine` (`lib/prerender.ts`) also waits for every TanStack query to be at rest (`consultasActivas`: fetching **or paused**). Two traps, both pinned by tests:
  - With 4 routes at once, Puppeteer keeps only the last tab `visible`; in the other three TanStack **pauses** the retry (its `focusManager` reads `document.visibilityState`) and `isFetching()` drops to 0. `main.tsx` calls `fijarFocoParaElPrerender(focusManager)` before mounting, so retries run in every tab. Found by the adversarial review of 10-nov, measured there with Puppeteer.
  - When the page is captured, any query left in error or unfinished is written on `<html>` as `data-prerender-incompleto` (`consultasIncompletas`; a disabled query, `pending` + `idle`, does not count), and so is any `/api` request made with plain `fetch` that failed and was not followed by a success to the same URL (`registroDeFallasApi`: `CurationStatsBar` on every route, `MapWidget`). That is what lets the lock see the **fixed** routes that load data (`/fuentes`, `/casos`, `/comunidades`…), whose `og:url` does not depend on the API. Measured on 10-nov with a proxy answering 429 only to `/api/stats/daily`: the build stopped and named all 85 pages.
- **A failed list stops the build.** If `/api/issues` or `/api/communities` fails (HTTP error, network, not JSON), `vite.config.ts` throws with the cause. Before, it skipped them silently: on 10-nov, with the quota used up, the build baked only the 35 fixed routes and finished green. Every deploy replaces the whole site, so that would have **deleted** the 50 section and community pages. An **empty** list with HTTP 200 is data, not a failure (the panel can deactivate every community, and then their pages should leave the site): the build only warns.
- **The lock (`lib/verificar-horneado.ts`).** In `postProcess`, every baked page must carry exactly one `og:url` whose path is its own route, and no `data-prerender-incompleto`. Since 8-nov every route sets an `og:url`, and sections and communities only once their data arrived (their Helmet depends on it). If any page fails, the build throws, the plugin turns it into `this.error`, the build goes red and **nothing is deployed**; production stays as it was. The error names every page and says whether there were 429s, 5xx or network failures. Measured on 10-nov: it stopped a build with 10 communities left without data. It only runs with `PRERENDER_API_URL`; a local build without the API has nothing to check.
- **The build log line** `[prerender] N consultas a la API (200×…, 429×…, red×…); M pasaron por el limitador` says how much quota the build spent. A request that fails without an HTTP answer counts as `red` (the proxy's `onError`).
- **A push that touches `server/**` and `client/**` deploys both at once**, and the backend restarts while the prerender may be running. Pages caught in that window now stop the build instead of shipping in their error state: rerun the frontend workflow (`workflow_dispatch`) once the backend is up.

**The secret that takes the build out of the limit.** Even without page views, a build needs more than 100 requests, so the lock alone would leave deploys depending on luck with the quota. With `PRERENDER_BYPASS_TOKEN` set **to the same value** as a GitHub Actions secret and as an App Service app setting, the build sends it in `x-prerender-token` (only from Node: it is not `VITE_*`, so it never reaches the bundle, and the lock fails if it appears in any baked page) and the server skips `apiLimiter` for those requests (`server/src/lib/prerenderBypass.ts`: constant-time comparison, at least 32 characters, empty = nobody skips). It skips **only** `apiLimiter` and **only for GET/HEAD**, so a leaked secret would not lift the limit on public writes such as joining and leaving a community (one Brevo email per round trip); search, login, subscription and feedback limits still count. Generate it with `openssl rand -hex 32`: a value with spaces or line breaks (`openssl rand -base64 64` prints two lines) stops the build before use, because `fetch` would copy the whole value into its error message, and so does one shorter than the server's 32 characters, which the server would always ignore (a test pins that both minimums match). A skipped request carries no `RateLimit-*` headers, so the build log shows whether it worked: `0 pasaron por el limitador`. If the secret is set but the API still applied the limit, the build warns that it is missing from the App Service or does not match.

**To measure it again:** point `PRERENDER_API_URL` at a local proxy that forwards to `https://vocesindigenas.org` and logs each request with its status and `RateLimit-Remaining`. The measurement is spent against your own IP's quota: wait 15 minutes between builds, or the second one starts with no quota and tells you nothing.

### Priority Guidelines

| Priority | Use For |
|----------|---------|
| 1.0 | Homepage only |
| 0.8 | Issue pages |
| 0.7 | Important static pages (methodology, about) |
| 0.6 | Individual published stories |
| 0.5 | Utility pages (imprint, privacy) |
| 0.3 | Low-priority pages (search) |
| 0.2 | Non-indexable pages (subscribed confirmation) |

### Change Frequency Options

- `daily` — Homepage, search (new stories published regularly)
- `weekly` — Issue/category pages
- `monthly` — Static pages (methodology, about), individual stories
- `yearly` — Pages that rarely change (imprint, privacy, subscribed)

## Unknown URLs: noindex, not a 404 status (2-nov-2026)

Azure Static Web Apps answers **every** unknown path through `navigationFallback` with `/index.html` and status **200**, and that file is the prerendered homepage. Measured 2-nov: `/pagina-que-no-existe-xyz`, `/issues/tema-inventado-xyz` and `/comunidad/inventada-xyz` returned the homepage byte for byte (138,637 bytes), with `canonical` to `/` and `index, follow`: a soft 404 on every invented URL. A true 404 status is not available while `navigationFallback` is on, and turning it off would break every client route that is not prerendered (`/admin/*`, `/archivo/:id`, `/comunidad/:slug/n/:brandSlug`…).

Google documents two ways out for single-page apps (JavaScript SEO basics): a JS redirect to a URL the server answers with 404, or adding `noindex` with JavaScript on the error page. This site does the second:

- `components/NoIndex.tsx` adds `<meta name="robots" content="noindex">` with Helmet. The fixed robots meta in `index.html` says `index`; with conflicting rules Google applies the more restrictive one. Same pattern as `/search` and `/profile`.
- It is rendered by `NotFoundPage` (the `*` route) and by the «not found» state of the story, topic, community, brand-note and editorial pages.
- **Only when the page really does not exist** (`lib/noEncontrado.ts`): the API answered 404, or answered with no data. A network error or a 5xx does not count, or a backend hiccup while Googlebot renders would drop a real page from the index. The story page used to compute `!story || is404`, which is true on a 500 too; its «service temporarily unavailable» message never showed. Fixed with the same helper.

The fallback HTML still carries the homepage's `canonical` and content for non-JS crawlers. Google renders JavaScript and sees the `noindex`; others may not.

## One description per page (2-nov-2026)

`client/index.html` no longer carries a fixed `<meta name="description">`. With it, all 37 prerendered routes had **two** descriptions (the fixed one first), and Google usually takes the first: the same text on the whole site. Every prerendered route sets its own with Helmet, measured on all 37. Story pages are unaffected: `og.ts` strips every description from the shell and injects the story's.

## One social card per page (8-nov-2026)

`client/index.html` no longer carries fixed Open Graph or Twitter tags either. Measured live on 8-nov: 30 of the 35 static prerendered routes (plus every topic and community page) had **two** sets, the fixed one first, with the homepage title and `og:url` pointing to `/`; LinkedIn takes the first occurrence. The other five (`/alertas`, `/archivo`, `/casos`, `/fuentes`, `/saved`) set none and showed only the homepage card. Sharing almost any page showed the homepage.

- Every page sets its own: `etiquetasDePagina({ titulo, descripcion, ruta })` from `lib/seo.tsx` inside `<Helmet>` gives og:title, og:description, og:type, og:url, canonical and the common image/Twitter tags. Older pages write the tags by hand plus `CommonOgTags`.
- `client/src/lib/etiquetas-sociales.test.ts` fails if `index.html` brings any of them back, or if a route in `routes.ts` has a page without its own og:title, og:description, og:url and image. It reads the source; the prerender only runs in the build.
- Routes that are not prerendered get the fallback (the prerendered homepage), so a crawler that does not run JavaScript sees the homepage card there, as before.

## Story title and description outside the page (8-nov-2026)

The headline label is lowercase (23 of 25 published stories on 8-nov: «artesanía indígena») because on the page it is a small-caps kicker. Prefixed to the headline it opened the tab title and the social card in lowercase, and the description was cut at exactly 200 characters, mid-word. `tituloConEtiqueta` and `recortarEnPalabra` (`server/src/lib/tituloMeta.ts`, twin of `shared/utils/tituloMeta.ts`; a server test fails if the two diverge) capitalize the label and cut on a word with «…»: 160 characters for the meta description, 200 for the cards. Used by both `og.ts` routes and by `StoryPage`. The label stays in the title on purpose: the plan that split it from the headline kept the full title in the metadata.

The bot-only route (`/og/stories/:slug`) also stripped only title and og/twitter tags from the shell, so a bot got the story with the homepage description and `canonical` to `/` (measured live). It now strips and injects description and canonical like `/story-html`.

## Not-found states have their own title (8-nov-2026)

`TituloDeEstado` (`components/NoIndex.tsx`) sets the tab title of a «not found» or «service unavailable» state to the same text as its heading. Before, those states kept the homepage title from the prerendered HTML.

## Google News sitemap (`sitemap-news.xml`)

A second, separate sitemap for Google News / Discover freshness. Served at `GET /api/sitemap-news.xml` (`newsSitemapRouter` in `server/src/routes/public/sitemap.ts`); the Azure SWA rewrite in `client/public/staticwebapp.config.json` maps `/sitemap-news.xml` → `/api/sitemap-news.xml`, and `client/public/robots.txt` lists it as a second `Sitemap:` line.

- Lists only stories published in the **last 48h** (`status='published'`, non-null `slug` + `title`), capped at 1000 URLs (Google News limit), ordered newest-first.
- Uses the `news:` namespace (publication name "Impacto Indígena", language `es`, ISO-8601 `publication_date`, escaped `title`).
- Cached **15 min** (`NEWS_CACHE_MAX_AGE`) — shorter than the main sitemap's 1h so fresh stories surface fast.

## Google Discover eligibility

Discover is a large, image-first surface. Two requirements are wired in:

1. **`max-image-preview:large`** — set in the `<head>` of `client/index.html` (the prerender shell), so every prerendered page inherits it. Without it Discover won't render the large image card. Pages that must stay out of the index (Profile, Search) override it with their own `noindex` robots meta via Helmet.
2. **Image ≥ 1200px wide** — Discover only shows the large card when the story image is at least 1200px. Featured stories (relevance ≥ `heroAiMinRelevance`) already get a large AI hero. For the rest, when the source outlet's og:image is narrower than `STORY_CARD_MIN_WIDTH` (1200px), `rehostOrComposeStoryImage` (`server/src/lib/storyCard.ts`) composes a branded 1200×630 card from it with `@napi-rs/canvas` — **zero AI/Azure cost**, preserving the image-spend savings. Larger source images are rehosted verbatim. See `server/src/jobs/publishStories.ts` for the full hero strategy.

> og:image URLs are HTML-entity-decoded on extraction (`extract-og-image.ts`); a raw `&amp;` in the URL otherwise 4xxs and leaves the card broken on the site and in Discover.

## og:image and Bluesky

Bluesky does **not** auto-fetch og: metadata. Link card thumbnails are manually fetched and uploaded at post time. The current Bluesky integration (`server/src/services/bluesky.ts` `publishPost()`) hardcodes the global `/og-image.png` as the thumbnail for all posts. **If per-story og:images are added, update `publishPost()` to use the story-specific URL.** See `.context/bluesky.md` for details.
