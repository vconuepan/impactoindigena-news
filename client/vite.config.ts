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

async function fetchStorySlugs(): Promise<string[]> {
  const apiUrl = PRERENDER_API_URL
  if (!apiUrl) return []

  const slugs: string[] = []

  try {
    const pages = Math.ceil(PRERENDER_STORY_LIMIT / STORY_PAGE_SIZE)
    for (let page = 1; page <= pages; page++) {
      const res = await fetch(`${apiUrl}/api/stories?page=${page}&pageSize=${STORY_PAGE_SIZE}`)
      if (!res.ok) break
      const data = await res.json() as { data: { slug: string | null }[] }
      if (!data.data.length) break
      for (const story of data.data) {
        if (story.slug && slugs.length < PRERENDER_STORY_LIMIT) {
          slugs.push(`/stories/${story.slug}`)
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
