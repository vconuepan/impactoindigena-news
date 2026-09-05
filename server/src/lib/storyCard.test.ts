import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const mockDownload = vi.hoisted(() => vi.fn())
const mockUpload = vi.hoisted(() => vi.fn())
vi.mock('./imageStorage.js', () => ({
  downloadExternalImage: mockDownload,
  uploadImageToR2: mockUpload,
}))
vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const { composeBrandedStoryCard, rehostOrComposeStoryImage, STORY_CARD_MIN_WIDTH } =
  await import('./storyCard.js')

/** A real PNG buffer of the given size (solid fill), so loadImage can decode it. */
function pngBuffer(w: number, h: number): Buffer {
  const c = createCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#888'
  ctx.fillRect(0, 0, w, h)
  return c.toBuffer('image/png')
}

/**
 * JPEG plano de un solo color. Un gris uniforme comprime tan bien que
 * reencodearlo no lo achica: sirve justo para el caso en que el rehospedaje
 * debe conservar los bytes originales.
 */
function jpegBuffer(w: number, h: number): Buffer {
  const c = createCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#888'
  ctx.fillRect(0, 0, w, h)
  return c.toBuffer('image/jpeg', 82)
}

/** Read width/height from a PNG buffer's IHDR chunk. */
function pngSize(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

/**
 * Lee el tamaño de un JPEG recorriendo sus marcadores hasta el SOF.
 *
 * La tarjeta se genera en JPEG desde el 4-sep-2026 (ver `storyCard.ts`), asi que
 * `pngSize` ya no sirve para medirla: un JPEG no tiene IHDR.
 */
function jpegSize(buf: Buffer): { w: number; h: number } {
  let i = 2 // saltar SOI
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue }
    const marker = buf[i + 1]
    // SOF0..SOF3 y SOF5..SOF15 llevan alto y ancho; DHT/DQT y demas se saltan.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  throw new Error('no se encontro el marcador SOF del JPEG')
}

/** Un JPEG empieza con FF D8 FF. */
function esJpeg(buf: Buffer): boolean {
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
}

describe('composeBrandedStoryCard', () => {
  it('produces a 1200×630 card at 2× (2400×1260 JPEG)', async () => {
    const img = await loadImage(pngBuffer(600, 400))
    const out = composeBrandedStoryCard(img, 'Consulta previa en territorio mapuche')
    const { w, h } = jpegSize(out)
    expect(w).toBe(2400)
    expect(h).toBe(1260)
  })

  /**
   * El formato es parte del contrato, no un detalle.
   *
   * En PNG estas tarjetas pesaban cerca de 4 MB y eran la mitad del peso de la
   * portada. Y no puede ser WebP: esta imagen termina siendo el `og:image` de la
   * historia, y las vistas previas de WhatsApp, Facebook y LinkedIn no lo
   * renderizan de forma confiable.
   */
  it('la tarjeta sale en JPEG, no en PNG ni WebP', async () => {
    const img = await loadImage(pngBuffer(600, 400))
    const out = composeBrandedStoryCard(img, 'Título')
    expect(esJpeg(out)).toBe(true)
  })

  it('el JPEG pesa una fraccion de lo que pesaria en PNG', async () => {
    const img = await loadImage(pngBuffer(600, 400))
    const jpeg = composeBrandedStoryCard(img, 'Título')
    // Una tarjeta de 2400x1260 en PNG supera holgadamente el megabyte; en JPEG
    // de calidad 82 se queda muy por debajo.
    expect(jpeg.length).toBeLessThan(1_000_000)
  })

  it('handles a very long title without throwing', async () => {
    const img = await loadImage(pngBuffer(450, 300))
    const long = 'Palabra '.repeat(60)
    expect(() => composeBrandedStoryCard(img, long)).not.toThrow()
  })
})

describe('rehostOrComposeStoryImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockImplementation(async (_buf: Buffer, filename: string) => `https://cdn.r2/${filename}`)
  })

  it('returns null when the download fails', async () => {
    mockDownload.mockResolvedValue(null)
    expect(await rehostOrComposeStoryImage('https://src/og.jpg', 'id1', 'T')).toBeNull()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('caps a >= 1200px source at 1200 wide and stores it as JPEG', async () => {
    const buffer = pngBuffer(1400, 700)
    mockDownload.mockResolvedValue({ buffer, contentType: 'image/png', ext: 'png' })

    const url = await rehostOrComposeStoryImage('https://src/og.png', 'id2', 'Título')

    expect(mockUpload).toHaveBeenCalledTimes(1)
    const [passedBuf, filename, ct] = mockUpload.mock.calls[0]
    expect(filename).toBe('oghero-id2.jpg')
    expect(ct).toBe('image/jpeg')
    expect(passedBuf).not.toBe(buffer) // re-encoded, not the original bytes
    expect(jpegSize(passedBuf).w).toBe(1200) // 1400 -> 1200, the Discover minimum
    expect(passedBuf.length).toBeLessThan(buffer.length)
    expect(url).toBe('https://cdn.r2/oghero-id2.jpg')
  })

  it('keeps the original bytes when re-encoding would not make it smaller', async () => {
    // A 1200px source is already at the cap, so the JPEG buys nothing.
    const buffer = jpegBuffer(1200, 630)
    mockDownload.mockResolvedValue({ buffer, contentType: 'image/jpeg', ext: 'jpg' })

    await rehostOrComposeStoryImage('https://src/og.jpg', 'id2b', 'Título')

    const [passedBuf, filename] = mockUpload.mock.calls[0]
    expect(filename).toBe('oghero-id2b.jpg')
    expect(passedBuf).toBe(buffer)
  })

  it('composes a branded card when the source is < 1200px wide', async () => {
    const buffer = pngBuffer(600, 400)
    mockDownload.mockResolvedValue({ buffer, contentType: 'image/png', ext: 'png' })

    const url = await rehostOrComposeStoryImage('https://src/small.png', 'id3', 'Título breve')

    expect(mockUpload).toHaveBeenCalledTimes(1)
    const [passedBuf, filename, ct] = mockUpload.mock.calls[0]
    expect(filename).toBe('storycard-id3.jpg')
    expect(ct).toBe('image/jpeg')
    expect(passedBuf).not.toBe(buffer) // a freshly composed card
    expect(jpegSize(passedBuf).w).toBe(2400)
    expect(url).toBe('https://cdn.r2/storycard-id3.jpg')
  })

  it('STORY_CARD_MIN_WIDTH matches Google Discover’s 1200px threshold', () => {
    expect(STORY_CARD_MIN_WIDTH).toBe(1200)
  })
})
