const CACHE_NAME = 'impacto-indigena-v2'
const STATIC_ASSETS = [
  '/',
  '/site.webmanifest',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
]

const FONT_CACHE = 'impacto-fonts-v1'

// Instalación — cachea los archivos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// Activación — limpia caches viejos
self.addEventListener('activate', (event) => {
  const VALID_CACHES = [CACHE_NAME, FONT_CACHE]
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => !VALID_CACHES.includes(key)).map((key) => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

// Fetch — network-first para páginas, cache-first para assets estáticos
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return

  const url = new URL(event.request.url)

  // Fonts — cache-first (immutable, long-lived)
  if (url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone())
            return response
          })
        })
      })
    )
    return
  }

  // Images and illustrations — cache after first fetch
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/illustrations/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // HTML pages — network-first, fall back to cache
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('/')
          })
        })
    )
    return
  }

  // Everything else — cache-first, then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request)
    })
  )
})
