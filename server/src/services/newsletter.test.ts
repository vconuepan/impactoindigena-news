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

// Regla 2: por defecto ninguna nota menciona a un cliente.
const mockAviso = vi.hoisted(() => ({
  lineaDeAvisoParaPublicar: vi.fn(async () => null as string | null),
  avisoParaPublicar: vi.fn(async () => null as unknown),
}))
vi.mock('./avisoClientes.js', () => mockAviso)

// El ZIP del carrusel se prueba en carousel.test.ts; acá solo qué recibe.
const mockZip = vi.hoisted(() => vi.fn(async () => '/tmp/carrusel.zip'))
vi.mock('./carousel.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./carousel.js')>()),
  generateCarouselZip: mockZip,
}))
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

const { generateHtmlContent, generateContent, generateCarouselForNewsletter, assignStories } = await import('./newsletter.js')

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

  // La foto del editor vive en el sitio. Hasta el 2-nov-2026 cada correo la pedía al
  // WordPress de impactoindigena.com (otra marca), en WebP que varios clientes no muestran.
  it('la foto del editor sale del sitio, nunca del WordPress de la marca anterior', async () => {
    mockPrisma.newsletter.findUnique.mockResolvedValue({
      ...baseNewsletter,
      content: storyBlock({ issue: 'Territorio', title: 'Una nota', publisher: 'Medio', url: 'https://example.com/n', body: 'Texto.' }),
    })
    const html = await generateHtmlContent('nl-1')

    expect(html).toContain('/images/editor-venancio.jpg')
    expect(html).not.toContain('impactoindigena.com')
    expect(html).not.toMatch(/\.webp/)
  })

  it('el archivo de la foto existe en el sitio: JPEG cuadrado y liviano', async () => {
    const { readFileSync, statSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const ruta = fileURLToPath(new URL('../../../client/public/images/editor-venancio.jpg', import.meta.url))
    const bytes = readFileSync(ruta)
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    expect(statSync(ruta).size).toBeLessThan(20_000)
    const { loadImage } = await import('@napi-rs/canvas')
    const img = await loadImage(bytes)
    expect(img.width).toBe(img.height)
  })

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

// ---------------------------------------------------------------------------
// Regla 2: el aviso de independencia en la tarjeta de la nota (director, 25-nov-2026)
// ---------------------------------------------------------------------------

describe('el aviso de independencia en el boletín', () => {
  const AVISO = 'Aviso de independencia: esta nota menciona a una organización que es cliente de impactoindigena.legal.'
  const nota = (id: string, title: string) => ({
    id, title, sourceTitle: title, sourceUrl: `https://medio.cl/${id}`, slug: id,
    summary: 'Resumen.', relevanceSummary: `Por qué importa ${id}.`, marketingBlurb: null,
    quote: null, quoteAttribution: null, emotionTag: 'calm',
    sourceDatePublished: null, dateCrawled: new Date(),
    feed: { id: 'f1', title: 'Medio', displayTitle: 'Medio', issue: null },
    issue: { name: 'Territorio', slug: 'territorio', parentId: null, parent: null },
  })
  const newsletter = {
    id: 'nl-1', title: 'Semana', content: '', html: '', storyIds: [], selectedStoryIds: ['a', 'b'],
    status: 'draft', createdAt: new Date(), updatedAt: new Date(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAviso.lineaDeAvisoParaPublicar.mockImplementation(async (id: string) => (id === 'a' ? AVISO : null))
    mockPrisma.newsletter.update.mockImplementation(async ({ data }: any) => ({ ...newsletter, ...data }))
  })

  it('al generar: la línea va bajo el texto de la nota que lo requiere, y solo en esa', async () => {
    mockPrisma.newsletter.findUnique.mockResolvedValue(newsletter)
    mockPrisma.story.findMany.mockResolvedValue([nota('a', 'Alfa'), nota('b', 'Beta')])

    const { content } = await generateContent('nl-1')

    expect(content).toContain(`Por qué importa a.\n\n${AVISO}`)
    expect(content.split(AVISO)).toHaveLength(2)
    const beta = content.slice(content.indexOf('## Beta'))
    expect(beta).not.toContain('Aviso de independencia')
  })

  it('si el aviso no se puede calcular, la edición no se genera', async () => {
    mockAviso.lineaDeAvisoParaPublicar.mockRejectedValue(new Error('db down'))
    mockPrisma.newsletter.findUnique.mockResolvedValue(newsletter)
    mockPrisma.story.findMany.mockResolvedValue([nota('a', 'Alfa')])

    await expect(generateContent('nl-1')).rejects.toThrow('db down')
    expect(mockPrisma.newsletter.update).not.toHaveBeenCalled()
  })

  it('en el correo: párrafo propio con el enlace a las reglas, fuera del recuadro «¿Por qué es importante?»', async () => {
    const content = [
      '# Territorio {territorio}', '',
      '## Alfa', 'Medio · [artículo original](https://medio.cl/a)', '',
      'Por qué importa a.', '',
      AVISO, '',
      '## Beta', 'Medio · [artículo original](https://medio.cl/b)', '',
      'Por qué importa b.',
    ].join('\n')
    mockPrisma.newsletter.findUnique.mockResolvedValue({ ...newsletter, content })

    const html = await generateHtmlContent('nl-1')

    expect(html.split('Aviso de independencia:')).toHaveLength(2)
    expect(html).toContain('esta nota menciona a una organización que es cliente de impactoindigena.legal.')
    expect(html).toContain('href="https://impactoindigena.news/about#independencia"')
    // El texto de la nota queda en su recuadro; el aviso, después y fuera de él.
    const recuadro = html.indexOf('Por qu&eacute; es importante')
    const finRecuadro = html.indexOf('</table>', recuadro)
    expect(html.indexOf('Aviso de independencia:')).toBeGreaterThan(finRecuadro)
    // Y queda en la tarjeta de Alfa, antes de la de Beta (el índice rápido de arriba también la nombra).
    expect(html.indexOf('Aviso de independencia:')).toBeLessThan(html.lastIndexOf('Beta'))
  })

  it('en el correo sin aviso: ninguna tarjeta lo lleva', async () => {
    const content = ['# Territorio {territorio}', '', '## Alfa', 'Medio · [artículo original](https://medio.cl/a)', '', 'Por qué importa a.'].join('\n')
    mockPrisma.newsletter.findUnique.mockResolvedValue({ ...newsletter, content })

    const html = await generateHtmlContent('nl-1')

    expect(html).not.toContain('Aviso de independencia')
  })
})

describe('el aviso de independencia en el carrusel del boletín', () => {
  const nota = (id: string) => ({
    id, title: `Nota ${id}`, sourceTitle: `Nota ${id}`, sourceUrl: `https://medio.cl/${id}`, summary: 'Resumen.',
    sourceDatePublished: null, feed: { title: 'Medio', displayTitle: 'Medio', issue: null }, issue: { name: 'Territorio' },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.newsletter.findUnique.mockResolvedValue({ id: 'nl-1', selectedStoryIds: ['a', 'b'] })
    mockPrisma.story.findMany.mockResolvedValue([nota('a'), nota('b')])
  })

  it('cada imagen lleva el aviso de su nota, y solo la que lo requiere', async () => {
    mockAviso.avisoParaPublicar.mockImplementation(async (id: string) =>
      id === 'a' ? { verticals: ['legal'], current: true, plural: false } : null)

    await generateCarouselForNewsletter('nl-1')

    const enviadas = mockZip.mock.calls[0][0] as Array<{ title: string; avisoIndependencia: string | null }>
    expect(enviadas.find((n) => n.title === 'Nota a')!.avisoIndependencia)
      .toBe('Esta nota menciona a una organización que es cliente de impactoindigena.legal.')
    expect(enviadas.find((n) => n.title === 'Nota b')!.avisoIndependencia).toBeNull()
  })

  it('sin aviso, ninguna imagen lo lleva', async () => {
    mockAviso.avisoParaPublicar.mockResolvedValue(null)

    await generateCarouselForNewsletter('nl-1')

    const enviadas = mockZip.mock.calls[0][0] as Array<{ avisoIndependencia: string | null }>
    expect(enviadas.every((n) => n.avisoIndependencia === null)).toBe(true)
  })

  it('si el aviso no se puede calcular, el carrusel no se arma', async () => {
    mockAviso.avisoParaPublicar.mockRejectedValue(new Error('db down'))

    await expect(generateCarouselForNewsletter('nl-1')).rejects.toThrow('db down')
    expect(mockZip).not.toHaveBeenCalled()
  })
})
