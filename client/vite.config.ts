/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import prerender from '@prerenderer/rollup-plugin'
import { routePaths } from './src/routes'
import { rutasDeSecciones, type IssueConSubsecciones } from './src/lib/issue-routes'
import { BRAND } from './src/config'
import {
  problemasDelHorneado,
  mensajeDelCandado,
  mensajeSinLista,
  describirResumen,
  ESTADO_ERROR_DE_RED,
  type ResumenApi,
} from './src/lib/verificar-horneado'
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

      // Preconnect al bucket de imagenes. Toda imagen de historia -el hero, las
      // tarjetas, la de cada ficha- viene de R2, y la primera se pide recien
      // cuando el JS leyo los datos: abrir la conexion (DNS + TCP + TLS) desde
      // el <head> la adelanta. PageSpeed lo listaba como «candidato para
      // establecer conexion previamente» con 300 ms de ahorro de LCP (6-oct-2026).
      // Van DOS, con y sin `crossorigin`, porque el navegador no comparte la
      // conexion entre peticiones con CORS y sin CORS: el snapshot
      // `homepage.json` se pide con CORS (es la PRIMERA peticion al bucket) y
      // las imagenes sin el. Con solo la version sin `crossorigin`, PageSpeed
      // marcaba la preconexion como «sin usar» (6-oct-2026, segunda corrida) y
      // seguia proponiendo el origen como candidato.
      const r2 = process.env.VITE_R2_PUBLIC_URL
      if (r2) {
        const origin = new URL(r2).origin
        html = html.replace(
          '<head>',
          `<head>\n    <link rel="preconnect" href="${origin}" crossorigin />\n    <link rel="preconnect" href="${origin}" />`,
        )
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

// El secreto con que el build se salta el limitador publico de la API (B23,
// 10-nov-2026): un build hacia 204 consultas en dos minutos, el limite es de 100
// cada 15 minutos por IP, y desde la 101 las paginas se horneaban en esqueleto.
// Viaja SOLO en las peticiones de este proceso de Node —las de abajo y el proxy
// del prerender—, nunca a la pagina: no es VITE_*, asi que Vite no lo mete en el
// bundle, y no va en `inject`. El candado de postProcess comprueba ademas que no
// aparezca en ningun HTML horneado. Vacio = el build cuenta contra el limite
// como cualquiera. El servidor lo compara en lib/prerenderBypass.ts.
const PRERENDER_BYPASS_TOKEN = (process.env.PRERENDER_BYPASS_TOKEN || '').trim()
// Solo caracteres visibles de ASCII: un encabezado HTTP no admite saltos de
// linea ni espacios en medio, y el error de `fetch` al rechazarlo copia el valor
// entero en el mensaje, que acabaria en el registro del build (revision del
// 10-nov-2026: `openssl rand -base64 64` sale en DOS lineas). Se detiene antes,
// sin escribir el valor.
if (PRERENDER_BYPASS_TOKEN && !/^[\x21-\x7E]+$/.test(PRERENDER_BYPASS_TOKEN)) {
  throw new Error(
    'PRERENDER_BYPASS_TOKEN tiene espacios, saltos de linea u otros caracteres que un encabezado HTTP no admite. ' +
      'Generarlo con `openssl rand -hex 32` (una sola linea) y ponerlo igual en GitHub y en el App Service.',
  )
}
// El mismo minimo que exige el servidor (LARGO_MINIMO en
// server/src/lib/prerenderBypass.ts). Uno mas corto el servidor lo ignora
// siempre, y el build culparia al App Service de un secreto que si esta.
const LARGO_MINIMO_SECRETO = 32
if (PRERENDER_BYPASS_TOKEN && PRERENDER_BYPASS_TOKEN.length < LARGO_MINIMO_SECRETO) {
  throw new Error(
    `PRERENDER_BYPASS_TOKEN tiene ${PRERENDER_BYPASS_TOKEN.length} caracteres y el servidor exige al menos ` +
      `${LARGO_MINIMO_SECRETO}: lo ignoraria siempre. Generarlo con \`openssl rand -hex 32\` (64 caracteres).`,
  )
}
const ENCABEZADOS_PRERENDER: Record<string, string> = PRERENDER_BYPASS_TOKEN
  ? { 'x-prerender-token': PRERENDER_BYPASS_TOKEN }
  : {}
/** Por si un mensaje de error de terceros llegara a copiar el valor: se tacha. */
const sinSecreto = (texto: string): string =>
  PRERENDER_BYPASS_TOKEN ? texto.split(PRERENDER_BYPASS_TOKEN).join('[PRERENDER_BYPASS_TOKEN]') : texto

// Lo que respondio la API durante el prerender, para el registro del build y
// para el mensaje del candado. Una respuesta con RateLimit-Limit paso por el
// limitador: con el secreto bien puesto no deberia haber ninguna.
const consultasApi: ResumenApi = { total: 0, porEstado: {}, conLimite: 0 }
function anotarRespuesta(estado: number | string | undefined, conLimite: boolean) {
  consultasApi.total++
  const clave = String(estado ?? 'sin-estado')
  consultasApi.porEstado[clave] = (consultasApi.porEstado[clave] ?? 0) + 1
  if (conLimite) consultasApi.conLimite++
}

/**
 * Las dos listas que se piden antes de hornear. Avisa en el registro si el
 * secreto esta puesto y aun asi la respuesta paso por el limitador: es la
 * senal de que falta en el App Service o no coincide.
 */
async function pedirLista(url: string): Promise<Response> {
  const res = await fetch(url, { headers: ENCABEZADOS_PRERENDER }).catch((err) => {
    anotarRespuesta(ESTADO_ERROR_DE_RED, false)
    throw err
  })
  const conLimite = res.headers.has('ratelimit-limit')
  anotarRespuesta(res.status, conLimite)
  if (PRERENDER_BYPASS_TOKEN && conLimite) {
    console.warn('[prerender] PRERENDER_BYPASS_TOKEN esta puesto pero la API igual aplico el limite: ¿falta en el App Service o no coincide?')
  }
  return res
}

// Si una de las dos listas FALLA, el build se DETIENE (antes las saltaba en
// silencio). Medido el 10-nov-2026: con el cupo de la API agotado, las dos
// listas dieron 429, el build horneo solo las 35 rutas fijas y termino en
// verde. Como cada despliegue reemplaza el sitio entero, eso habria BORRADO
// las 50 paginas de temas y comunidades publicadas. Una lista VACIA con HTTP 200
// si es un dato: el panel permite desactivar comunidades, y entonces sus
// paginas deben salir del sitio; detenerse ahi bloquearia todo despliegue, el
// workflow_dispatch del 1-dic incluido (revision del 10-nov-2026). Sin
// PRERENDER_API_URL no se piden y no hay nada que detener.
async function pedirListaODetener<T>(que: 'temas' | 'comunidades', url: string): Promise<T> {
  const res = await pedirLista(url).catch((err: Error & { cause?: unknown }) => {
    // `fetch` de Node solo dice «fetch failed»: la causa real (ECONNREFUSED,
    // DNS, certificado) viene en `cause`.
    const causa = err.cause ? ` (${String((err.cause as Error).message ?? err.cause)})` : ''
    throw new Error(mensajeSinLista(que, url, sinSecreto(`${String(err)}${causa}`)))
  })
  if (!res.ok) throw new Error(mensajeSinLista(que, url, res.status))
  try {
    return (await res.json()) as T
  } catch (err) {
    throw new Error(mensajeSinLista(que, url, `la respuesta no es JSON: ${sinSecreto(String(err))}`))
  }
}

async function fetchIssueSlugs(): Promise<string[]> {
  const apiUrl = PRERENDER_API_URL
  if (!apiUrl) return []

  // `getPublicIssues()` filtra `parentId: null` y trae las subsecciones
  // ANIDADAS en `children`, asi que quedarse con el primer nivel las tira.
  // `rutasDeSecciones` las aplana; el por que esta en su modulo.
  const issues = await pedirListaODetener<IssueConSubsecciones[]>('temas', `${apiUrl}/api/issues`)
  const rutas = rutasDeSecciones(issues)
  if (rutas.length === 0) console.warn('[prerender] la API devolvio 0 temas: no se hornea ninguno')
  console.log(`[prerender] fetched ${issues.length} issue slugs + subsections = ${rutas.length} routes`)
  return rutas
}

async function fetchCommunitySlugs(): Promise<string[]> {
  const apiUrl = PRERENDER_API_URL
  if (!apiUrl) return []

  const communities = await pedirListaODetener<{ slug: string }[]>('comunidades', `${apiUrl}/api/communities`)
  if (communities.length === 0) console.warn('[prerender] la API devolvio 0 comunidades activas: no se hornea ninguna')
  console.log(`[prerender] fetched ${communities.length} community slugs`)
  return communities.map((c) => `/comunidad/${c.slug}`)
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
          ? {
              server: {
                proxy: {
                  '/api': {
                    target: PRERENDER_API_URL,
                    changeOrigin: true,
                    // El secreto del limitador (vacio si no hay): ver arriba.
                    headers: ENCABEZADOS_PRERENDER,
                    onProxyRes: (proxyRes: { statusCode?: number; headers: Record<string, unknown> }) => {
                      anotarRespuesta(proxyRes.statusCode, proxyRes.headers['ratelimit-limit'] !== undefined)
                    },
                    // Una peticion que falla sin respuesta (conexion cortada,
                    // DNS, tiempo agotado) no pasa por onProxyRes: sin esto el
                    // resumen del candado la omitia y culpaba a la pagina.
                    onError: (
                      err: Error,
                      _req: unknown,
                      res: { headersSent?: boolean; writeHead?: (s: number, h?: Record<string, string>) => void; end: (b?: string) => void } | undefined,
                    ) => {
                      // Sin respuesta a la que escribir (destino mal configurado):
                      // lo mismo que el manejador por defecto, que relanza.
                      if (!res) throw err
                      anotarRespuesta(ESTADO_ERROR_DE_RED, false)
                      if (!res.headersSent && res.writeHead) res.writeHead(502, { 'content-type': 'text/plain' })
                      res.end('prerender proxy: la API no respondio')
                    },
                  },
                },
              },
            }
          : {}),
        rendererOptions: {
          maxConcurrentRoutes: 4,
          timeout: 60000,
          renderAfterDocumentEvent: 'render-complete',
          // Marca `window.__PRERENDER_INJECTED` antes de cualquier script. Los
          // componentes la leen con `lib/prerender.ts` para NO hornear en el
          // HTML estados que solo describen la red del build: el 6-oct-2026 el
          // hero salio sin `srcset` porque su variante dio 404 en Puppeteer.
          inject: { prerender: true },
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
        postProcess(renderedRoute, renderedRoutes) {
          // El candado (B23): se revisan TODAS las rutas una vez, en la primera,
          // para que el error las nombre a todas y no solo a la primera que
          // falle. Un throw aca lo convierte el plugin en `this.error` y el
          // build termina en rojo: no se despliega nada y produccion queda como
          // estaba. Solo con PRERENDER_API_URL, que es cuando el build hornea
          // datos; sin API (un build local cualquiera) las paginas no tienen de
          // donde sacarlos y no hay nada que comprobar.
          if (PRERENDER_API_URL && renderedRoute === renderedRoutes[0]) {
            console.log(`[prerender] ${describirResumen(consultasApi)}`)
            if (PRERENDER_BYPASS_TOKEN && consultasApi.conLimite > 0) {
              console.warn(`[prerender] el secreto no salto el limitador en ${consultasApi.conLimite} consultas: ¿falta PRERENDER_BYPASS_TOKEN en el App Service o no coincide?`)
            }
            const problemas = problemasDelHorneado(renderedRoutes, { secreto: PRERENDER_BYPASS_TOKEN })
            if (problemas.length > 0) {
              throw new Error(mensajeDelCandado(problemas, consultasApi))
            }
            console.log(`[prerender] candado: las ${renderedRoutes.length} paginas tienen su og:url propio`)
          }

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
          //
          // Y va con `async`. Sin el, un <script src> en el <head> frena el
          // parser hasta que el archivo baja y corre: PageSpeed lo medía como
          // bloqueante del renderizado durante 470 ms en 4G lento (6-oct-2026),
          // el primer item de «solicitudes que bloquean el renderizado». Todo lo
          // que hace es asincrono -un fetch y un <link>-, asi que no necesita
          // frenar nada; con async el navegador lo descubre igual de temprano,
          // lo corre en cuanto llega y sigue pintando mientras tanto.
          if (renderedRoute.route === '/') {
            const script = `<script src="/preload-hero.js" async></script>`
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
