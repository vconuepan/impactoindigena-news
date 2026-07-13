/// <reference types="vite/client" />

// SimpleAnalytics custom events (privacy-first analytics loaded in index.html).
// Present once scripts.simpleanalyticscdn.com/latest.js has loaded; guard calls
// with `typeof window.sa_event === 'function'`.
interface Window {
  sa_event?: (event: string, metadata?: Record<string, unknown>) => void
}
