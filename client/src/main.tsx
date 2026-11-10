import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import { queryClient } from './lib/query'
import { datosDePortadaAntesDeMontar } from './lib/arranque-portada'
import { HOMEPAGE_SNAPSHOT_URL } from './config'
import { AuthProvider } from './lib/auth'
import { instalarRecargaPorVersion } from './lib/recarga-por-version'
import {
  avisarCuandoTermine,
  consultasActivas,
  consultasIncompletas,
  fijarFocoParaElPrerender,
  registroDeFallasApi,
  rutaDeApi,
  ATRIBUTO_INCOMPLETO,
} from './lib/prerender'
import App from './App'
import './i18n'
import './index.css'

// Prerender-only fix: headless Chrome with --disable-gpu fires
// requestAnimationFrame unreliably, and react-helmet-async defers its <head>
// commit to rAF (commitTagChanges runs inside requestAnimationFrame). Without a
// real frame, per-page <title>/canonical/hreflang/JSON-LD never reach the
// snapshot, so the home and lazy SPA routes prerendered with the generic
// homepage head. Shim rAF to a timer so Helmet flushes deterministically.
// Gated on navigator.webdriver — never affects real browsers. Must run before
// React commits effects (i.e. before createRoot().render below).
if (typeof navigator !== 'undefined' && navigator.webdriver) {
  window.requestAnimationFrame = ((cb: FrameRequestCallback): number =>
    window.setTimeout(() => cb(performance.now()), 0) as unknown as number) as typeof window.requestAnimationFrame
  // Y que TanStack Query no pause los reintentos en las pestanas ocultas del
  // prerender (3 de cada 4 con `maxConcurrentRoutes: 4`): ver
  // `fijarFocoParaElPrerender`. Tambien antes de montar, antes de la primera consulta.
  fijarFocoParaElPrerender(focusManager)
}

// Accessibility: log a11y violations to console during development
if (import.meta.env.DEV) {
  import('@axe-core/react').then((axe) => {
    axe.default(React, ReactDOM, 1000)
  })
}

// Un despliegue borra los chunks anteriores: la pestaña abierta se recarga sola
// una vez en vez de quedar rota al navegar. Detalle en lib/recarga-por-version.ts.
instalarRecargaPorVersion()

function montar(): void {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </HelmetProvider>
    </StrictMode>,
  )
}

// En la portada prerenderizada, React espera el snapshot (con tope) y arranca
// con los datos ya en cache: asi no borra el hero que el HTML ya pinto para
// poner un esqueleto, y el pintado prerenderizado cuenta como LCP. El porque,
// con la traza que lo mide, en `lib/arranque-portada.ts`. En cualquier otra
// ruta, o sin HTML prerenderizado, monta de inmediato como siempre.
datosDePortadaAntesDeMontar({
  pathname: window.location.pathname,
  root: document.getElementById('root'),
  snapshotUrl: HOMEPAGE_SNAPSHOT_URL,
  queryClient,
  snapshotPendiente: (window as unknown as { __snapshotPortada?: Promise<unknown> }).__snapshotPortada,
}).finally(montar)

// Signal to the prerenderer that rendering is complete. The old fixed 100ms
// timer fired before any data loaded, so prerendered pages shipped in their
// skeleton state ("Loading stories"). Under the prerenderer (Puppeteer sets
// navigator.webdriver) we instead track in-flight fetches AND TanStack queries
// (a query waiting to retry after a 429 has no fetch open: B23, 10-nov-2026)
// and dispatch once both have been quiet for two consecutive checks, capped at
// 15s so a stuck request can never hang the build. See `avisarCuandoTermine`.
// Real browsers keep the cheap timer (the event has no listeners outside
// prerendering).
if (navigator.webdriver) {
  let inflight = 0
  const origFetch = window.fetch.bind(window)
  // Lo que la pagina pide con `fetch` directo, fuera de TanStack: si falla y no
  // se repone, tambien deja la pagina incompleta (ver `registroDeFallasApi`).
  const fallasApi = registroDeFallasApi()
  window.fetch = (...args: Parameters<typeof fetch>) => {
    inflight++
    const ruta = rutaDeApi(args[0], window.location.href)
    return origFetch(...args)
      .then(
        (res) => {
          if (ruta) fallasApi.anotar(ruta, res.ok ? null : String(res.status))
          return res
        },
        (err) => {
          if (ruta) fallasApi.anotar(ruta, 'red')
          throw err
        },
      )
      .finally(() => { inflight-- })
  }

  avisarCuandoTermine({
    fetchesEnVuelo: () => inflight,
    // Fetching o en pausa: `isFetching()` no cuenta las pausadas.
    consultasEnCurso: () => consultasActivas(queryClient),
    alTerminar: () => {
      window.fetch = origFetch
      // A short timer (not requestAnimationFrame — headless Chrome with
      // --disable-gpu may never fire rAF) lets React commit the fetched
      // data before the snapshot.
      setTimeout(() => {
        // Si quedo una consulta en error o sin terminar, la pagina lo deja
        // escrito en <html> y el candado del build la detiene: asi tambien se
        // ven las rutas fijas que piden datos, cuyo og:url no depende de ellos.
        const incompletas = [...consultasIncompletas(queryClient), ...fallasApi.pendientes()]
        if (incompletas.length > 0) {
          document.documentElement.setAttribute(ATRIBUTO_INCOMPLETO, incompletas.join(' | ').slice(0, 400))
        }
        document.dispatchEvent(new Event('render-complete'))
      }, 100)
    },
  })
} else {
  setTimeout(() => {
    document.dispatchEvent(new Event('render-complete'))
  }, 100)
}
