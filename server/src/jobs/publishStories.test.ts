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
