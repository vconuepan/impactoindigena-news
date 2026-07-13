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

/** Read width/height from a PNG buffer's IHDR chunk. */
function pngSize(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

describe('composeBrandedStoryCard', () => {
  it('produces a 1200×630 card at 2× (2400×1260 PNG)', async () => {
    const img = await loadImage(pngBuffer(600, 400))
    const out = composeBrandedStoryCard(img, 'Consulta previa en territorio mapuche')
    const { w, h } = pngSize(out)
    expect(w).toBe(2400)
    expect(h).toBe(1260)
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

  it('rehosts verbatim when the source is >= 1200px wide', async () => {
    const buffer = pngBuffer(1400, 700)
    mockDownload.mockResolvedValue({ buffer, contentType: 'image/png', ext: 'png' })

    const url = await rehostOrComposeStoryImage('https://src/og.png', 'id2', 'Título')

    expect(mockUpload).toHaveBeenCalledTimes(1)
    const [passedBuf, filename] = mockUpload.mock.calls[0]
    expect(filename).toBe('oghero-id2.png')
    expect(passedBuf).toBe(buffer) // original bytes, not recomposed
    expect(url).toBe('https://cdn.r2/oghero-id2.png')
  })

  it('composes a branded card when the source is < 1200px wide', async () => {
    const buffer = pngBuffer(600, 400)
    mockDownload.mockResolvedValue({ buffer, contentType: 'image/png', ext: 'png' })

    const url = await rehostOrComposeStoryImage('https://src/small.png', 'id3', 'Título breve')

    expect(mockUpload).toHaveBeenCalledTimes(1)
    const [passedBuf, filename, ct] = mockUpload.mock.calls[0]
    expect(filename).toBe('storycard-id3.png')
    expect(ct).toBe('image/png')
    expect(passedBuf).not.toBe(buffer) // a freshly composed card
    expect(pngSize(passedBuf).w).toBe(2400)
    expect(url).toBe('https://cdn.r2/storycard-id3.png')
  })

  it('STORY_CARD_MIN_WIDTH matches Google Discover’s 1200px threshold', () => {
    expect(STORY_CARD_MIN_WIDTH).toBe(1200)
  })
})
