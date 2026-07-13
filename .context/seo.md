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

Sitemap: https://impactoindigena.news/sitemap.xml
```

## sitemap.xml

Served dynamically by the backend at `GET /api/sitemap.xml`. In production, a Render rewrite rule proxies `/sitemap.xml` to the backend endpoint so crawlers see it at the canonical URL.

### How It Works

1. `GET /api/sitemap.xml` queries all published stories (slug + datePublished) from the database
2. Combines with hardcoded static routes (same list as `client/src/routes.ts`)
3. Generates XML with `<lastmod>` for stories using `datePublished`
4. Response is cached in-memory (TTL: `config.sitemap.cacheMaxAge`, default 1 hour)
5. `Cache-Control: public, max-age=3600` header allows CDN/proxy caching
6. New stories appear in the sitemap automatically within the cache TTL

### Render Rewrite Rule

| Field | Value |
|-------|-------|
| Source | `/sitemap.xml` |
| Destination | `https://<backend-service>.onrender.com/api/sitemap.xml` |
| Action | **Rewrite** |

**Critical — Rule Order:**
- Render evaluates rewrite rules **top-to-bottom, first match wins**
- The `/sitemap.xml` rule must appear **before** the SPA catch-all rule (`/*` → `/index.html`)
- If reversed, the catch-all matches first and serves the SPA shell, which then 404s on the client

**Important:** No static `sitemap.xml` file should exist in `client/public/` — Render serves static files before applying rewrite rules.

### Configuration

| Config Key | Env Var | Default | Description |
|-----------|---------|---------|-------------|
| `config.sitemap.cacheMaxAge` | `SITEMAP_CACHE_MAX_AGE` | `3600` | Cache TTL in seconds |

### Legacy Build-Time Generation

The build-time sitemap generator (`client/scripts/generate-sitemap.ts`) is kept for local development/testing but is no longer part of the client build command.

## Adding a New Route

When adding a page, add sitemap metadata in **two places**:

1. `client/src/routes.ts` — for prerendering
2. `server/src/routes/public/sitemap.ts` `STATIC_ROUTES` array — for the dynamic sitemap

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
