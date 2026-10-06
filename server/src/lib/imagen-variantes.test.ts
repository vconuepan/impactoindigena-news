import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'

const mockUpload = vi.hoisted(() => vi.fn())
vi.mock('./imageStorage.js', () => ({ uploadImageToR2: mockUpload }))
vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const {
  ANCHOS_VARIANTE_WEB,
  nombreDeVariante,
  variantesDeUrl,
  srcsetDeUrl,
  subirVariantesWeb,
} = await import('./imagen-variantes.js')

function jpeg(w: number, h: number): Buffer {
  const c = createCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#888'
  ctx.fillRect(0, 0, w, h)
  return c.toBuffer('image/jpeg', 82)
}

/** Ancho y alto leidos del marcador SOF del JPEG, sin decodificarlo. */
function medidas(buf: Buffer): { w: number; h: number } {
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue }
    const m = buf[i + 1]
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  throw new Error('sin SOF')
}

describe('nombreDeVariante — la convencion que el cliente replica', () => {
  it('cambia la extension por el sufijo de ancho y siempre termina en .jpg', () => {
    expect(nombreDeVariante('storycard-abc.jpg', 800)).toBe('storycard-abc-w800.jpg')
    expect(nombreDeVariante('oghero-abc.png', 1200)).toBe('oghero-abc-w1200.jpg')
    expect(nombreDeVariante('x-1790000.webp', 800)).toBe('x-1790000-w800.jpg')
    expect(nombreDeVariante('foto.JPEG', 800)).toBe('foto-w800.jpg')
  })

  it('sin extension conocida no hay variante', () => {
    expect(nombreDeVariante('audio.mp3', 800)).toBeNull()
    expect(nombreDeVariante('sin-extension', 800)).toBeNull()
  })

  it('los anchos son 800 y 1200: tarjeta a 2x y hero', () => {
    expect([...ANCHOS_VARIANTE_WEB]).toEqual([800, 1200])
  })
})

describe('variantesDeUrl / srcsetDeUrl — solo para lo que vive en nuestro bucket', () => {
  const r2 = 'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social/storycard-abc.jpg'

  it('deriva las dos URL de una imagen nuestra', () => {
    expect(variantesDeUrl(r2)).toEqual([
      { ancho: 800, url: 'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social/storycard-abc-w800.jpg' },
      { ancho: 1200, url: 'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social/storycard-abc-w1200.jpg' },
    ])
    expect(srcsetDeUrl(r2)).toBe(
      'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social/storycard-abc-w800.jpg 800w, ' +
        'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social/storycard-abc-w1200.jpg 1200w',
    )
  })

  it('una imagen externa, que nunca se rehospedo, no tiene variantes', () => {
    expect(variantesDeUrl('https://media.biobiochile.cl/wp-content/foto.jpg')).toBeNull()
    expect(srcsetDeUrl('https://vocesindigenas.org/images/og-image.png')).toBeNull()
  })

  it('un objeto del bucket fuera de social/ o sin extension tampoco', () => {
    expect(variantesDeUrl('https://pub-x.r2.dev/homepage.json')).toBeNull()
    expect(variantesDeUrl('https://pub-x.r2.dev/social/')).toBeNull()
  })
})

describe('subirVariantesWeb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockImplementation(async (_b: Buffer, nombre: string) => `https://cdn.r2/${nombre}`)
  })

  it('sube una de 800 y una de 1200 a partir de una tarjeta de 2400x1260', async () => {
    const urls = await subirVariantesWeb(jpeg(2400, 1260), 'storycard-id.jpg')

    expect(urls).toEqual(['https://cdn.r2/storycard-id-w800.jpg', 'https://cdn.r2/storycard-id-w1200.jpg'])
    expect(mockUpload).toHaveBeenCalledTimes(2)
    const [b800, n800, ct800] = mockUpload.mock.calls[0]
    const [b1200, n1200] = mockUpload.mock.calls[1]
    expect(n800).toBe('storycard-id-w800.jpg')
    expect(n1200).toBe('storycard-id-w1200.jpg')
    expect(ct800).toBe('image/jpeg')
    expect(medidas(b800)).toEqual({ w: 800, h: 420 })
    expect(medidas(b1200)).toEqual({ w: 1200, h: 630 })
  })

  it('no amplia: una imagen de 600 px queda en 600 en las dos variantes', async () => {
    await subirVariantesWeb(jpeg(600, 400), 'oghero-id.jpg')
    expect(medidas(mockUpload.mock.calls[0][0]).w).toBe(600)
    expect(medidas(mockUpload.mock.calls[1][0]).w).toBe(600)
  })

  it('un buffer que no es imagen no lanza ni sube nada', async () => {
    const urls = await subirVariantesWeb(Buffer.from('no soy una imagen'), 'x.jpg')
    expect(urls).toEqual([])
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('si una subida falla, sigue con la otra y no lanza', async () => {
    mockUpload
      .mockRejectedValueOnce(new Error('R2 caido'))
      .mockImplementationOnce(async (_b: Buffer, nombre: string) => `https://cdn.r2/${nombre}`)
    const urls = await subirVariantesWeb(jpeg(1600, 900), 'oghero-id.jpg')
    expect(urls).toEqual(['https://cdn.r2/oghero-id-w1200.jpg'])
  })

  it('con un nombre sin extension conocida no sube nada', async () => {
    expect(await subirVariantesWeb(jpeg(100, 100), 'audio.mp3')).toEqual([])
    expect(mockUpload).not.toHaveBeenCalled()
  })
})
