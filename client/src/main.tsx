import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query'
import { AuthProvider } from './lib/auth'
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
}

// Accessibility: log a11y violations to console during development
if (import.meta.env.DEV) {
  import('@axe-core/react').then((axe) => {
    axe.default(React, ReactDOM, 1000)
  })
}

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

// Signal to the prerenderer that rendering is complete. The old fixed 100ms
// timer fired before any data loaded, so prerendered pages shipped in their
// skeleton state ("Loading stories"). Under the prerenderer (Puppeteer sets
// navigator.webdriver) we instead track in-flight fetches and dispatch once
// the network has been quiet for two consecutive checks, capped at 15s so a
// stuck request can never hang the build. Real browsers keep the cheap timer
// (the event has no listeners outside prerendering).
if (navigator.webdriver) {
  let inflight = 0
  const origFetch = window.fetch.bind(window)
  window.fetch = (...args: Parameters<typeof fetch>) => {
    inflight++
    return origFetch(...args).finally(() => { inflight-- })
  }

  const start = Date.now()
  let quietChecks = 0
  const settle = () => {
    if (inflight === 0) quietChecks++
    else quietChecks = 0
    if (quietChecks >= 2 || Date.now() - start > 15000) {
      window.fetch = origFetch
      // A short timer (not requestAnimationFrame — headless Chrome with
      // --disable-gpu may never fire rAF) lets React commit the fetched
      // data before the snapshot.
      setTimeout(() => {
        document.dispatchEvent(new Event('render-complete'))
      }, 100)
      return
    }
    setTimeout(settle, 300)
  }
  setTimeout(settle, 500)
} else {
  setTimeout(() => {
    document.dispatchEvent(new Event('render-complete'))
  }, 100)
}
