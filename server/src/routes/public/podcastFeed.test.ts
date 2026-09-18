import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import request from 'supertest'

const mockFindMany = vi.hoisted(() => vi.fn())
vi.mock('../../lib/prisma.js', () => ({ default: { podcast: { findMany: mockFindMany } } }))
vi.mock('express-rate-limit', () => ({ default: () => (_r: any, _s: any, n: any) => n() }))

const { default: podcastFeedRouter } = await import('./podcastFeed.js')
const { config } = await import('../../config.js')

/**
 * Lo que Apple Podcasts exige de un feed, y que este feed no cumplia.
 *
 * Hasta el 17-sep-2026 el canal no declaraba `itunes:image`. **Apple rechaza un
 * feed sin caratula**: no es un detalle estetico, es la condicion para entrar al
 * directorio. El resto del feed estaba bien formado, asi que nada fallaba de
 * forma visible — simplemente el podcast no podia publicarse.
 *
 * El segundo caso fija algo distinto y menos obvio: **el correo del
 * `itunes:owner` es publico** y salia de `BREVO_FROM_EMAIL`. Ese acoplamiento
 * ataba una direccion que solo necesita RECIBIR a un tramite de verificacion de
 * remitente en Brevo, que es lo que impedia cambiarla. Mientras duro, el feed
 * publico mostro `venancio@impactoindigena.com`, que es marca vieja y dominio
 * ajeno.
 */

const app = express()
app.use('/api/podcast', podcastFeedRouter)

const EPISODIO = {
  id: 'ep-1',
  title: 'Episodio de prueba',
  description: 'Descripcion',
  audioUrl: 'https://example.test/audio.mp3',
  duration: 90,
  publishedAt: new Date('2026-09-01T12:00:00Z'),
  createdAt: new Date('2026-09-01T12:00:00Z'),
  episodeNumber: 1,
}

async function feed(): Promise<string> {
  const res = await request(app).get('/api/podcast/feed.xml')
  expect(res.status).toBe(200)
  return res.text
}

beforeEach(() => {
  mockFindMany.mockReset()
  mockFindMany.mockResolvedValue([EPISODIO])
})

describe('el feed del podcast declara caratula', () => {
  it('trae itunes:image con una URL absoluta del sitio', async () => {
    const xml = await feed()
    const m = xml.match(/<itunes:image href="([^"]+)"/)
    expect(m, 'falta <itunes:image>: Apple rechaza el feed').not.toBeNull()
    expect(m![1]).toBe(`${config.siteUrl}/images/podcast-cover.jpg`)
  })

  it('trae tambien el <image> estandar de RSS, para lectores que no son Apple', async () => {
    const xml = await feed()
    expect(xml).toContain('<image>')
    expect(xml).toContain(`<url>${config.siteUrl}/images/podcast-cover.jpg</url>`)
  })

  it('declara itunes:type, que Apple usa para ordenar los episodios', async () => {
    expect(await feed()).toContain('<itunes:type>episodic</itunes:type>')
  })
})

describe('el correo publico del canal', () => {
  it('no sale de la configuracion de Brevo', async () => {
    const xml = await feed()
    const m = xml.match(/<itunes:email>([^<]*)<\/itunes:email>/)
    expect(m).not.toBeNull()
    expect(m![1].trim()).not.toBe('')
    // El remitente de Brevo puede ser cualquier cosa, incluida una direccion de
    // otra marca: el feed no debe heredarla.
    expect(m![1]).toBe(config.podcast.ownerEmail)
  })

  it('cae en un dominio propio de la Fundacion, no en la marca anterior', async () => {
    const xml = await feed()
    expect(xml).not.toContain('impactoindigena.news')
    const m = xml.match(/<itunes:email>([^<]*)<\/itunes:email>/)!
    expect(m[1]).toMatch(/@(vocesindigenas\.org|fundacionkm\.org)$/)
  })
})

describe('la caratula en disco cumple las reglas de Apple', () => {
  /*
   * Se comprueba la cabecera del JPEG a mano en vez de cargar una libreria de
   * imagenes: el servidor no depende de sharp y un test no deberia obligarlo.
   * Los marcadores SOFn de un JPEG llevan alto y ancho en los bytes 5..8.
   */
  const buf = readFileSync(
    path.resolve(__dirname, '../../../../client/public/images/podcast-cover.jpg'),
  )

  function dimensiones(b: Buffer): { w: number; h: number } | null {
    let i = 2 // saltar SOI
    while (i < b.length) {
      if (b[i] !== 0xff) return null
      const marcador = b[i + 1]
      // SOF0..SOF15, menos DHT (c4), JPG (c8) y DAC (cc)
      if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
      }
      i += 2 + b.readUInt16BE(i + 2)
    }
    return null
  }

  it('es cuadrada y esta entre 1400 y 3000 px', () => {
    const d = dimensiones(buf)
    expect(d).not.toBeNull()
    expect(d!.w).toBe(d!.h)
    expect(d!.w).toBeGreaterThanOrEqual(1400)
    expect(d!.w).toBeLessThanOrEqual(3000)
  })

  it('es un JPEG valido', () => {
    expect(buf[0]).toBe(0xff)
    expect(buf[1]).toBe(0xd8)
  })
})
