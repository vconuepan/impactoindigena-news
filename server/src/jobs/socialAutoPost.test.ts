import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every channel flag starts off; each test turns on only what it needs.
const mockConfig = vi.hoisted(() => ({
  config: {
    bluesky: { autoPost: { enabled: false } },
    mastodon: { autoPost: { enabled: false } },
    twitter: { autoPost: { enabled: false } },
    instagram: { autoPost: { enabled: false } },
    linkedin: { autoPost: { enabled: false } },
    facebook: { autoPost: { enabled: false } },
    socialAutoPost: { lookbackHours: 25 },
  },
}))

const mockPrisma = vi.hoisted(() => ({
  blueskyPost: { findMany: vi.fn().mockResolvedValue([]) },
  mastodonPost: { findMany: vi.fn().mockResolvedValue([]) },
  twitterPost: { findMany: vi.fn().mockResolvedValue([]) },
  instagramPost: { findMany: vi.fn().mockResolvedValue([]) },
  linkedInPost: { findMany: vi.fn().mockResolvedValue([]) },
  facebookPost: { findMany: vi.fn().mockResolvedValue([]) },
}))

const mockSocial = vi.hoisted(() => ({
  findAutoPostCandidates: vi.fn(),
  pickBestStoryForSocial: vi.fn(),
}))

const mockChannels = vi.hoisted(() => ({
  linkedin: { generateDraft: vi.fn(), publishPost: vi.fn() },
  bluesky: { generateDraft: vi.fn(), publishPost: vi.fn() },
  facebook: { generateDraft: vi.fn(), publishPost: vi.fn() },
}))

vi.mock('../config.js', () => mockConfig)
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../services/socialMedia.js', () => mockSocial)
vi.mock('../lib/bluesky.js', () => ({ isBlueskyConfigured: () => true }))
vi.mock('../lib/mastodon.js', () => ({ isMastodonConfigured: () => true }))
vi.mock('../lib/twitter.js', () => ({ isTwitterConfigured: () => true }))
vi.mock('../lib/instagram.js', () => ({ isInstagramConfigured: () => true }))
vi.mock('../lib/linkedin.js', () => ({ isLinkedInConfigured: () => true }))
vi.mock('../lib/facebook.js', () => ({ isFacebookConfigured: () => true }))
vi.mock('../services/bluesky.js', () => mockChannels.bluesky)
vi.mock('../services/mastodon.js', () => ({ generateDraft: vi.fn(), publishPost: vi.fn() }))
vi.mock('../services/twitter.js', () => ({ generateDraft: vi.fn(), publishPost: vi.fn() }))
vi.mock('../services/instagram.js', () => ({ generateDraft: vi.fn(), publishPost: vi.fn() }))
vi.mock('../services/linkedin.js', () => mockChannels.linkedin)
vi.mock('../services/facebook.js', () => mockChannels.facebook)

const { runSocialAutoPost } = await import('./socialAutoPost.js')

/** The channel list the job handed to candidate selection. */
function selectedChannelNames(): string[] {
  const [, channels] = mockSocial.findAutoPostCandidates.mock.calls[0]
  return (channels as Array<{ name: string }>).map((c) => c.name)
}

describe('runSocialAutoPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of ['bluesky', 'mastodon', 'twitter', 'instagram', 'linkedin', 'facebook'] as const) {
      mockConfig.config[key].autoPost.enabled = false
    }
    for (const table of Object.values(mockPrisma)) table.findMany.mockResolvedValue([])
    mockSocial.findAutoPostCandidates.mockResolvedValue([])
  })

  it('does nothing when no channel is enabled', async () => {
    await runSocialAutoPost()

    expect(mockSocial.findAutoPostCandidates).not.toHaveBeenCalled()
    expect(mockSocial.pickBestStoryForSocial).not.toHaveBeenCalled()
  })

  // Regression: LINKEDIN_AUTO_POST_ENABLED was read nowhere, so turning it on
  // posted nothing and gave no hint why.
  it('includes LinkedIn when its auto-post flag is on', async () => {
    mockConfig.config.linkedin.autoPost.enabled = true

    await runSocialAutoPost()

    expect(selectedChannelNames()).toContain('linkedin')
  })

  it('leaves LinkedIn out when its flag is off', async () => {
    mockConfig.config.bluesky.autoPost.enabled = true

    await runSocialAutoPost()

    expect(selectedChannelNames()).toEqual(['bluesky'])
  })

  it('includes Facebook when its auto-post flag is on', async () => {
    mockConfig.config.facebook.autoPost.enabled = true

    await runSocialAutoPost()

    expect(selectedChannelNames()).toContain('facebook')
  })

  it('drafts and publishes to the Facebook Page for the picked story', async () => {
    mockConfig.config.facebook.autoPost.enabled = true
    mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
    mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
    mockChannels.facebook.generateDraft.mockResolvedValue({ id: 'fb-1' })
    mockChannels.facebook.publishPost.mockResolvedValue(undefined)

    await runSocialAutoPost()

    expect(mockChannels.facebook.generateDraft).toHaveBeenCalledWith('story-1')
    expect(mockChannels.facebook.publishPost).toHaveBeenCalledWith('fb-1')
  })

  it('drafts and publishes to LinkedIn for the picked story', async () => {
    mockConfig.config.linkedin.autoPost.enabled = true
    mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
    mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
    mockChannels.linkedin.generateDraft.mockResolvedValue({ id: 'post-1' })
    mockChannels.linkedin.publishPost.mockResolvedValue(undefined)

    await runSocialAutoPost()

    expect(mockChannels.linkedin.generateDraft).toHaveBeenCalledWith('story-1')
    expect(mockChannels.linkedin.publishPost).toHaveBeenCalledWith('post-1')
  })

  it('skips a channel that already published the picked story', async () => {
    mockConfig.config.linkedin.autoPost.enabled = true
    mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
    mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
    mockPrisma.linkedInPost.findMany.mockResolvedValue([{ storyId: 'story-1' }])

    await runSocialAutoPost()

    expect(mockChannels.linkedin.generateDraft).not.toHaveBeenCalled()
  })

  // One channel blowing up must not cost the others their turn.
  it('keeps posting to other channels after one fails', async () => {
    mockConfig.config.bluesky.autoPost.enabled = true
    mockConfig.config.linkedin.autoPost.enabled = true
    mockSocial.findAutoPostCandidates.mockResolvedValue(['story-1'])
    mockSocial.pickBestStoryForSocial.mockResolvedValue({ storyId: 'story-1', reasoning: 'best' })
    mockChannels.bluesky.generateDraft.mockRejectedValue(new Error('bluesky down'))
    mockChannels.linkedin.generateDraft.mockResolvedValue({ id: 'post-1' })
    mockChannels.linkedin.publishPost.mockResolvedValue(undefined)

    await expect(runSocialAutoPost()).resolves.toBeUndefined()

    expect(mockChannels.linkedin.publishPost).toHaveBeenCalledWith('post-1')
  })
})
