import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const mockPrisma = vi.hoisted(() => ({
  story: { findUnique: vi.fn() },
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

import ogRouter, { vaciarRoot } from './og.js'

// The og handler builds story HTML by fetching the home "shell" and injecting
// per-story tags. Stub global fetch so getShell() returns a valid shell.
//
// La forma importa: Vite pone el script del bundle en el <head> y el prerender
// deja la PORTADA entera dentro del root, con divs anidados y sin ningun
// <script> despues. Un fixture con el script tras el root dejo pasar durante
// meses una regex que nunca coincidia con el shell real (ver vaciarRoot).
const PORTADA_EN_ROOT =
  '<div id="root"><div class="layout"><header><nav>Voces</nav></header>' +
  '<main><h1>Titular de la portada</h1>' +
  '<img src="https://r2.example/social/oghero-de-la-portada.jpg" fetchpriority="high" alt="" />' +
  '<section><article><h2>Otra nota</h2></article></section></main></div></div>'
const SHELL = '<!DOCTYPE html><html><head><title>Voces Indígenas</title>' +
  '<script type="module" crossorigin="" src="/assets/index-abc123.js"></script>' +
  '<link rel="canonical" href="https://vocesindigenas.org/" data-rh="true"></head>' +
  `<body>${PORTADA_EN_ROOT}</body></html>`

const app = express()
app.use('/api/og', ogRouter)

const published = {
  slug: 'a-real-story',
  title: 'A Real Story',
  titleLabel: 'news',
  summary: 'A summary of the story.',
  imageUrl: 'https://vocesindigenas.org/images/x.png',
  datePublished: new Date('2026-07-13T00:00:00Z'),
  status: 'published',
}

describe('GET /api/og/story-html — SEO status codes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => SHELL,
    })) as any)
  })

  it('published story → 200 with the story-specific title (not the home)', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(published)
    const res = await request(app).get('/api/og/story-html?slug=a-real-story')
    expect(res.status).toBe(200)
    expect(res.text).toContain('A Real Story')
    expect(res.text).toContain('<link rel="canonical" href="https://vocesindigenas.org/stories/a-real-story"')
  })

  it('de-published story (exists but status!=published) → 404, NOT 200 (Soft 404 regression)', async () => {
    mockPrisma.story.findUnique.mockResolvedValue({ ...published, status: 'rejected' })
    const res = await request(app).get('/api/og/story-html?slug=a-real-story')
    // Before the fix this returned 200 with the home shell, which Google
    // classified as a Soft 404. It must now return 404 so crawlers de-index it.
    expect(res.status).toBe(404)
  })

  it('unknown story (not in DB) → 404', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/og/story-html?slug=does-not-exist')
    expect(res.status).toBe(404)
  })

  it('published story but shell fetch fails → 200 (do not 404 a live article)', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(published)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, text: async () => '' })) as any)
    const res = await request(app).get('/api/og/story-html?slug=a-real-story')
    expect(res.status).toBe(200)
  })
})

// El shell se cachea diez minutos, y el bundle que referencia lleva un hash que
// cambia en CADA despliegue del frontend. Durante esa ventana el shell cacheado
// apunta a un archivo ya borrado: el script da 404, React no arranca y el lector
// se queda sin relacionadas y sin navegacion.
describe('GET /api/og/story-html — el shell cacheado y el bundle con hash', () => {
  const shellCon = (bundle: string) =>
    '<!DOCTYPE html><html><head><title>Voces Indígenas</title>' +
    `<script type="module" src="/assets/${bundle}"></script></head>` +
    '<body><div id="root"></div></body></html>'

  // El cache del shell es estado de modulo. Cada test necesita el suyo.
  async function appFresco() {
    vi.resetModules()
    const { default: router } = await import('./og.js')
    const a = express()
    a.use('/api/og', router)
    return a
  }

  it('tras un despliegue deja de servir el bundle borrado y toma el nuevo', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(published)
    let enElSitio = 'index-viejo.js'
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') return { ok: url.endsWith(enElSitio), text: async () => '' }
      return { ok: true, text: async () => shellCon(enElSitio) }
    }) as any)

    const app = await appFresco()

    const antes = await request(app).get('/api/og/story-html?slug=a-real-story')
    expect(antes.text).toContain('index-viejo.js')

    // Se despliega el frontend: el hash cambia y el archivo anterior se borra.
    enElSitio = 'index-nuevo.js'

    // La comprobacion NO bloquea la respuesta, asi que esta peticion todavia
    // puede llevarse el shell viejo: lo que hace es DISPARAR la comprobacion.
    // Ese es el precio deliberado de no cobrarle medio viaje de red a cada
    // lector — una peticion, en vez de diez minutos.
    await request(app).get('/api/og/story-html?slug=a-real-story')
    await new Promise((r) => setImmediate(r))

    // Ya invalidado el cache, la siguiente trae el bundle nuevo.
    const despues = await request(app).get('/api/og/story-html?slug=a-real-story')
    expect(despues.text).toContain('index-nuevo.js')
    expect(despues.text).not.toContain('index-viejo.js')
  })

  it('la respuesta NO espera al HEAD del bundle: ese viaje de red no va en el camino critico', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(published)
    let headResuelto = false
    let respuestaEnviada = false
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        // Un HEAD lento, como el real: 533-763 ms medidos en produccion.
        await new Promise((r) => setTimeout(r, 50))
        headResuelto = true
        return { ok: true, text: async () => '' }
      }
      return { ok: true, text: async () => shellCon('index-viejo.js') }
    }) as any)

    const app = await appFresco()
    await request(app).get('/api/og/story-html?slug=a-real-story') // cachea el shell
    await request(app).get('/api/og/story-html?slug=a-real-story').then(() => {
      respuestaEnviada = true
    })

    // Si la respuesta hubiera esperado al HEAD, este ya estaria resuelto.
    expect(respuestaEnviada).toBe(true)
    expect(headResuelto).toBe(false)
  })

  it('un fallo de red al comprobar el bundle NO invalida el cache', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(published)
    let pedidosDeShell = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') throw new Error('ECONNRESET')
      pedidosDeShell++
      return { ok: true, text: async () => shellCon('index-viejo.js') }
    }) as any)

    const app = await appFresco()
    await request(app).get('/api/og/story-html?slug=a-real-story')
    const segunda = await request(app).get('/api/og/story-html?slug=a-real-story')

    // No poder comprobar el bundle no es prueba de que no este. Tirar el cache
    // por un timeout dejaria las historias sin shell mientras dure la falla.
    expect(pedidosDeShell).toBe(1)
    expect(segunda.text).toContain('index-viejo.js')
  })
})

// El shell es el index.html de la PORTADA, y el build le hornea preloads que son
// suyos: su hero con fetchpriority="high" y el snapshot homepage.json. Arrastrarlos
// a una pagina de historia pide con prioridad alta una foto que nunca se muestra,
// compitiendo con la que si mide el LCP.
describe('GET /api/og/story-html — los preloads que el shell trae de la portada', () => {
  const SHELL_PORTADA =
    '<!DOCTYPE html><html><head><title>Voces Indígenas</title>' +
    '<script type="module" crossorigin="" src="/assets/index-abc123.js"></script>' +
    '<link rel="preload" href="/fonts/DMSans/dmsans-normal-latin.woff2" as="font" type="font/woff2" crossorigin />' +
    '<link rel="preload" href="https://r2.example/homepage.json" as="fetch" crossorigin />' +
    '<link rel="preload" href="https://r2.example/social/oghero-de-la-portada.jpg" as="image" fetchpriority="high" />' +
    `</head><body>${PORTADA_EN_ROOT}</body></html>`

  // El cache del shell es estado de modulo y persiste entre bloques: sin aislar,
  // este describe recibia el shell de los tests anteriores —que no lleva ningun
  // preload— y las comprobaciones de ausencia pasaban por la razon equivocada.
  async function pedirHistoria(story: unknown) {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => SHELL_PORTADA })) as any)
    mockPrisma.story.findUnique.mockResolvedValue(story)
    vi.resetModules()
    const { default: router } = await import('./og.js')
    const a = express()
    a.use('/api/og', router)
    return request(a).get('/api/og/story-html?slug=a-real-story')
  }

  it('descarta el hero de la portada y precarga la imagen de ESTA historia', async () => {
    const res = await pedirHistoria(published)

    expect(res.text).not.toContain('oghero-de-la-portada.jpg')
    expect(res.text).toContain(
      '<link rel="preload" href="https://vocesindigenas.org/images/x.png" as="image" fetchpriority="high" />',
    )
  })

  it('descarta el preload de homepage.json, que la historia no pide nunca', async () => {
    const res = await pedirHistoria(published)
    expect(res.text).not.toContain('homepage.json')
  })

  it('conserva los preloads de fuentes, que sirven en cualquier pagina', async () => {
    const res = await pedirHistoria(published)
    expect(res.text).toContain('dmsans-normal-latin.woff2')
    expect(res.text).toContain('as="font"')
  })

  it('una historia sin imagen no precarga nada: seria otra descarga desperdiciada', async () => {
    const res = await pedirHistoria({ ...published, imageUrl: null })
    expect(res.text).not.toContain('as="image"')
  })

  it('una imagen de nuestro bucket se precarga con las variantes que el srcset va a elegir', async () => {
    // StoryPage pinta el hero con srcset de 800 y 1200 px. Si el preload apuntara
    // solo al original, el navegador bajaria dos imagenes: la precargada y la
    // elegida. imagesrcset + imagesizes hacen que las dos sean la misma.
    const res = await pedirHistoria({
      ...published,
      imageUrl: 'https://pub-abc.r2.dev/social/storycard-123.jpg',
    })
    expect(res.text).toContain(
      '<link rel="preload" href="https://pub-abc.r2.dev/social/storycard-123.jpg" as="image" ' +
        'imagesrcset="https://pub-abc.r2.dev/social/storycard-123-w800.jpg 800w, ' +
        'https://pub-abc.r2.dev/social/storycard-123-w1200.jpg 1200w" imagesizes="100vw" fetchpriority="high" />',
    )
    // El og:image sigue siendo el original: las variantes son para el sitio.
    expect(res.text).toContain('<meta property="og:image" content="https://pub-abc.r2.dev/social/storycard-123.jpg" />')
  })
})

// El shell es la portada prerenderizada: ~120 KB de HTML dentro del root, con
// el h1 de OTRA noticia y su hero. Medido en vivo el 5-oct-2026, las 4.039
// fichas publicadas entregaban ese cuerpo a todo rastreador sin JS y el
// navegador bajaba el hero equivocado con prioridad alta. La regex que debia
// vaciarlo exigia un <script> despues del </div>, y Vite los pone en el <head>.
describe('vaciarRoot — el cuerpo de la portada no viaja en la ficha', () => {
  it('vacia un root con divs anidados y nada despues (la forma real de Vite)', () => {
    const out = vaciarRoot(SHELL)
    expect(out).toContain('<body><div id="root"></div></body>')
    expect(out).not.toContain('Titular de la portada')
    expect(out).not.toContain('oghero-de-la-portada.jpg')
    // El script del bundle vive en el head y se conserva: sin el, React no arranca.
    expect(out).toContain('src="/assets/index-abc123.js"')
  })

  it('conserva un <script> que venga despues del root (el layout antiguo)', () => {
    const viejo = '<html><head></head><body><div id="root"><div>home</div></div>' +
      '<script src="/app.js"></script></body></html>'
    expect(vaciarRoot(viejo)).toBe(
      '<html><head></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
    )
  })

  it('no toca un documento sin root ni uno con el root ya vacio', () => {
    expect(vaciarRoot('<html><body><p>sin root</p></body></html>')).toBe('<html><body><p>sin root</p></body></html>')
    const vacio = '<html><body><div id="root"></div></body></html>'
    expect(vaciarRoot(vacio)).toBe(vacio)
  })

  it('la respuesta de /story-html no trae el h1 ni el hero de la portada, y si su bundle', async () => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => SHELL })) as any)
    mockPrisma.story.findUnique.mockResolvedValue(published)
    vi.resetModules()
    const { default: router } = await import('./og.js')
    const a = express()
    a.use('/api/og', router)
    const res = await request(a).get('/api/og/story-html?slug=a-real-story')

    expect(res.status).toBe(200)
    const body = res.text.slice(res.text.indexOf('<body>'))
    expect(body).not.toContain('Titular de la portada')
    expect(body).not.toContain('fetchpriority="high"')
    expect(body).toContain('<div id="root"></div>')
    expect(res.text).toContain('src="/assets/index-abc123.js"')
    expect(res.text).toContain('<title>news: A Real Story - Voces Indígenas</title>')
  })
})
