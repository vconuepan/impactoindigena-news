import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing the module
const mockPrisma = vi.hoisted(() => ({
  newsletter: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  story: {
    findMany: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./llm.js', () => ({
  getLLMByTier: vi.fn(() => ({
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue({ intro: 'A warm editorial intro sentence.' }),
    })),
  })),
  rateLimitDelay: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/retry.js', () => ({
  withRetry: vi.fn((fn: () => Promise<any>) => fn()),
}))

const { generateHtmlContent, assignStories } = await import('./newsletter.js')

describe('generateHtmlContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseNewsletter = {
    id: 'nl-1',
    title: 'Week 1 — Jan 2025',
    content: '',
    html: '',
    storyIds: [],
    selectedStoryIds: [],
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  /** Helper to build markdown content for a single story */
  function storyBlock(opts: {
    issue?: string
    issueSlug?: string
    title: string
    publisher: string
    url: string
    body: string
    relevanceUrl?: string
  }) {
    const lines: string[] = []
    if (opts.issue) {
      const slug = opts.issueSlug || 'general-news'
      lines.push(`# ${opts.issue} {${slug}}`, '')
    }
    const linkParts = [opts.publisher, `[artículo original](${opts.url})`]
    if (opts.relevanceUrl) linkParts.push(`[análisis de relevancia](${opts.relevanceUrl})`)
    const links = linkParts.join(' · ')
    lines.push(
      `## ${opts.title}`,
      links,
      '',
      opts.body,
    )
    return lines.join('\n')
  }

  it('renders the intro section before stories', async () => {
    const content = [
      'Something hopeful happened in climate science.',
      '',
      '---',
      '',
      storyBlock({
        issue: 'Technology',
        issueSlug: 'science-technology',
        title: 'AI makes progress',
        publisher: 'Nature',
        url: 'https://example.com/ai',
        body: 'A major AI advancement.',
      }),
    ].join('\n')

    mockPrisma.newsletter.findUnique.mockResolvedValue({ ...baseNewsletter, content })
    const html = await generateHtmlContent('nl-1')

    const introIndex = html.indexOf('Something hopeful happened')
    const storyIndex = html.indexOf('AI makes progress')
    expect(introIndex).toBeGreaterThan(-1)
    expect(storyIndex).toBeGreaterThan(-1)
    expect(introIndex).toBeLessThan(storyIndex)
  })

  it('renders blockquote with quote and attribution', async () => {
    const content = [
      '## Quoted story',
      'Reuters · [original article](https://example.com/quoted)',
      '',
      '> "This is a significant finding for the field."',
      '> \u2014 Dr. Jane Smith, MIT',
    ].join('\n')

    mockPrisma.newsletter.findUnique.mockResolvedValue({ ...baseNewsletter, content })
    const html = await generateHtmlContent('nl-1')

    expect(html).toContain('This is a significant finding for the field.')
    expect(html).toContain('font-style: italic')
    expect(html).toContain('Dr. Jane Smith, MIT')
  })

  it('renders subtle border-bottom dividers between stories', async () => {
    const content = storyBlock({
      issue: 'Science',
      issueSlug: 'science-technology',
      title: 'Story one',
      publisher: 'BBC',
      url: 'https://example.com/one',
      body: 'First summary.',
    }) + '\n\n' + [
      '## Story two',
      'Wired · [original article](https://example.com/two)',
      '',
      'Second summary.',
    ].join('\n')

    mockPrisma.newsletter.findUnique.mockResolvedValue({ ...baseNewsletter, content })
    const html = await generateHtmlContent('nl-1')

    expect(html).toContain('Story one')
    expect(html).toContain('Story two')
    // Editorial redesign separates story cells with a subtle border-bottom divider
    expect(html).toContain('border-bottom: 1px solid #f3f4f6')
  })

  it('links story title to source URL', async () => {
    const content = storyBlock({
      title: 'Linked story title',
      publisher: 'Publisher',
      url: 'https://example.com/linked',
      body: 'Body text.',
    })

    mockPrisma.newsletter.findUnique.mockResolvedValue({ ...baseNewsletter, content })
    const html = await generateHtmlContent('nl-1')

    expect(html).toContain('<a href="https://example.com/linked" style="color: #1B3A2D; text-decoration: none;">Linked story title</a>')
  })

  it('escapes HTML entities in content', async () => {
    const content = [
      '## Story with <tags> & "quotes"',
      'Publisher & Co · [original article](https://example.com)',
      '',
      'Content with <html> & entities.',
    ].join('\n')

    mockPrisma.newsletter.findUnique.mockResolvedValue({ ...baseNewsletter, content })
    const html = await generateHtmlContent('nl-1')

    expect(html).toContain('&lt;tags&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;quotes&quot;')
  })

  it('throws if newsletter not found', async () => {
    mockPrisma.newsletter.findUnique.mockResolvedValue(null)
    await expect(generateHtmlContent('bad-id')).rejects.toThrow('Newsletter not found')
  })

  it('throws if no content', async () => {
    mockPrisma.newsletter.findUnique.mockResolvedValue({ ...baseNewsletter, content: '' })
    await expect(generateHtmlContent('nl-1')).rejects.toThrow('No content to convert')
  })

  it('handles multiple issues with separate section headers', async () => {
    const content = [
      storyBlock({
        issue: 'Climate',
        issueSlug: 'planet-climate',
        title: 'Climate story',
        publisher: 'BBC',
        url: 'https://example.com/climate',
        body: 'Climate summary.',
      }),
      '',
      '---',
      '',
      storyBlock({
        issue: 'Technology',
        issueSlug: 'science-technology',
        title: 'Tech story',
        publisher: 'Wired',
        url: 'https://example.com/tech',
        body: 'Tech summary.',
      }),
    ].join('\n')

    mockPrisma.newsletter.findUnique.mockResolvedValue({ ...baseNewsletter, content })
    const html = await generateHtmlContent('nl-1')

    // Both section headers rendered
    expect(html).toContain('Climate')
    expect(html).toContain('Technology')
    expect(html).toContain('Climate story')
    expect(html).toContain('Tech story')
  })
})

describe('assignStories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('longlists only articles recently PUBLISHED (datePublished floor), not just recently crawled', async () => {
    mockPrisma.newsletter.findUnique.mockResolvedValue({ id: 'nl-1', selectedStoryIds: [], storyIds: [] })
    mockPrisma.newsletter.findMany.mockResolvedValue([]) // no recently-sent newsletters
    mockPrisma.story.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }])
    mockPrisma.newsletter.update.mockResolvedValue({})

    await assignStories('nl-1')

    expect(mockPrisma.story.findMany).toHaveBeenCalledTimes(1)
    const where = mockPrisma.story.findMany.mock.calls[0][0].where
    // Regression: without the datePublished floor, an old article (e.g. a 2022
    // piece a feed re-surfaced) with a recent dateCrawled would land in the newsletter.
    expect(where.datePublished?.gte).toBeInstanceOf(Date)
    expect(where.dateCrawled?.gte).toBeInstanceOf(Date)
    expect(where.status).toBe('published')
  })
})
