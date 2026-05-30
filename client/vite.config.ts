/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import prerender from '@prerenderer/rollup-plugin'
import { routePaths } from './src/routes'
import { BRAND } from './src/config'
import path from 'path'

// Plugin to inject preconnect for cross-origin API and brand copy
function htmlTransformPlugin(): Plugin {
  return {
    name: 'html-transform',
    transformIndexHtml(html) {
      // Inject brand description
      html = html.replace('__BRAND_DESCRIPTION__', `${BRAND.claim} ${BRAND.claimSupport}`)

      // Inject preconnect for cross-origin API
      const apiUrl = process.env.VITE_API_URL
      if (apiUrl) {
        const origin = new URL(apiUrl).origin
        const preconnectTags = `
    <link rel="preconnect" href="${origin}" crossorigin />
    <link rel="dns-prefetch" href="${origin}" />`
        html = html.replace('<head>', '<head>' + preconnectTags)
      }

      return html
    },
  }
}

// Only prerender the most recent stories. Older stories are served client-side
// on first visit. 300 covers ~3-4 months of content — enough so LinkedIn and
// other scrapers can read OG tags for any recently-shared story.
const PRERENDER_STORY_LIMIT = 300

// Build-time API URL for prerender fetches. When the backend is locked behind
// the Azure SWA linked-backend proxy (Easy Auth), it can't be reached directly,
// so the build fetches slugs through the SWA public proxy URL via
// PRERENDER_API_URL. Falls back to VITE_API_URL for local/other deploys.
const PRERENDER_API_URL = process.env.PRERENDER_API_URL || process.env.VITE_API_URL

// The /api/stories endpoint caps pageSize at 100, so fetch in pages until we
// reach PRERENDER_STORY_LIMIT or run out of stories.
const STORY_PAGE_SIZE = 100

interface StoryMeta {
  title: string | null
  titleLabel: string | null
  summary: string | null
  imageUrl: string | null
  datePublished: string | null
}

// Map of route path → story metadata, populated during fetchStorySlugs and
// consumed in postProcess to bake real OG tags into each prerendered story
// page. The React app's render-complete event fires at a fixed 100ms (before
// async story data loads), so the rendered HTML carries generic OG tags;
// injecting here guarantees crawlers see story-specific title/image/desc.
const storyMetaByRoute = new Map<string, StoryMeta>()

async function fetchStorySlugs(): Promise<string[]> {
  const apiUrl = PRERENDER_API_URL
  if (!apiUrl) return []

  const slugs: string[] = []

  try {
    const pages = Math.ceil(PRERENDER_STORY_LIMIT / STORY_PAGE_SIZE)
    for (let page = 1; page <= pages; page++) {
      const res = await fetch(`${apiUrl}/api/stories?page=${page}&pageSize=${STORY_PAGE_SIZE}`)
      if (!res.ok) break
      const data = await res.json() as { data: (StoryMeta & { slug: string | null })[] }
      if (!data.data.length) break
      for (const story of data.data) {
        if (story.slug && slugs.length < PRERENDER_STORY_LIMIT) {
          const route = `/stories/${story.slug}`
          slugs.push(route)
          storyMetaByRoute.set(route, {
            title: story.title,
            titleLabel: story.titleLabel,
            summary: story.summary,
            imageUrl: story.imageUrl,
            datePublished: story.datePublished,
          })
        }
      }
      if (data.data.length < STORY_PAGE_SIZE) break
    }
    console.log(`[prerender] fetched ${slugs.length} story slugs (capped at ${PRERENDER_STORY_LIMIT})`)
  } catch (err) {
    console.warn('[prerender] could not fetch story slugs, skipping story prerender:', err)
  }

  return slugs
}

const SITE_URL = 'https://impactoindigena.news'
const FALLBACK_OG_IMAGE = `${SITE_URL}/images/og-image.png`

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Inject story-specific OG/Twitter tags into a prerendered story page, removing
// any generic ones the React shell rendered first.
function injectStoryOgTags(html: string, route: string): string {
  const meta = storyMetaByRoute.get(route)
  if (!meta) return html

  const slug = route.replace('/stories/', '')
  const title = meta.title || slug
  const fullTitle = meta.titleLabel ? `${meta.titleLabel}: ${title}` : title
  const description = (meta.summary || fullTitle).slice(0, 200)
  const image = meta.imageUrl || FALLBACK_OG_IMAGE
  const url = `${SITE_URL}/stories/${slug}`

  const t = escapeAttr(fullTitle)
  const d = escapeAttr(description)
  // og:image URLs must not HTML-escape & — many parsers use the raw value.
  const img = image.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E')

  const ogTags = `
  <title>${t} - Impacto Indígena</title>
  <meta name="description" content="${d}" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Impacto Indígena" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${img}" />`

  // Strip the generic title and og/twitter tags the shell rendered, then inject.
  const cleaned = html
    .replace(/<title>[^<]*<\/title>/i, '')
    .replace(/<meta[^>]+(property=["']og:[^"']*["']|name=["']twitter:[^"']*["'])[^>]*\/?>/gi, '')
    .replace(/<meta[^>]+name=["']description["'][^>]*\/?>/gi, '')

  return cleaned.replace('<head>', `<head>${ogTags}`)
}

async function fetchIssueSlugs(): Promise<string[]> {
  const apiUrl = PRERENDER_API_URL
  if (!apiUrl) return []

  try {
    const res = await fetch(`${apiUrl}/api/issues`)
    if (!res.ok) return []
    const issues = await res.json() as { slug: string }[]
    console.log(`[prerender] fetched ${issues.length} issue slugs`)
    return issues.map((i) => `/issues/${i.slug}`)
  } catch (err) {
    console.warn('[prerender] could not fetch issue slugs, skipping issue prerender:', err)
    return []
  }
}

async function fetchCommunitySlugs(): Promise<string[]> {
  const apiUrl = PRERENDER_API_URL
  if (!apiUrl) return []

  try {
    const res = await fetch(`${apiUrl}/api/communities`)
    if (!res.ok) return []
    const communities = await res.json() as { slug: string }[]
    console.log(`[prerender] fetched ${communities.length} community slugs`)
    return communities.map((c) => `/comunidad/${c.slug}`)
  } catch (err) {
    console.warn('[prerender] could not fetch community slugs, skipping community prerender:', err)
    return []
  }
}

export default defineConfig(async () => {
  const [storySlugs, issueSlugs, communitySlugs] = await Promise.all([
    fetchStorySlugs(),
    fetchIssueSlugs(),
    fetchCommunitySlugs(),
  ])
  const allRoutes = [...routePaths, ...issueSlugs, ...communitySlugs, ...storySlugs]

  return {
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    plugins: [
      htmlTransformPlugin(),
      react(),
      prerender({
        routes: allRoutes,
        renderer: '@prerenderer/renderer-puppeteer',
        rendererOptions: {
          maxConcurrentRoutes: 4,
          timeout: 60000,
          renderAfterDocumentEvent: 'render-complete',
          launchOptions: {
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
              '--single-process',
              '--disable-features=VizDisplayCompositor',
              '--disable-software-rasterizer',
              '--disable-extensions',
            ],
          },
        },
        postProcess(renderedRoute) {
          if (!renderedRoute.html.startsWith('<!DOCTYPE')) {
            renderedRoute.html = '<!DOCTYPE html>' + renderedRoute.html
          }

          // Bake story-specific OG tags into prerendered story pages.
          if (renderedRoute.route.startsWith('/stories/')) {
            renderedRoute.html = injectStoryOgTags(renderedRoute.html, renderedRoute.route)
          }

          // Preload homepage API data to avoid JS→API chain
          const apiUrl = process.env.VITE_API_URL
          if (renderedRoute.route === '/' && apiUrl) {
            const preloadTag = `<link rel="preload" href="${apiUrl}/api/homepage" as="fetch" crossorigin />`
            renderedRoute.html = renderedRoute.html.replace('</head>', preloadTag + '\n</head>')
          }

          return renderedRoute
        },
      }),
    ],
    server: {
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          // Let Rollup handle chunking automatically. Admin code will be
          // code-split via React.lazy() dynamic imports in App.tsx.
          // No manualChunks needed - this avoids the React internals issue
          // where admin-vendor would pull in shared React code.
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
