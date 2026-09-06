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
          // Ahora un script en linea replica `pickHero` (src/lib/mix-stories.ts)
          // sobre el snapshot y agrega el <link> con la imagen correcta. Corre al
          // parsear el <head>, mucho antes de que el bundle de 126 KB se
          // descargue y ejecute, y el `fetch` reutiliza el preload de arriba, asi
          // que no cuesta una peticion extra.
          //
          // Los atributos van con setAttribute y no como propiedades: `l.as` y
          // `l.fetchPriority` se reflejan en los navegadores pero NO en jsdom, asi
          // que el test del script no podria comprobarlos.
          //
          // Replica tambien el dial de tono, que decide QUE historia es la
          // destacada y sale de localStorage. Si algo falla —storage bloqueado,
          // red, formato inesperado— no agrega nada y la imagen se descubre al
          // renderizar, que es como estaba antes de todo esto.
          if (renderedRoute.route === '/') {
            const snapshot = process.env.VITE_R2_PUBLIC_URL
              ? `${process.env.VITE_R2_PUBLIC_URL}/homepage.json`
              : '/api/homepage'
            const script = `<script>(function(){try{
var S=${JSON.stringify(snapshot)},P=50;
try{var v=localStorage.getItem('ar-positivity');if(v!==null){var n=parseInt(v,10);if(!isNaN(n)){var V=[0,25,50,75,100],c=V[0],m=Math.abs(n-c);for(var i=0;i<V.length;i++){var d=Math.abs(n-V[i]);if(d<m){c=V[i];m=d}}P=c}}}catch(e){}
fetch(S).then(function(r){return r.json()}).then(function(j){
var a=[],b=j.storiesByIssue||{};
for(var k in b){var x=b[k];if(!x)continue;
if(P===100)a=a.concat(x.uplifting||[]);
else if(P===0)a=a.concat(x.negative||[]);
else if(P>50)a=a.concat(x.uplifting||[],x.calm||[]);
else if(P<50)a=a.concat(x.negative||[]);
else a=a.concat(x.uplifting||[],x.calm||[],x.negative||[])}
if(!a.length)return;
a.sort(function(p,q){return new Date(q.datePublished||q.dateCrawled)-new Date(p.datePublished||p.dateCrawled)});
var u=a[0]&&a[0].imageUrl;if(!u)return;
var l=document.createElement('link');l.setAttribute('rel','preload');l.setAttribute('as','image');l.setAttribute('href',u);l.setAttribute('fetchpriority','high');document.head.appendChild(l)
}).catch(function(){})}catch(e){}})();</script>`
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
