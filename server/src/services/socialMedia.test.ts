import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  story: {
    findMany: vi.fn(),
  },
  blueskyPost: {
    findMany: vi.fn(),
  },
  mastodonPost: {
    findMany: vi.fn(),
  },
  instagramPost: {
    findMany: vi.fn(),
  },
}))

const mockLlm = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./llm.js', () => ({
  getLLMByTier: vi.fn(() => ({
    withStructuredOutput: vi.fn(() => mockLlm),
  })),
  rateLimitDelay: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../prompts/index.js', () => ({
  buildBlueskyPickBestPrompt: vi.fn(() => 'pick prompt'),
}))

const { findAutoPostCandidates, pickBestStoryForSocial } = await import('./socialMedia.js')

describe('findAutoPostCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default each channel to "nothing posted" so tests only set the channels they care about.
    mockPrisma.blueskyPost.findMany.mockResolvedValue([])
    mockPrisma.mastodonPost.findMany.mockResolvedValue([])
    mockPrisma.instagramPost.findMany.mockResolvedValue([])
  })

  it('returns empty when no published stories', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    const result = await findAutoPostCandidates(25)
    expect(result).toEqual([])
  })

  it('returns stories not posted to any channel', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1' },
      { id: 'story-2' },
      { id: 'story-3' },
    ])
    mockPrisma.blueskyPost.findMany.mockResolvedValue([
      { storyId: 'story-1' },
    ])
    mockPrisma.mastodonPost.findMany.mockResolvedValue([
      { storyId: 'story-2' },
    ])

    const result = await findAutoPostCandidates(25)

    // story-1 not on Mastodon, story-2 not on Bluesky, story-3 not on either
    expect(result).toContain('story-1')
    expect(result).toContain('story-2')
    expect(result).toContain('story-3')
  })

  it('excludes stories posted to all channels', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1' },
      { id: 'story-2' },
    ])
    mockPrisma.blueskyPost.findMany.mockResolvedValue([
      { storyId: 'story-1' },
      { storyId: 'story-2' },
    ])
    mockPrisma.mastodonPost.findMany.mockResolvedValue([
      { storyId: 'story-1' },
    ])
    mockPrisma.instagramPost.findMany.mockResolvedValue([
      { storyId: 'story-1' },
    ])

    const result = await findAutoPostCandidates(25)

    // story-1 posted to all three — excluded; story-2 only on Bluesky — included
    expect(result).not.toContain('story-1')
    expect(result).toContain('story-2')
  })
})

describe('pickBestStoryForSocial', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the only candidate without LLM call', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1', title: 'One', titleLabel: 'A', summary: 'S', relevance: 8, emotionTag: 'calm', issue: null, datePublished: null },
    ])

    const result = await pickBestStoryForSocial(['story-1'])
    expect(result.storyId).toBe('story-1')
    expect(mockLlm.invoke).not.toHaveBeenCalled()
  })

  it('calls LLM to pick from multiple candidates', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1', title: 'One', titleLabel: 'A', summary: 'S1', relevance: 8, emotionTag: 'calm', issue: null, datePublished: null, sourceTitle: 'Source1', relevanceSummary: null },
      { id: 'story-2', title: 'Two', titleLabel: 'B', summary: 'S2', relevance: 7, emotionTag: 'uplifting', issue: null, datePublished: null, sourceTitle: 'Source2', relevanceSummary: null },
    ])
    mockLlm.invoke.mockResolvedValue({ storyId: 'story-2', reasoning: 'More engaging' })

    const result = await pickBestStoryForSocial(['story-1', 'story-2'])
    expect(result.storyId).toBe('story-2')
    expect(result.reasoning).toBe('More engaging')
  })

  it('falls back to first candidate if LLM returns invalid ID', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1', title: 'One', titleLabel: 'A', summary: 'S1', relevance: 8, emotionTag: 'calm', issue: null, datePublished: null, sourceTitle: 'Source1', relevanceSummary: null },
      { id: 'story-2', title: 'Two', titleLabel: 'B', summary: 'S2', relevance: 7, emotionTag: 'calm', issue: null, datePublished: null, sourceTitle: 'Source2', relevanceSummary: null },
    ])
    mockLlm.invoke.mockResolvedValue({ storyId: 'nonexistent', reasoning: 'N/A' })

    const result = await pickBestStoryForSocial(['story-1', 'story-2'])
    expect(result.storyId).toBe('story-1')
  })

  it('throws when no stories found', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])
    await expect(pickBestStoryForSocial(['story-1'])).rejects.toThrow('No stories found')
  })
})
