import { describe, it, expect, vi, beforeEach } from 'vitest'

// ──── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  story: { findMany: vi.fn(), update: vi.fn() },
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const mockGenerateImage = vi.hoisted(() => vi.fn())
vi.mock('../lib/imageGen.js', () => ({ generateStoryImage: mockGenerateImage }))

const mockFetchOg = vi.hoisted(() => vi.fn())
vi.mock('../lib/extract-og-image.js', () => ({ fetchOgImage: mockFetchOg }))

const mockRehost = vi.hoisted(() => vi.fn())
vi.mock('../lib/storyCard.js', () => ({ rehostOrComposeStoryImage: mockRehost }))

// La guardia SSRF: el respaldo en crudo solo se guarda si la URL todavia la pasa.
const mockAssertUrl = vi.hoisted(() => vi.fn())
vi.mock('../utils/urlValidation.js', () => ({ assertUrlAllowed: mockAssertUrl }))

vi.mock('../config.js', () => ({
  config: {
    r2: { publicUrl: 'https://cdn.r2.example' },
    imageGen: { heroAiMinRelevance: 8 },
  },
}))

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

// story.js / translation.js are imported by the module but unused by generateHeroImages.
vi.mock('../services/story.js', () => ({ getStoryIdsByStatus: vi.fn(), bulkUpdateStatus: vi.fn() }))
vi.mock('../services/translation.js', () => ({ translateStoriesBatch: vi.fn() }))

const { generateHeroImages } = await import('./publishStories.js')

const story = (over: Record<string, unknown>) => ({
  id: 'id', title: 'T', sourceTitle: 'ST', summary: 'S',
  imageUrl: null, sourceUrl: 'https://src/1', relevance: 5, ...over,
})

// ──── Tests ──────────────────────────────────────────────────────────────────

describe('generateHeroImages — cost-aware hero strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateImage.mockResolvedValue('https://cdn.r2.example/ai.png')
    mockFetchOg.mockResolvedValue('https://src/og.jpg')
    mockRehost.mockResolvedValue('https://cdn.r2.example/oghero-id.jpg')
    mockPrisma.story.update.mockResolvedValue({})
    mockAssertUrl.mockResolvedValue(undefined)
  })

  it('featured story (relevance >= 8) gets an AI hero, no og:image lookup', async () => {
    mockPrisma.story.findMany.mockResolvedValue([story({ relevance: 8 })])
    await generateHeroImages(['id'])
    expect(mockGenerateImage).toHaveBeenCalledTimes(1)
    expect(mockFetchOg).not.toHaveBeenCalled()
    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'id' }, data: { imageUrl: 'https://cdn.r2.example/ai.png' },
    })
  })

  it('non-featured story reuses source og:image, rehosted to R2, no AI generation', async () => {
    mockPrisma.story.findMany.mockResolvedValue([story({ relevance: 6 })])
    await generateHeroImages(['id'])
    expect(mockGenerateImage).not.toHaveBeenCalled()
    expect(mockFetchOg).toHaveBeenCalledTimes(1)
    expect(mockRehost).toHaveBeenCalledWith('https://src/og.jpg', 'id', 'T')
    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'id' }, data: { imageUrl: 'https://cdn.r2.example/oghero-id.jpg' },
    })
  })

  it('falls back to the raw og:image URL when the R2 rehost fails', async () => {
    mockPrisma.story.findMany.mockResolvedValue([story({ relevance: 5 })])
    mockRehost.mockResolvedValue(null)
    await generateHeroImages(['id'])
    expect(mockRehost).toHaveBeenCalledTimes(1)
    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'id' }, data: { imageUrl: 'https://src/og.jpg' },
    })
  })

  // Una URL que la guardia SSRF rechaza no se guarda como imagen de la nota. Antes
  // `rehosted ?? ogImage` la persistia igual, y despues el carrusel y la subida a
  // LinkedIn la pedian sin guardia: el veredicto de la guardia se perdia aqui.
  it('does NOT store the raw og:image when the SSRF guard rejects it; a non-featured story gets an AI hero instead', async () => {
    mockPrisma.story.findMany.mockResolvedValue([story({ relevance: 5 })])
    mockFetchOg.mockResolvedValue('http://169.254.169.254/latest/meta-data')
    mockRehost.mockResolvedValue(null)
    mockAssertUrl.mockRejectedValue(new Error('Blocked disallowed URL'))
    await generateHeroImages(['id'])
    expect(mockAssertUrl).toHaveBeenCalledWith('http://169.254.169.254/latest/meta-data')
    const guardados = mockPrisma.story.update.mock.calls.map((c) => c[0].data.imageUrl)
    expect(guardados).not.toContain('http://169.254.169.254/latest/meta-data')
    expect(mockGenerateImage).toHaveBeenCalledTimes(1)
    expect(guardados).toContain('https://cdn.r2.example/ai.png')
  })

  it('a featured story whose AI failed and whose og:image is rejected stays without the raw URL', async () => {
    mockPrisma.story.findMany.mockResolvedValue([story({ relevance: 9 })])
    mockGenerateImage.mockRejectedValue(new Error('image API down'))
    mockFetchOg.mockResolvedValue('http://127.0.0.1:8080/x.jpg')
    mockRehost.mockResolvedValue(null)
    mockAssertUrl.mockRejectedValue(new Error('Blocked disallowed URL'))
    await generateHeroImages(['id'])
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
    expect(mockGenerateImage).toHaveBeenCalledTimes(1) // no reintenta la IA
  })

  it('non-featured story with no og:image falls back to AI', async () => {
    mockPrisma.story.findMany.mockResolvedValue([story({ relevance: 4 })])
    mockFetchOg.mockResolvedValue(null)
    await generateHeroImages(['id'])
    expect(mockFetchOg).toHaveBeenCalledTimes(1)
    expect(mockGenerateImage).toHaveBeenCalledTimes(1)
  })

  it('featured story whose AI fails falls back to og:image', async () => {
    mockPrisma.story.findMany.mockResolvedValue([story({ relevance: 9 })])
    mockGenerateImage.mockRejectedValueOnce(new Error('image API down'))
    await generateHeroImages(['id'])
    expect(mockGenerateImage).toHaveBeenCalledTimes(1)
    expect(mockFetchOg).toHaveBeenCalledTimes(1)
    expect(mockPrisma.story.update).toHaveBeenLastCalledWith({
      where: { id: 'id' }, data: { imageUrl: 'https://cdn.r2.example/oghero-id.jpg' },
    })
  })

  it('story that already has one of our R2 images is skipped entirely', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      story({ relevance: 9, imageUrl: 'https://cdn.r2.example/existing.png' }),
    ])
    await generateHeroImages(['id'])
    expect(mockGenerateImage).not.toHaveBeenCalled()
    expect(mockFetchOg).not.toHaveBeenCalled()
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })
})
