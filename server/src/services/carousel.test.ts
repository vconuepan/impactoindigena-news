import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, unlinkSync, mkdirSync } from 'fs'
import { rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createStoryImage, generateCarouselZip, type CarouselStory } from './carousel.js'

const sampleStory: CarouselStory = {
  title: 'Major AI breakthrough in quantum computing research',
  category: 'AI & Technology',
  summary: 'Researchers have developed a new approach to quantum error correction that could accelerate the development of practical quantum computers.',
  publisher: 'Nature',
  date: '2024-06-15T00:00:00Z',
}

describe('createStoryImage', () => {
  it('returns a PNG buffer', () => {
    const buffer = createStoryImage(sampleStory)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
    // PNG magic bytes
    expect(buffer[0]).toBe(0x89)
    expect(buffer[1]).toBe(0x50) // P
    expect(buffer[2]).toBe(0x4e) // N
    expect(buffer[3]).toBe(0x47) // G
  })

  it('handles stories with no date', () => {
    const story = { ...sampleStory, date: null }
    const buffer = createStoryImage(story)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('handles stories with long titles', () => {
    const story = {
      ...sampleStory,
      title: 'This is a very long title that should be word-wrapped across multiple lines on the generated image to ensure readability',
    }
    const buffer = createStoryImage(story)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })
})

describe('generateCarouselZip', () => {
  const outputDir = join(tmpdir(), `test_carousel_${Date.now()}`)

  afterEach(async () => {
    // Clean up
    try {
      if (existsSync(outputDir)) await rm(outputDir, { recursive: true })
    } catch {
      // ignore cleanup errors
    }
  })

  it('generates a ZIP file', async () => {
    const stories: CarouselStory[] = [
      sampleStory,
      { ...sampleStory, title: 'Climate report shows progress', category: 'Planet & Climate' },
    ]

    const zipPath = await generateCarouselZip(stories, outputDir)
    expect(existsSync(zipPath)).toBe(true)
    expect(zipPath).toContain('carousel_images.zip')
  })

  it('handles a single story', async () => {
    const zipPath = await generateCarouselZip([sampleStory], outputDir)
    expect(existsSync(zipPath)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Regla 2: el aviso de independencia (director, 25-nov-2026)
// ---------------------------------------------------------------------------

describe('el aviso de independencia en la imagen de la nota', async () => {
  const { loadImage, createCanvas } = await import('@napi-rs/canvas')
  const FRASE = 'Esta nota menciona a organizaciones que son o fueron clientes de impactoindigena.ai y de impactoindigena.legal.'
  const LARGO = { ...sampleStory, summary: 'Un resumen largo que llena el espacio disponible de la imagen. '.repeat(20) }

  /** Píxeles que no son blancos en la franja del aviso (y de 545 a 615). */
  async function tintaEnLaFranja(png: Buffer): Promise<number> {
    const img = await loadImage(png)
    const c = createCanvas(img.width, img.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 545, 1100, 70)
    let n = 0
    for (let i = 0; i < data.length; i += 4) if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) n++
    return n
  }

  it('con aviso: la franja lleva texto, aun con un resumen que llena la imagen', async () => {
    expect(await tintaEnLaFranja(createStoryImage({ ...LARGO, avisoIndependencia: FRASE }))).toBeGreaterThan(200)
  })

  it('sin aviso, con un resumen corto, la franja queda en blanco', async () => {
    expect(await tintaEnLaFranja(createStoryImage({ ...sampleStory, avisoIndependencia: null }))).toBe(0)
    expect(await tintaEnLaFranja(createStoryImage(sampleStory))).toBe(0)
  })

  it('con aviso, el resumen se detiene antes de la franja', async () => {
    // El rótulo empieza en y=560; de 530 a 545 no puede haber resumen.
    const img = await loadImage(createStoryImage({ ...LARGO, avisoIndependencia: FRASE }))
    const c = createCanvas(img.width, img.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 530, 1100, 15)
    let n = 0
    for (let i = 0; i < data.length; i += 4) if (data[i] < 200) n++
    expect(n).toBe(0)
  })
})
