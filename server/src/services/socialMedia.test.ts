import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AutoPostChannel } from './socialMedia.js'

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
  twitterPost: {
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
  })

  // A channel that has published exactly the story IDs it was built with.
  const channel = (name: string, published: string[] = []): AutoPostChannel => ({
    name,
    publishedStoryIds: vi.fn(
      async (storyIds: string[]) => new Set(storyIds.filter((id) => published.includes(id))),
    ),
  })

  it('returns empty without querying when no channel is enabled', async () => {
    const result = await findAutoPostCandidates(25, [])

    expect(result).toEqual([])
    expect(mockPrisma.story.findMany).not.toHaveBeenCalled()
  })

  it('returns empty when no published stories', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    const result = await findAutoPostCandidates(25, [channel('bluesky')])
    expect(result).toEqual([])
  })

  it('returns stories at least one channel has not published', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1' },
      { id: 'story-2' },
      { id: 'story-3' },
    ])

    const result = await findAutoPostCandidates(25, [
      channel('bluesky', ['story-1']),
      channel('mastodon', ['story-2']),
    ])

    // story-1 not on Mastodon, story-2 not on Bluesky, story-3 on neither
    expect(result).toEqual(['story-1', 'story-2', 'story-3'])
  })

  it('excludes stories every enabled channel has published', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1' },
      { id: 'story-2' },
    ])

    const result = await findAutoPostCandidates(25, [
      channel('bluesky', ['story-1', 'story-2']),
      channel('mastodon', ['story-1']),
      channel('instagram', ['story-1']),
    ])

    // story-1 is on all three — excluded; story-2 only on Bluesky — included
    expect(result).not.toContain('story-1')
    expect(result).toContain('story-2')
  })

  // Regression: selection used to query a fixed set of tables instead of the
  // enabled channels, so a channel that was off (or simply absent from that
  // list) kept stories eligible forever and burned an LLM pick on a story
  // every enabled channel had already posted.
  it('ignores channels it was not given', async () => {
    mockPrisma.story.findMany.mockResolvedValue([{ id: 'story-1' }])

    const result = await findAutoPostCandidates(25, [channel('bluesky', ['story-1'])])

    expect(result).toEqual([])
    expect(mockPrisma.twitterPost.findMany).not.toHaveBeenCalled()
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
