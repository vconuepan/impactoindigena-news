import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  story: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  blueskyPost: {
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

const mockBlueskyClient = vi.hoisted(() => ({
  createPost: vi.fn(),
  getPostMetrics: vi.fn(),
  deletePost: vi.fn(),
  isBlueskyConfigured: vi.fn().mockReturnValue(true),
  getAuthorFeed: vi.fn(),
}))

const mockLlm = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

// Regla 2: por defecto ninguna nota menciona a un cliente.
const mockAviso = vi.hoisted(() => ({ lineaDeAvisoParaPublicar: vi.fn(async () => null as string | null) }))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./avisoClientes.js', () => mockAviso)
vi.mock('../lib/bluesky.js', () => mockBlueskyClient)
vi.mock('./llm.js', () => ({
  getLLMByTier: vi.fn(() => ({
    withStructuredOutput: vi.fn(() => mockLlm),
  })),
  rateLimitDelay: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../prompts/index.js', () => ({
  buildBlueskyPostPrompt: vi.fn(() => 'post prompt'),
  buildBlueskyPickBestPrompt: vi.fn(() => 'pick prompt'),
}))

const { assemblePostText, generateDraft, pickBestStory, updateDraft, deletePostRecord, publishPost, updateMetrics, listPosts, getFeed, invalidateFeedCache } =
  await import('./bluesky.js')

describe('assemblePostText', () => {
  it('assembles metadata line and editorial text', () => {
    const result = assemblePostText({
      blurb: 'A great discovery.',
      issueName: 'Climate',
      emotionTag: 'uplifting',
      publisherName: 'Nature',
    })
    expect(result).toBe('A great discovery.\nClimate | Uplifting | found on Nature')
  })

  it('capitalizes emotion tag', () => {
    const result = assemblePostText({
      blurb: 'Blurb.',
      issueName: 'Climate',
      emotionTag: 'uplifting',
      publisherName: 'Nature',
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
    })
    expect(result).toContain('Science | found on Reuters')
  })

  it('places metadata line after editorial text', () => {
    const result = assemblePostText({
      blurb: 'Editorial hook.',
      issueName: 'Science',
      emotionTag: 'calm',
      publisherName: 'Reuters',
    })
    const lines = result.split('\n')
    expect(lines[0]).toBe('Editorial hook.')
    expect(lines[1]).toContain('found on Reuters')
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
    quote: 'A great quote',
    quoteAttribution: 'Author',
    emotionTag: 'uplifting',
    slug: 'test-story',
    sourceUrl: 'https://example.com/article',
    marketingBlurb: 'Short blurb',
    sourceTitle: 'Original Title',
    feed: { title: 'Example News', displayTitle: 'Example' },
    issue: { name: 'Technology' },
  }

  it('generates a draft post with assembled text', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(mockStory)
    mockPrisma.blueskyPost.findFirst.mockResolvedValue(null)
    mockLlm.invoke.mockResolvedValue({ postText: 'A compelling editorial hook.' })
    mockPrisma.blueskyPost.create.mockResolvedValue({
      id: 'post-1',
      storyId: 'story-1',
      postText: 'A compelling editorial hook.\nTechnology | Uplifting | found on Example',
      status: 'draft',
      story: mockStory,
    })

    const result = await generateDraft('story-1')

    expect(result.status).toBe('draft')
    expect(mockPrisma.blueskyPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storyId: 'story-1',
          postText: 'A compelling editorial hook.\nTechnology | Uplifting | found on Example',
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

  it('throws if story already has a Bluesky post', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(mockStory)
    mockPrisma.blueskyPost.findFirst.mockResolvedValue({ id: 'existing-post' })
    await expect(generateDraft('story-1')).rejects.toThrow('already has a Bluesky post')
  })
})

describe('pickBestStory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the only candidate without LLM call', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1', title: 'One', titleLabel: 'A', summary: 'S', relevance: 8, emotionTag: 'calm', issue: null, datePublished: null },
    ])
    mockPrisma.blueskyPost.findMany.mockResolvedValue([])

    const result = await pickBestStory(['story-1'])
    expect(result.storyId).toBe('story-1')
    expect(mockLlm.invoke).not.toHaveBeenCalled()
  })

  it('calls LLM to pick from multiple candidates', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1', title: 'One', titleLabel: 'A', summary: 'S1', relevance: 8, emotionTag: 'calm', issue: null, datePublished: null },
      { id: 'story-2', title: 'Two', titleLabel: 'B', summary: 'S2', relevance: 7, emotionTag: 'uplifting', issue: null, datePublished: null },
    ])
    mockPrisma.blueskyPost.findMany.mockResolvedValue([])
    mockLlm.invoke.mockResolvedValue({ storyId: 'story-2', reasoning: 'More engaging' })

    const result = await pickBestStory(['story-1', 'story-2'])
    expect(result.storyId).toBe('story-2')
    expect(result.reasoning).toBe('More engaging')
  })

  it('excludes already-posted stories', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1', title: 'One', titleLabel: 'A', summary: 'S', relevance: 8, emotionTag: 'calm', issue: null, datePublished: null },
      { id: 'story-2', title: 'Two', titleLabel: 'B', summary: 'S', relevance: 7, emotionTag: 'calm', issue: null, datePublished: null },
    ])
    mockPrisma.blueskyPost.findMany.mockResolvedValue([{ storyId: 'story-1' }])

    const result = await pickBestStory(['story-1', 'story-2'])
    expect(result.storyId).toBe('story-2')
  })

  it('throws when all stories already posted', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 'story-1', title: 'One', titleLabel: 'A', summary: 'S', relevance: 8, emotionTag: 'calm', issue: null, datePublished: null },
    ])
    mockPrisma.blueskyPost.findMany.mockResolvedValue([{ storyId: 'story-1' }])

    await expect(pickBestStory(['story-1'])).rejects.toThrow('already have a Bluesky post')
  })
})

describe('updateDraft', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates draft text', async () => {
    mockPrisma.blueskyPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'draft' })
    mockPrisma.blueskyPost.update.mockResolvedValue({ id: 'post-1', postText: 'Updated text', status: 'draft' })

    const result = await updateDraft('post-1', 'Updated text')
    expect(result.postText).toBe('Updated text')
  })

  it('throws when post not found', async () => {
    mockPrisma.blueskyPost.findUnique.mockResolvedValue(null)
    await expect(updateDraft('missing', 'text')).rejects.toThrow('Post not found')
  })

  it('throws when post is not a draft', async () => {
    mockPrisma.blueskyPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'published' })
    await expect(updateDraft('post-1', 'text')).rejects.toThrow('Can only edit draft posts')
  })
})

describe('deletePostRecord', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a draft post without calling Bluesky API', async () => {
    mockPrisma.blueskyPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'draft', postUri: null })
    await deletePostRecord('post-1')
    expect(mockPrisma.blueskyPost.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } })
    expect(mockBlueskyClient.deletePost).not.toHaveBeenCalled()
  })

  it('deletes a published post and removes from Bluesky', async () => {
    mockPrisma.blueskyPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'published', postUri: 'at://did/post/1' })
    mockBlueskyClient.deletePost.mockResolvedValue(undefined)
    await deletePostRecord('post-1')
    expect(mockBlueskyClient.deletePost).toHaveBeenCalledWith('at://did/post/1')
    expect(mockPrisma.blueskyPost.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } })
  })

  it('still deletes DB record if Bluesky API fails', async () => {
    mockPrisma.blueskyPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'published', postUri: 'at://did/post/1' })
    mockBlueskyClient.deletePost.mockRejectedValue(new Error('Not found'))
    await deletePostRecord('post-1')
    expect(mockPrisma.blueskyPost.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } })
  })

  it('throws when post not found', async () => {
    mockPrisma.blueskyPost.findUnique.mockResolvedValue(null)
    await expect(deletePostRecord('missing')).rejects.toThrow('Post not found')
  })
})

describe('publishPost', () => {
  beforeEach(() => vi.clearAllMocks())

  it('publishes a draft to Bluesky', async () => {
    const mockPost = {
      id: 'post-1',
      status: 'draft',
      postText: 'Great post',
      story: {
        slug: 'test-story',
        title: 'Test',
        sourceTitle: 'Original',
        sourceUrl: 'https://example.com',
        marketingBlurb: 'Blurb',
        summary: 'Summary',
        feed: { title: 'Feed', displayTitle: 'Feed Name' },
      },
    }
    mockPrisma.blueskyPost.findUnique.mockResolvedValue(mockPost)
    mockBlueskyClient.createPost.mockResolvedValue({ uri: 'at://did/post/1', cid: 'cid123' })
    mockPrisma.blueskyPost.update.mockResolvedValue({
      ...mockPost,
      status: 'published',
      postUri: 'at://did/post/1',
      postCid: 'cid123',
    })

    const result = await publishPost('post-1')
    expect(result.status).toBe('published')
    expect(mockBlueskyClient.createPost).toHaveBeenCalled()
  })

  it('marks as failed on API error', async () => {
    const mockPost = {
      id: 'post-1',
      status: 'draft',
      postText: 'Great post',
      story: {
        slug: 'test-story',
        title: 'Test',
        sourceTitle: 'Original',
        sourceUrl: 'https://example.com',
        marketingBlurb: 'Blurb',
        summary: 'Summary',
        feed: { title: 'Feed', displayTitle: 'Feed Name' },
      },
    }
    mockPrisma.blueskyPost.findUnique.mockResolvedValue(mockPost)
    mockBlueskyClient.createPost.mockRejectedValue(new Error('API error'))
    mockPrisma.blueskyPost.update.mockResolvedValue({ ...mockPost, status: 'failed', error: 'API error' })

    await expect(publishPost('post-1')).rejects.toThrow('API error')
    expect(mockPrisma.blueskyPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', error: 'API error' }),
      }),
    )
  })
})

describe('updateMetrics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates metrics for published posts', async () => {
    mockPrisma.blueskyPost.findMany.mockResolvedValue([
      { id: 'post-1', postUri: 'at://did/post/1' },
      { id: 'post-2', postUri: 'at://did/post/2' },
    ])
    mockBlueskyClient.getPostMetrics
      .mockResolvedValueOnce({ likeCount: 5, repostCount: 2, replyCount: 1, quoteCount: 0 })
      .mockResolvedValueOnce({ likeCount: 10, repostCount: 3, replyCount: 2, quoteCount: 1 })
    mockPrisma.blueskyPost.update.mockResolvedValue({})

    await updateMetrics()

    expect(mockPrisma.blueskyPost.update).toHaveBeenCalledTimes(2)
    expect(mockPrisma.blueskyPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1' },
        data: expect.objectContaining({ likeCount: 5, repostCount: 2 }),
      }),
    )
  })

  it('continues on individual post failure', async () => {
    mockPrisma.blueskyPost.findMany.mockResolvedValue([
      { id: 'post-1', postUri: 'at://did/post/1' },
      { id: 'post-2', postUri: 'at://did/post/2' },
    ])
    mockBlueskyClient.getPostMetrics
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce({ likeCount: 10, repostCount: 3, replyCount: 2, quoteCount: 1 })
    mockPrisma.blueskyPost.update.mockResolvedValue({})

    await updateMetrics()

    // Only the second post should have been updated
    expect(mockPrisma.blueskyPost.update).toHaveBeenCalledTimes(1)
  })
})

describe('listPosts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated posts', async () => {
    const posts = [{ id: 'post-1' }, { id: 'post-2' }]
    mockPrisma.blueskyPost.findMany.mockResolvedValue(posts)
    mockPrisma.blueskyPost.count.mockResolvedValue(10)

    const result = await listPosts({ page: 1, limit: 20 })
    expect(result.posts).toHaveLength(2)
    expect(result.total).toBe(10)
    expect(result.page).toBe(1)
  })

  it('filters by status', async () => {
    mockPrisma.blueskyPost.findMany.mockResolvedValue([])
    mockPrisma.blueskyPost.count.mockResolvedValue(0)

    await listPosts({ status: 'published' })

    expect(mockPrisma.blueskyPost.findMany).toHaveBeenCalledWith(
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
    mockBlueskyClient.isBlueskyConfigured.mockReturnValue(false)

    const result = await getFeed({})
    expect(result.feed).toHaveLength(0)
    expect(result.dbOnlyPosts).toHaveLength(0)
  })

  it('merges API feed with DB tracked posts', async () => {
    mockBlueskyClient.isBlueskyConfigured.mockReturnValue(true)
    mockBlueskyClient.getAuthorFeed.mockResolvedValue({
      items: [
        { uri: 'at://did/post/1', cid: 'cid1', text: 'Tracked post', createdAt: '2025-01-01T00:00:00Z', indexedAt: '2025-01-01T00:00:00Z', likeCount: 5, repostCount: 1, replyCount: 0, quoteCount: 0, isRepost: false },
        { uri: 'at://did/post/2', cid: 'cid2', text: 'Untracked post', createdAt: '2025-01-02T00:00:00Z', indexedAt: '2025-01-02T00:00:00Z', likeCount: 3, repostCount: 0, replyCount: 1, quoteCount: 0, isRepost: false },
      ],
      cursor: 'next-cursor',
    })

    // One post is tracked in DB
    mockPrisma.blueskyPost.findMany
      .mockResolvedValueOnce([
        { id: 'db-1', postUri: 'at://did/post/1', status: 'published', story: { title: 'My Story', slug: 'my-story', issue: { name: 'Climate' } } },
      ])
      // Draft/failed query
      .mockResolvedValueOnce([])

    const result = await getFeed({})

    expect(result.feed).toHaveLength(2)
    expect(result.feed[0].trackedPostId).toBe('db-1')
    expect(result.feed[0].storyTitle).toBe('My Story')
    expect(result.feed[1].trackedPostId).toBeNull()
    expect(result.cursor).toBe('next-cursor')
  })

  it('includes draft/failed posts on first page', async () => {
    mockBlueskyClient.isBlueskyConfigured.mockReturnValue(true)
    mockBlueskyClient.getAuthorFeed.mockResolvedValue({ items: [], cursor: undefined })

    // Cross-reference query (empty)
    mockPrisma.blueskyPost.findMany
      // Draft/failed query
      .mockResolvedValueOnce([
        { id: 'draft-1', postText: 'Draft post', status: 'draft', error: null, createdAt: new Date(), story: { title: 'Draft Story', slug: 'draft-story', issue: { name: 'Tech' } } },
      ])

    const result = await getFeed({})

    expect(result.dbOnlyPosts).toHaveLength(1)
    expect(result.dbOnlyPosts[0].status).toBe('draft')
    expect(result.dbOnlyPosts[0].storyTitle).toBe('Draft Story')
  })

  it('skips draft/failed when cursor is provided', async () => {
    mockBlueskyClient.isBlueskyConfigured.mockReturnValue(true)
    mockBlueskyClient.getAuthorFeed.mockResolvedValue({ items: [], cursor: undefined })

    // No cross-reference needed (empty items)

    const result = await getFeed({ cursor: 'some-cursor' })

    expect(result.dbOnlyPosts).toHaveLength(0)
    // Only one findMany call (for cross-reference, not draft/failed)
  })
})

describe('aviso de independencia (regla 2)', () => {
  const AVISO = 'Aviso: la nota menciona a un cliente de impactoindigena.legal.'
  const story = {
    id: 'story-1', title: 'Test Story', titleLabel: '', summary: 'A summary', relevanceSummary: 'Why',
    emotionTag: 'uplifting', slug: 'test-story', sourceUrl: 'https://example.com/a', sourceTitle: 'Original',
    marketingBlurb: 'Blurb', feed: { title: 'Example News', displayTitle: 'Example' }, issue: { name: 'Technology' },
  }
  const meta = 'Technology | Uplifting | found on Example'

  beforeEach(() => {
    vi.clearAllMocks()
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(null)
    mockPrisma.blueskyPost.create.mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    mockPrisma.blueskyPost.update.mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    mockBlueskyClient.createPost.mockResolvedValue({ uri: 'at://did/post/1', cid: 'cid' })
  })

  it('con aviso: el borrador lo lleva en la última línea y el gancho recibe menos espacio', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(AVISO)
    mockPrisma.story.findUnique.mockResolvedValue(story)
    mockPrisma.blueskyPost.findFirst.mockResolvedValue(null)
    mockLlm.invoke.mockResolvedValue({ postText: 'A hook.' })
    const { buildBlueskyPostPrompt } = await import('../prompts/index.js')

    await generateDraft('story-1')

    expect(mockAviso.lineaDeAvisoParaPublicar).toHaveBeenCalledWith('story-1', 'corta')
    const texto = mockPrisma.blueskyPost.create.mock.calls[0][0].data.postText
    expect(texto).toBe(`A hook.\n${meta}\n${AVISO}`)
    expect(vi.mocked(buildBlueskyPostPrompt).mock.calls[0][0].maxChars).toBe(300 - meta.length - 1 - AVISO.length - 1)
  })

  it('sin aviso: el borrador queda como siempre', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(story)
    mockPrisma.blueskyPost.findFirst.mockResolvedValue(null)
    mockLlm.invoke.mockResolvedValue({ postText: 'A hook.' })

    await generateDraft('story-1')

    expect(mockPrisma.blueskyPost.create.mock.calls[0][0].data.postText).toBe(`A hook.\n${meta}`)
  })

  const post = (postText: string) => ({
    id: 'post-1', status: 'draft', postText,
    story: { ...story, feed: { title: 'Feed', displayTitle: 'Feed Name' } },
  })

  it('al publicar agrega el aviso aunque el borrador no lo tenga, y sin pasarse de 300', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockResolvedValue(AVISO)
    mockPrisma.blueskyPost.findUnique.mockResolvedValue(post('x'.repeat(290)))

    await publishPost('post-1')

    const enviado = mockBlueskyClient.createPost.mock.calls[0][0] as string
    expect(enviado.endsWith(`\n${AVISO}`)).toBe(true)
    expect(enviado.length).toBeLessThanOrEqual(300)
    expect(mockPrisma.blueskyPost.update.mock.calls[0][0].data.postText).toBe(enviado)
  })

  it('al publicar quita un aviso que ya no corresponde', async () => {
    mockPrisma.blueskyPost.findUnique.mockResolvedValue(post(`Hook.\n${meta}\n${AVISO}`))

    await publishPost('post-1')

    expect(mockBlueskyClient.createPost.mock.calls[0][0]).toBe(`Hook.\n${meta}`)
  })

  it('si el aviso no se puede calcular, no publica y queda failed', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockRejectedValue(new Error('db down'))
    mockPrisma.blueskyPost.findUnique.mockResolvedValue(post('Hook.'))

    await expect(publishPost('post-1')).rejects.toThrow('db down')
    expect(mockBlueskyClient.createPost).not.toHaveBeenCalled()
    expect(mockPrisma.blueskyPost.update.mock.calls[0][0].data).toMatchObject({ status: 'failed' })
  })
})
