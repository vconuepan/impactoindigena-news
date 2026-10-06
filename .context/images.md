# Image Optimization System

This document describes how images are managed, optimized, and used in the website.

## Directory Structure

```
client/public/images/
├── *.jpg, *.png           # Original images (never modified)
├── optimized/             # Generated WebP variants
│   ├── *-thumb-w.webp     # 80px wide
│   ├── *-thumb-h.webp     # 80px tall
│   ├── *-small-w.webp     # 160px wide
│   ├── *-small-h.webp     # 160px tall
│   ├── *-medium-w.webp    # 320px wide
│   ├── *-medium-h.webp    # 320px tall
│   ├── *-large-w.webp     # 640px wide
│   ├── *-large-h.webp     # 640px tall
│   ├── *-xlarge-w.webp    # 1024px wide
│   └── *-xlarge-h.webp    # 1024px tall
└── logos/                 # Source/publication logos
```

## CLI Commands

All commands run from the `client/` directory:

| Command | Description |
|---------|-------------|
| `npm run images:info` | List all images with sizes and available variants |
| `npm run images:optimize` | Generate missing WebP variants for all images |
| `npm run images:optimize-single -- <path> [preset]` | Optimize a single image |
| `npm run images:clean` | Remove all generated variants |

### Examples

```bash
# See what images exist and what variants are available
npm run images:info

# Generate all missing optimized variants
npm run images:optimize

# Optimize a specific image with all presets
npm run images:optimize-single -- images/some-image.jpg

# Optimize with one preset
npm run images:optimize-single -- images/some-image.jpg small-w
```

## Size Presets

| Preset | Size | Use Case |
|--------|------|----------|
| `thumb` | 80px | Source logos, small thumbnails |
| `small` | 160px | Story card thumbnails |
| `medium` | 320px | Card images, panel photos |
| `large` | 640px | Featured story images |
| `xlarge` | 1024px | Full-width or hero images |

Each preset has two orientations:
- `-w` (width-constrained): Height scales proportionally
- `-h` (height-constrained): Width scales proportionally

## Choosing the Right Preset

**Use `-w` presets when CSS constrains width:**
```tsx
<img src="/images/optimized/story-thumb-small-w.webp" className="w-32 h-32" />
```

**Use `-h` presets when CSS constrains height:**
```tsx
<img src="/images/optimized/featured-story-medium-h.webp" className="w-full h-48 object-cover" />
```

## Adding New Images

1. Add the original image to `client/public/images/` (or a subdirectory)
2. Run the optimizer:
   ```bash
   cd client
   npm run images:optimize-single -- images/your-new-image.jpg
   ```
3. Check what was generated: `npm run images:info`
4. Use the appropriate variant in your component

## Retina/HiDPI Support

Preset sizes are chosen to support 2x retina displays:
- For 64px CSS display, use `thumb` (80px)
- For 128px CSS display, use `small` (160px)
- For 256px CSS display, use `medium` (320px)

## Technical Details

- **Format:** All optimized images are WebP (80% quality)
- **Aspect ratio:** Always preserved
- **Skip behavior:** Variants larger than the original are skipped
- **Originals:** Never modified or deleted
- **Script location:** `client/scripts/images.mjs`

## Story Images on R2: Web Variants

Story images (hero, cards, story page) are not the `client/public/images/` files above: they are uploaded by the pipeline to the R2 bucket under `social/` and referenced by `Story.imageUrl`. Three upload paths, all in `server/src/lib/`: `imageGen.ts` (AI-generated), `storyCard.ts` (`oghero-*` rehosted source photo, `storycard-*` branded card composed at 2400×1260 for social previews).

**The problem (PageSpeed mobile, 2026-10-06):** cards requested the original to paint it at ~405px. Composed cards weigh 300-500 KB each; ~20 of them on one phone screen were 4.7 MB competing with the LCP image. Lighthouse estimated 2,326 KiB of savings.

**The fix:** next to every original the pipeline stores two JPEG renditions, named by convention:

| Original | Variants |
|---|---|
| `social/storycard-<id>.jpg` | `social/storycard-<id>-w800.jpg`, `social/storycard-<id>-w1200.jpg` |
| `social/oghero-<id>.png` | `social/oghero-<id>-w800.jpg`, `social/oghero-<id>-w1200.jpg` |

- Widths: 800 (card at 2× DPR) and 1200 (hero). Quality 80. Never upscaled: a 600px original yields 600px variants.
- `Story.imageUrl` and the `og:image` do not change: social platforms keep fetching the original.
- Server: `server/src/lib/imagen-variantes.ts` (`subirVariantesWeb`, called right after each original upload; never throws).
- Client: `client/src/lib/story-image.ts` (`srcSetDeImagen`) derives the URLs; `CardImage` in `StoryCard.tsx`, the home hero and `StoryPage` render `srcset` + `sizes` with the original in `src`. **The two copies are kept in sync by `client/src/lib/story-image.test.ts`, which reads the server file.**
- Story pages: `server/src/routes/og.ts` emits the `<link rel="preload">` with `imagesrcset`/`imagesizes` so the preloaded candidate is the one the `<img>` picks. The home does the same in `client/public/preload-hero.js`.
- **404 fallback:** the browser does not try another `srcset` candidate when the chosen one fails. Images uploaded before 2026-10-06 have no variants until the backfill runs, so every consumer drops `srcset` on the first error and loads `src`; only if that fails too does it show the no-photo fill.

**Backfill for existing images** (adds objects only; touches no original and no DB row):

```bash
npm run migration:variantes-web:portada --prefix server        # dry run, only images in homepage.json
npm run migration:variantes-web:portada:apply --prefix server
npm run migration:variantes-web --prefix server                # dry run, whole bucket
npm run migration:variantes-web:apply --prefix server
npm run migration:variantes-web:borrar --prefix server         # deletes ALL variants (the undo)
```

Script: `server/src/scripts/migrations/generar-variantes-web.ts`. Needs the R2 variables from `server/.env`; it does not use Prisma.

## Feed Favicons (`client/public/images/feeds/`)

One PNG per feed, named `{feedId}.png`, fetched by `server/src/services/favicon.ts`. Three strategies in order: Google's favicon service (`s2/favicons?sz=32`), the `<link rel="icon">` declared by the site, then `/favicon.ico` at the origin. The buffer is written as-is — no resize — so files range from 16x16 to 64x64 depending on what the source publishes.

**The "Obtener favicons" button does nothing visible in production.** `FAVICON_DIR` defaults to `client/public/images/feeds`, which is the **static site** directory. In production the backend runs on App Service and the frontend is a separate Static Web App built from the repo, so a favicon written on the server never reaches the deployed site. Favicons only ship if they are generated locally and committed.

So when a feed shows no icon in production (the component hides itself, it does not render broken), the fix is:

1. Get the feed's `id` and domain
2. Fetch the favicon **following redirects** — `curl -sL`, because Google answers the redirect-less request with HTML, and check `content-type: image/*` before saving. `favicon.ts` validates this; a manual `curl` without `-L` will happily save an HTML error page as `.png`
3. Confirm the result is not Google's generic globe — that is what it returns for domains with no real favicon
4. Commit the file

Small sources sometimes publish only a 16x16 icon (Cultural Survival is one). Leave it at native size; upscaling a 16x16 looks worse than the original.
