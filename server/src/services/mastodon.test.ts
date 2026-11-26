import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  story: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  mastodonPost: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

const mockMastodonClient = vi.hoisted(() => ({
  createStatus: vi.fn(),
  getStatusMetrics: vi.fn(),
  deleteStatus: vi.fn(),
  isMastodonConfigured: vi.fn().mockReturnValue(true),
  getAccountStatuses: vi.fn(),
}))

const mockLlm = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

// Regla 2: por defecto ninguna nota menciona a un cliente.
const mockAviso = vi.hoisted(() => ({ lineaDeAvisoParaPublicar: vi.fn(async () => null as string | null) }))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./avisoClientes.js', () => mockAviso)
vi.mock('../lib/mastodon.js', () => mockMastodonClient)
vi.mock('./llm.js', () => ({
  getLLMByTier: vi.fn(() => ({
    withStructuredOutput: vi.fn(() => mockLlm),
  })),
  rateLimitDelay: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../prompts/index.js', () => ({
  buildMastodonPostPrompt: vi.fn(() => 'post prompt'),
  buildBlueskyPickBestPrompt: vi.fn(() => 'pick prompt'),
}))
// Mock socialMedia.js for pickBestStoryForSocial (used by pickAndDraft)
vi.mock('./socialMedia.js', () => ({
  pickBestStoryForSocial: vi.fn().mockResolvedValue({ storyId: 'story-1', reasoning: 'Good story' }),
}))

const { assemblePostText, generateDraft, updateDraft, deletePostRecord, publishPost, updateMetrics, listPosts, getFeed, invalidateFeedCache } =
  await import('./mastodon.js')

describe('assemblePostText', () => {
  it('assembles editorial text, metadata, source URL, and story URL', () => {
    const result = assemblePostText({
      blurb: 'A great discovery.',
      issueName: 'Climate',
      emotionTag: 'uplifting',
      publisherName: 'Nature',
      sourceUrl: 'https://nature.com/articles/great-discovery',
      storyUrl: 'https://actuallyrelevant.com/stories/great-discovery',
    })
    expect(result).toBe(
      'A great discovery.\nClimate | Uplifting | found on Nature\nhttps://nature.com/articles/great-discovery\nhttps://actuallyrelevant.com/stories/great-discovery',
    )
  })

  it('capitalizes emotion tag', () => {
    const result = assemblePostText({
      blurb: 'Blurb.',
      issueName: 'Climate',
      emotionTag: 'uplifting',
      publisherName: 'Nature',
      sourceUrl: 'https://nature.com/article',
      storyUrl: 'https://example.com/s',
    })
    expect(result).toContain('Uplifting')
    expect(result).not.toContain('uplifting')
  })

  it('omits issue when null', () => {
    const result = assemblePostText({
      blurb: 'Blurb.',
      issueName: null,
      emotionTag: 'calm',
      publisherName: 'Reuters',
      sourceUrl: 'https://reuters.com/article',
      storyUrl: 'https://example.com/s',
    })
    expect(result).toContain('Calm | found on Reuters')
    expect(result).not.toContain('null')
  })

  it('omits emotion when null', () => {
    const result = assemblePostText({
      blurb: 'Blurb.',
      issueName: 'Science',
      emotionTag: null,
      publisherName: 'Reuters',
      sourceUrl: 'https://reuters.com/article',
      storyUrl: 'https://example.com/s',
    })
    expect(result).toContain('Science | found on Reuters')
  })

  it('places source URL on third line and story URL on fourth line', () => {
    const result = assemblePostText({
      blurb: 'Hook.',
      issueName: 'Science',
      emotionTag: 'calm',
      publisherName: 'Reuters',
      sourceUrl: 'https://reuters.com/article/test',
      storyUrl: 'https://actuallyrelevant.com/stories/test',
    })
    const lines = result.split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('Hook.')
    expect(lines[1]).toContain('found on Reuters')
    expect(lines[2]).toBe('https://reuters.com/article/test')
    expect(lines[3]).toBe('https://actuallyrelevant.com/stories/test')
  })
})

describe('generateDraft', () => {
  beforeEach(() => vi.clearAllMocks())

  const mockStory = {
    id: 'story-1',
    title: 'Test Story',
    titleLabel: 'Tech',
    summary: 'A summary',
    relevanceSummary: 'Important because...',
    emotionTag: 'uplifting',
    slug: 'test-story',
    sourceUrl: 'https://example.com/article',
    feed: { title: 'Example News', displayTitle: 'Example' },
    issue: { name: 'Technology' },
  }

  it('generates a draft post', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(mockStory)
    mockPrisma.mastodonPost.findFirst.mockResolvedValue(null)
    mockLlm.invoke.mockResolvedValue({ postText: 'A compelling hook.' })
    mockPrisma.mastodonPost.create.mockResolvedValue({
      id: 'post-1',
      storyId: 'story-1',
      postText: 'assembled text',
      status: 'draft',
      story: mockStory,
    })

    const result = await generateDraft('story-1')

    expect(result.status).toBe('draft')
    expect(mockPrisma.mastodonPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storyId: 'story-1',
          status: 'draft',
        }),
      }),
    )
  })

  it('throws if story not found', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(null)
    await expect(generateDraft('missing')).rejects.toThrow('Story not found')
  })

  it('throws if story has no title', async () => {
    mockPrisma.story.findUnique.mockResolvedValue({ ...mockStory, title: null })
    await expect(generateDraft('story-1')).rejects.toThrow('must be fully analyzed')
  })

  it('trims LLM blurb so assembled post fits within character limit', async () => {
    const longUrlStory = {
      ...mockStory,
      sourceUrl: 'https://example.com/very/long/path/to/article/with/many/segments/that/are/quite/verbose',
    }
    mockPrisma.story.findUnique.mockResolvedValue(longUrlStory)
    mockPrisma.mastodonPost.findFirst.mockResolvedValue(null)
    // Return a blurb that's intentionally oversized — the service should trim it
    mockLlm.invoke.mockResolvedValue({ postText: 'A'.repeat(400) })
    mockPrisma.mastodonPost.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'post-1', ...data, story: longUrlStory }),
    )

    await generateDraft('story-1')

    const createCall = mockPrisma.mastodonPost.create.mock.calls[0][0] as any
    expect(createCall.data.postText.length).toBeLessThanOrEqual(500)
  })

  it('throws if story already has a Mastodon post', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(mockStory)
    mockPrisma.mastodonPost.findFirst.mockResolvedValue({ id: 'existing-post' })
    await expect(generateDraft('story-1')).rejects.toThrow('already has a Mastodon post')
  })
})

describe('updateDraft', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates draft text', async () => {
    mockPrisma.mastodonPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'draft' })
    mockPrisma.mastodonPost.update.mockResolvedValue({ id: 'post-1', postText: 'Updated text', status: 'draft' })

    const result = await updateDraft('post-1', 'Updated text')
    expect(result.postText).toBe('Updated text')
  })

  it('throws when post not found', async () => {
    mockPrisma.mastodonPost.findUnique.mockResolvedValue(null)
    await expect(updateDraft('missing', 'text')).rejects.toThrow('Post not found')
  })

  it('throws when post is not a draft', async () => {
    mockPrisma.mastodonPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'published' })
    await expect(updateDraft('post-1', 'text')).rejects.toThrow('Can only edit draft posts')
  })
})

describe('deletePostRecord', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a draft post without calling Mastodon API', async () => {
    mockPrisma.mastodonPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'draft', statusId: null })
    await deletePostRecord('post-1')
    expect(mockPrisma.mastodonPost.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } })
    expect(mockMastodonClient.deleteStatus).not.toHaveBeenCalled()
  })

  it('deletes a published post and removes from Mastodon', async () => {
    mockPrisma.mastodonPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'published', statusId: '12345' })
    mockMastodonClient.deleteStatus.mockResolvedValue(undefined)
    await deletePostRecord('post-1')
    expect(mockMastodonClient.deleteStatus).toHaveBeenCalledWith('12345')
    expect(mockPrisma.mastodonPost.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } })
  })

  it('still deletes DB record if Mastodon API fails', async () => {
    mockPrisma.mastodonPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'published', statusId: '12345' })
    mockMastodonClient.deleteStatus.mockRejectedValue(new Error('Not found'))
    await deletePostRecord('post-1')
    expect(mockPrisma.mastodonPost.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } })
  })

  it('throws when post not found', async () => {
    mockPrisma.mastodonPost.findUnique.mockResolvedValue(null)
    await expect(deletePostRecord('missing')).rejects.toThrow('Post not found')
  })
})

describe('publishPost', () => {
  beforeEach(() => vi.clearAllMocks())

  it('publishes a draft to Mastodon', async () => {
    const mockPost = {
      id: 'post-1',
      status: 'draft',
      postText: 'Great post\nClimate | Uplifting | found on Reuters\nhttps://example.com/stories/test',
      story: { slug: 'test', title: 'Test', feed: { title: 'Feed', displayTitle: 'Feed' } },
    }
    mockPrisma.mastodonPost.findUnique.mockResolvedValue(mockPost)
    mockMastodonClient.createStatus.mockResolvedValue({ id: '12345', url: 'https://mastodon.social/@bot/12345' })
    mockPrisma.mastodonPost.update.mockResolvedValue({
      ...mockPost,
      status: 'published',
      statusId: '12345',
      statusUrl: 'https://mastodon.social/@bot/12345',
    })

    const result = await publishPost('post-1')
    expect(result.status).toBe('published')
    expect(mockMastodonClient.createStatus).toHaveBeenCalled()
  })

  it('throws when not configured', async () => {
    mockMastodonClient.isMastodonConfigured.mockReturnValue(false)
    await expect(publishPost('post-1')).rejects.toThrow('not configured')
    mockMastodonClient.isMastodonConfigured.mockReturnValue(true)
  })

  it('marks as failed on API error', async () => {
    const mockPost = {
      id: 'post-1',
      status: 'draft',
      postText: 'Great post',
      story: { slug: 'test', title: 'Test', feed: { title: 'Feed', displayTitle: 'Feed' } },
    }
    mockPrisma.mastodonPost.findUnique.mockResolvedValue(mockPost)
    mockMastodonClient.createStatus.mockRejectedValue(new Error('API error'))
    mockPrisma.mastodonPost.update.mockResolvedValue({ ...mockPost, status: 'failed', error: 'API error' })

    await expect(publishPost('post-1')).rejects.toThrow('API error')
    expect(mockPrisma.mastodonPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', error: 'API error' }),
      }),
    )
  })
})

describe('updateMetrics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates metrics for published posts', async () => {
    mockPrisma.mastodonPost.findMany.mockResolvedValue([
      { id: 'post-1', statusId: '111' },
      { id: 'post-2', statusId: '222' },
    ])
    mockMastodonClient.getStatusMetrics
      .mockResolvedValueOnce({ favouriteCount: 5, boostCount: 2, replyCount: 1 })
      .mockResolvedValueOnce({ favouriteCount: 10, boostCount: 3, replyCount: 2 })
    mockPrisma.mastodonPost.update.mockResolvedValue({})

    await updateMetrics()

    expect(mockPrisma.mastodonPost.update).toHaveBeenCalledTimes(2)
    expect(mockPrisma.mastodonPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1' },
        data: expect.objectContaining({ favouriteCount: 5, boostCount: 2 }),
      }),
    )
  })

  it('continues on individual post failure', async () => {
    mockPrisma.mastodonPost.findMany.mockResolvedValue([
      { id: 'post-1', statusId: '111' },
      { id: 'post-2', statusId: '222' },
    ])
    mockMastodonClient.getStatusMetrics
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce({ favouriteCount: 10, boostCount: 3, replyCount: 2 })
    mockPrisma.mastodonPost.update.mockResolvedValue({})

    await updateMetrics()

    expect(mockPrisma.mastodonPost.update).toHaveBeenCalledTimes(1)
  })

  it('skips when not configured', async () => {
    mockMastodonClient.isMastodonConfigured.mockReturnValue(false)
    await updateMetrics()
    expect(mockPrisma.mastodonPost.findMany).not.toHaveBeenCalled()
    mockMastodonClient.isMastodonConfigured.mockReturnValue(true)
  })
})

describe('listPosts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated posts', async () => {
    const posts = [{ id: 'post-1' }, { id: 'post-2' }]
    mockPrisma.mastodonPost.findMany.mockResolvedValue(posts)
    mockPrisma.mastodonPost.count.mockResolvedValue(10)

    const result = await listPosts({ page: 1, limit: 20 })
    expect(result.posts).toHaveLength(2)
    expect(result.total).toBe(10)
    expect(result.page).toBe(1)
  })

  it('filters by status', async () => {
    mockPrisma.mastodonPost.findMany.mockResolvedValue([])
    mockPrisma.mastodonPost.count.mockResolvedValue(0)

    await listPosts({ status: 'published' })

    expect(mockPrisma.mastodonPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'published' },
      }),
    )
  })
})

describe('getFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateFeedCache()
  })

  it('returns empty when not configured', async () => {
    mockMastodonClient.isMastodonConfigured.mockReturnValue(false)

    const result = await getFeed({})
    expect(result.feed).toHaveLength(0)
    expect(result.dbOnlyPosts).toHaveLength(0)
    mockMastodonClient.isMastodonConfigured.mockReturnValue(true)
  })

  it('merges API feed with DB tracked posts', async () => {
    mockMastodonClient.isMastodonConfigured.mockReturnValue(true)
    mockMastodonClient.getAccountStatuses.mockResolvedValue({
      items: [
        { id: '111', url: 'https://mas.to/@bot/111', text: 'Tracked post', createdAt: '2025-01-01T00:00:00Z', favouriteCount: 5, boostCount: 1, replyCount: 0, isReblog: false },
        { id: '222', url: 'https://mas.to/@bot/222', text: 'Untracked post', createdAt: '2025-01-02T00:00:00Z', favouriteCount: 3, boostCount: 0, replyCount: 1, isReblog: false },
      ],
      nextMaxId: 'next-id',
    })

    mockPrisma.mastodonPost.findMany
      .mockResolvedValueOnce([
        { id: 'db-1', statusId: '111', status: 'published', story: { title: 'My Story', slug: 'my-story', issue: { name: 'Climate' } } },
      ])
      .mockResolvedValueOnce([])

    const result = await getFeed({})

    expect(result.feed).toHaveLength(2)
    expect(result.feed[0].trackedPostId).toBe('db-1')
    expect(result.feed[0].storyTitle).toBe('My Story')
    expect(result.feed[1].trackedPostId).toBeNull()
    expect(result.nextMaxId).toBe('next-id')
  })

  it('includes draft/failed posts on first page', async () => {
    mockMastodonClient.isMastodonConfigured.mockReturnValue(true)
    mockMastodonClient.getAccountStatuses.mockResolvedValue({ items: [], nextMaxId: undefined })

    mockPrisma.mastodonPost.findMany
      .mockResolvedValueOnce([
        { id: 'draft-1', postText: 'Draft post', status: 'draft', error: null, createdAt: new Date(), story: { title: 'Draft Story', slug: 'draft-story', issue: { name: 'Tech' } } },
      ])

    const result = await getFeed({})

    expect(result.dbOnlyPosts).toHaveLength(1)
    expect(result.dbOnlyPosts[0].status).toBe('draft')
    expect(result.dbOnlyPosts[0].storyTitle).toBe('Draft Story')
  })

  it('skips draft/failed when maxId is provided', async () => {
    mockMastodonClient.isMastodonConfigured.mockReturnValue(true)
    mockMastodonClient.getAccountStatuses.mockResolvedValue({ items: [], nextMaxId: undefined })

    const result = await getFeed({ maxId: 'some-id' })

    expect(result.dbOnlyPosts).toHaveLength(0)
  })
})

describe('aviso de independencia (regla 2)', async () => {
  const { config } = await import('../config.js')
  const AVISO = 'Aviso de independencia: esta nota menciona a una organización que es cliente de impactoindigena.ai.'
  const story = {
    id: 'story-1', title: 'T', titleLabel: '', summary: 'S', relevanceSummary: 'R', emotionTag: 'uplifting',
    slug: 'la-nota', sourceUrl: 'https://medio.cl/nota', feed: { title: 'Medio', displayTitle: 'Medio' }, issue: { name: 'Tierra' },
  }
  const storyUrl = `${config.siteUrl}/stories/la-nota`
  const cola = `\n${story.sourceUrl}\n${storyUrl}`

  beforeEach(() => {
    vi.clearAllMocks()
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(null)
    mockPrisma.mastodonPost.create.mockImplementation(async ({ data }: any) => ({ id: 'p', ...data }))
    mockPrisma.mastodonPost.update.mockImplementation(async ({ data }: any) => ({ id: 'p', ...data }))
    mockMastodonClient.createStatus.mockResolvedValue({ id: '1', url: 'https://m/1' })
  })

  it('con aviso: el borrador lo lleva al final, después de las dos URL', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(AVISO)
    mockPrisma.story.findUnique.mockResolvedValue(story)
    mockPrisma.mastodonPost.findFirst.mockResolvedValue(null)
    mockLlm.invoke.mockResolvedValue({ postText: 'Gancho.' })

    await generateDraft('story-1')

    expect(mockAviso.lineaDeAvisoParaPublicar).toHaveBeenCalledWith('story-1', 'larga')
    const texto = mockPrisma.mastodonPost.create.mock.calls[0][0].data.postText as string
    expect(texto.endsWith(`${cola}\n${AVISO}`)).toBe(true)
  })

  it('sin aviso: el borrador termina en la URL de la ficha', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(story)
    mockPrisma.mastodonPost.findFirst.mockResolvedValue(null)
    mockLlm.invoke.mockResolvedValue({ postText: 'Gancho.' })

    await generateDraft('story-1')

    expect((mockPrisma.mastodonPost.create.mock.calls[0][0].data.postText as string).endsWith(storyUrl)).toBe(true)
  })

  it('al publicar: agrega el aviso, recorta el gancho y nunca las URL', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(AVISO)
    const largo = 'g'.repeat(config.mastodon.charLimit) + `\nTierra | found on Medio${cola}`
    mockPrisma.mastodonPost.findUnique.mockResolvedValue({ id: 'p', status: 'draft', postText: largo, story })

    await publishPost('p')

    const enviado = mockMastodonClient.createStatus.mock.calls[0][0] as string
    expect(enviado.length).toBeLessThanOrEqual(config.mastodon.charLimit)
    expect(enviado.endsWith(`${cola}\n${AVISO}`)).toBe(true)
  })

  it('al publicar sin aviso: el texto sale tal cual', async () => {
    const texto = `Gancho.\nTierra | found on Medio${cola}`
    mockPrisma.mastodonPost.findUnique.mockResolvedValue({ id: 'p', status: 'draft', postText: texto, story })

    await publishPost('p')

    expect(mockMastodonClient.createStatus).toHaveBeenCalledWith(texto)
  })
})
