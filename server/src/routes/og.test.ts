import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const mockPrisma = vi.hoisted(() => ({
  story: { findUnique: vi.fn() },
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

import ogRouter from './og.js'

// The og handler builds story HTML by fetching the home "shell" and injecting
// per-story tags. Stub global fetch so getShell() returns a valid shell.
const SHELL = '<!DOCTYPE html><html><head><title>Voces Indígenas</title>' +
  '<link rel="canonical" href="https://vocesindigenas.org/" data-rh="true"></head>' +
  '<body><div id="root">home content</div><script src="/app.js"></script></body></html>'

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
    '<!DOCTYPE html><html><head><title>Voces Indígenas</title></head>' +
    `<body><div id="root"></div><script type="module" src="/assets/${bundle}"></script></body></html>`

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

    // Sin el arreglo el cache seguiria vigente diez minutos y esta respuesta
    // llevaria el bundle borrado.
    const despues = await request(app).get('/api/og/story-html?slug=a-real-story')
    expect(despues.text).toContain('index-nuevo.js')
    expect(despues.text).not.toContain('index-viejo.js')
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
    '<link rel="preload" href="/fonts/DMSans/dmsans-normal-latin.woff2" as="font" type="font/woff2" crossorigin />' +
    '<link rel="preload" href="https://r2.example/homepage.json" as="fetch" crossorigin />' +
    '<link rel="preload" href="https://r2.example/social/oghero-de-la-portada.jpg" as="image" fetchpriority="high" />' +
    '</head><body><div id="root">home</div><script src="/app.js"></script></body></html>'

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
})
