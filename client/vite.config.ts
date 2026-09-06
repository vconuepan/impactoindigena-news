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

// Build-time API URL for prerender fetches. When the backend is locked behind
// the Azure SWA linked-backend proxy (Easy Auth), it can't be reached directly,
// so the build fetches slugs through the SWA public proxy URL via
// PRERENDER_API_URL. Falls back to VITE_API_URL for local/other deploys.
//
// Story pages are NOT prerendered: /stories/* is rewritten to the backend
// (staticwebapp.config.json → /api/og/story-html), which serves the shell with
// always-fresh OG tags for every story, including ones published after the
// last frontend deploy. Prerendering here covers the home, evergreen pages,
// issues, and communities.
const PRERENDER_API_URL = process.env.PRERENDER_API_URL || process.env.VITE_API_URL

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
  const [issueSlugs, communitySlugs] = await Promise.all([
    fetchIssueSlugs(),
    fetchCommunitySlugs(),
  ])
  const allRoutes = [...routePaths, ...issueSlugs, ...communitySlugs]

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
        // Proxy the app's same-origin /api calls to the real backend during
        // prerendering. Without this, the prerenderer's static file server
        // answers /api/* with index.html, so pages rendered in their skeleton
        // state ("Loading stories") and the deployed home shipped without
        // content (design review 2026-06).
        ...(PRERENDER_API_URL
          ? { server: { proxy: { '/api': { target: PRERENDER_API_URL, changeOrigin: true } } } }
          : {}),
        rendererOptions: {
          maxConcurrentRoutes: 4,
          timeout: 60000,
          renderAfterDocumentEvent: 'render-complete',
          launchOptions: {
            args: [
              // Prerender in Spanish: without this, headless Chrome reports
              // English and i18next bakes mixed-language content into the HTML.
              '--lang=es-CL',
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

          // Preload de los datos de la portada, para romper la cadena
          // HTML → JS → API.
          //
          // Ruta RELATIVA y sin `crossorigin`. Estaba escrito como
          // `${VITE_API_URL}/api/homepage` con `crossorigin`, y las dos cosas
          // estaban mal: `VITE_API_URL` vale "" a proposito -la API es del
          // mismo origen y se proxea- asi que la condicion `&& apiUrl` era
          // falsa y el preload NUNCA se emitio; y `crossorigin` en una peticion
          // same-origin hace que el navegador descarte el preload y descargue
          // dos veces.
          //
          // Importa porque el LCP no lo decide la imagen sino los DATOS: React
          // reconstruye el DOM y solo pinta el hero cuando llega la respuesta.
          // Medido el 5-sep-2026: el JS llega a los 1.434 ms y la peticion
          // arranca a los 1.476, o sea recien cuando el JS la dispara.
          if (renderedRoute.route === '/') {
            // Apunta al snapshot de R2 cuando lo hay, que es de donde el cliente
            // lee primero; si no, al endpoint. Precargar el que NO se va a usar
            // seria una descarga de mas, no una de menos.
            const snapshot = process.env.VITE_R2_PUBLIC_URL
              ? `${process.env.VITE_R2_PUBLIC_URL}/homepage.json`
              : '/api/homepage'
            // `crossorigin` solo cuando de verdad es otro origen: en same-origin
            // hace que el navegador descarte el preload y descargue dos veces.
            const cross = snapshot.startsWith('http') ? ' crossorigin' : ''
            const preloadTag = `<link rel="preload" href="${snapshot}" as="fetch"${cross} />`
            renderedRoute.html = renderedRoute.html.replace('</head>', preloadTag + '\n</head>')
          }

          // Y la imagen del hero, que es el elemento que mide el LCP.
          //
          // Este preload NO se hornea: se resuelve en el navegador.
          //
          // La version anterior sacaba la URL del HTML ya renderizado, o sea la
          // destacada que habia AL COMPILAR. Pero el cliente no lee ese HTML: lee
          // `homepage.json` de R2, que el job de publicacion reescribe varias
          // veces al dia. Medido el 6-sep-2026, unas horas despues del ultimo
          // despliegue: el HTML precargaba `oghero-eeefd92b...jpg` con prioridad
          // alta mientras la destacada real ya era `storycard-cd289536...`. El
          // "load delay" habia pasado de 1.372 a 6.268 ms — la imagen que si
          // medía el LCP recien se descubria cuando el JS habia leido el
          // snapshot y renderizado.
          //
          // El comentario que estaba aca ya lo anticipaba —«la portada cambia de
          // destacada cada dia»— y el preload seguia atado al build igual.
          //
          // Ahora lo resuelve `public/preload-hero.js`, que replica `pickHero`
          // sobre el snapshot y agrega el <link> con la imagen correcta. Corre al
          // parsear el <head>, antes de que el bundle de 126 KB se descargue, y su
          // `fetch` reutiliza el preload del snapshot que va arriba.
          //
          // Es un ARCHIVO y no un script en linea porque la CSP del sitio declara
          // `script-src 'self'` sin `unsafe-inline`: la primera version era inline
          // y en produccion el navegador la bloqueaba antes de ejecutarla, en
          // silencio salvo por un error en consola.
          if (renderedRoute.route === '/') {
            const snapshot = process.env.VITE_R2_PUBLIC_URL
              ? `${process.env.VITE_R2_PUBLIC_URL}/homepage.json`
              : '/api/homepage'
            const script = `<script src="/preload-hero.js"></script>`
            renderedRoute.html = renderedRoute.html.replace('</head>', script + '\n</head>')
            console.log('[prerender] preload del hero: se resuelve en el navegador desde el snapshot')
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
