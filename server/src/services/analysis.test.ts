import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sampleStory, sampleFeed, sampleIssue } from '../test/helpers.js'

const mockPrisma = vi.hoisted(() => ({
  story: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  issue: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn((args: any) => Array.isArray(args) ? Promise.all(args) : args(mockPrisma)),
}))

const mockGetSmallLLM = vi.hoisted(() => vi.fn())
const mockGetMediumLLM = vi.hoisted(() => vi.fn())
const mockGetLargeLLM = vi.hoisted(() => vi.fn())
const mockRateLimitDelay = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockGenerateEmbeddingForContent = vi.hoisted(() => vi.fn())
const mockSaveEmbeddingTx = vi.hoisted(() => vi.fn())
const mockDetectAndCluster = vi.hoisted(() => vi.fn())
const logSpy = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../lib/logger.js', () => ({ createLogger: () => logSpy }))
vi.mock('./llm.js', () => ({
  getSmallLLM: mockGetSmallLLM,
  getMediumLLM: mockGetMediumLLM,
  getLargeLLM: mockGetLargeLLM,
  getLLMByTier: vi.fn((tier: string) => {
    switch (tier) {
      case 'small': return mockGetSmallLLM()
      case 'medium': return mockGetMediumLLM()
      case 'large': return mockGetLargeLLM()
    }
  }),
  rateLimitDelay: mockRateLimitDelay,
}))
vi.mock('./embedding.js', () => ({
  generateEmbeddingForContent: mockGenerateEmbeddingForContent,
}))
vi.mock('../lib/vectors.js', () => ({
  saveEmbeddingTx: mockSaveEmbeddingTx,
}))
vi.mock('./dedup.js', () => ({
  detectAndCluster: mockDetectAndCluster,
}))

const { preAssessStories, reclassifyStories, assessStory, selectStories, rescoreStory } = await import('./analysis.js')

function storyWithRelations(overrides: Record<string, any> = {}) {
  return {
    ...sampleStory(overrides),
    feed: {
      ...sampleFeed(),
      issue: sampleIssue(),
    },
  }
}

describe('preAssessStories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls medium LLM with structured output, assigns issues, and updates stories', async () => {
    const issue = sampleIssue()
    const story1 = storyWithRelations({ id: 'story-1' })
    const story2 = storyWithRelations({ id: 'story-2' })
    mockPrisma.story.findMany.mockResolvedValue([story1, story2])
    mockPrisma.story.update.mockResolvedValue({})
    mockPrisma.issue.findMany.mockResolvedValue([issue])

    const mockStructuredLlm = {
      invoke: vi.fn().mockResolvedValue({
        articles: [
          { articleId: 'story-1', issueSlug: 'ai-technology', rating: 4, emotionTag: 'calm' },
          { articleId: 'story-2', issueSlug: 'ai-technology', rating: 2, emotionTag: 'calm' },
        ],
      }),
    }
    mockGetMediumLLM.mockReturnValue({
      withStructuredOutput: () => mockStructuredLlm,
    })

    const results = await preAssessStories(['story-1', 'story-2'])

    expect(mockGetMediumLLM).toHaveBeenCalled()
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ storyId: 'story-1', rating: 4, emotionTag: 'calm' })
    expect(results[1]).toEqual({ storyId: 'story-2', rating: 2, emotionTag: 'calm' })

    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'story-1' },
      data: { issueId: issue.id, relevancePre: 4, emotionTag: 'calm', countryFocus: null, status: 'pre_analyzed' },
    })
    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'story-2' },
      data: { issueId: issue.id, relevancePre: 2, emotionTag: 'calm', countryFocus: null, status: 'pre_analyzed' },
    })
  })

  it('al prompt solo llegan las categorias madre de asunto', async () => {
    // Dos filtros sobre la misma lista, y los dos importan:
    //  - las secciones geograficas se llenan por pais, no por asunto;
    //  - las subcategorias son un segundo nivel, y ofrecerlas aqui pondria
    //    veintiseis opciones donde el prompt razona sobre ocho.
    const madre = sampleIssue({ id: 'i-madre', slug: 'territorio-y-tierras', parentId: null })
    const hija = sampleIssue({ id: 'i-hija', slug: 'territorio-titulacion', parentId: 'i-madre' })
    const geografica = sampleIssue({ id: 'i-geo', slug: 'chile-indigena', parentId: null })
    mockPrisma.issue.findMany.mockResolvedValue([madre, hija, geografica])
    mockPrisma.story.findMany.mockResolvedValue([storyWithRelations({ id: 'story-1' })])
    mockPrisma.story.update.mockResolvedValue({})

    const mockStructuredLlm = {
      invoke: vi.fn().mockResolvedValue({
        articles: [{ articleId: 'story-1', issueSlug: 'territorio-y-tierras', rating: 4, emotionTag: 'calm' }],
      }),
    }
    mockGetMediumLLM.mockReturnValue({ withStructuredOutput: () => mockStructuredLlm })

    await preAssessStories(['story-1'])

    // El prompt viaja como HumanMessage, no como string suelto.
    const arg: any = mockStructuredLlm.invoke.mock.calls[0][0]
    const prompt = JSON.stringify(arg?.content ?? arg)
    expect(prompt).toContain('territorio-y-tierras')
    expect(prompt).not.toContain('territorio-titulacion')
    expect(prompt).not.toContain('chile-indigena')
  })

  it('falls back to feed issueId for invalid slugs', async () => {
    const issues = [
      sampleIssue({ id: 'issue-1', slug: 'ai-technology', name: 'AI', description: 'AI topics' }),
    ]
    mockPrisma.issue.findMany.mockResolvedValue(issues)

    const story = storyWithRelations({ id: 'story-1' })
    mockPrisma.story.findMany.mockResolvedValue([story])
    mockPrisma.story.update.mockResolvedValue({})

    const mockStructuredLlm = {
      invoke: vi.fn().mockResolvedValue({
        articles: [
          { articleId: 'story-1', issueSlug: 'nonexistent-slug', rating: 5, emotionTag: 'calm' },
        ],
      }),
    }
    mockGetMediumLLM.mockReturnValue({
      withStructuredOutput: () => mockStructuredLlm,
    })

    const results = await preAssessStories(['story-1'])

    expect(results).toHaveLength(1)
    // Falls back to feed's issueId
    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'story-1' },
      data: { issueId: story.feed.issue.id, relevancePre: 5, emotionTag: 'calm', countryFocus: null, status: 'pre_analyzed' },
    })
  })

  it('un lote completo de 10 llega entero al modelo y pasan los 10', async () => {
    // Hasta el 12-oct-2026 el decimo articulo de cada lote no entraba al
    // prompt (ver formatArticlesBlock); el modelo no podia devolverlo y el
    // job lo contaba como fallido. El modelo simulado responde solo por los
    // articulos que de verdad vio, como el real.
    const issue = sampleIssue()
    mockPrisma.issue.findMany.mockResolvedValue([issue])
    const ids = Array.from({ length: 10 }, (_, i) => `story-${i + 1}`)
    mockPrisma.story.findMany.mockResolvedValue(ids.map(id => storyWithRelations({ id })))
    mockPrisma.story.update.mockResolvedValue({})

    const mockStructuredLlm = {
      invoke: vi.fn().mockImplementation(async (messages: any[]) => {
        const prompt = String(messages[0].content)
        const seen = [...prompt.matchAll(/Article ID: (\S+)/g)].map(m => m[1])
        return {
          articles: seen.map(articleId => ({ articleId, issueSlug: issue.slug, rating: 3, emotionTag: 'calm', narrativeFrame: null })),
        }
      }),
    }
    mockGetMediumLLM.mockReturnValue({ withStructuredOutput: () => mockStructuredLlm })
    const onProgress = vi.fn()

    const results = await preAssessStories(ids, onProgress)

    expect(mockStructuredLlm.invoke).toHaveBeenCalledTimes(1)
    expect(results.map(r => r.storyId).sort()).toEqual([...ids].sort())
    expect(onProgress).toHaveBeenCalledWith({ type: 'completed', count: 10 })
    expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'failed' }))
  })
})

describe('preAssessStories — lote que la API rechaza con 400', () => {
  // El 12 y 13-oct-2026 una sola historia hundia su lote de 10 en cada pase:
  // Azure rechazaba el cuerpo entero con «400 Invalid body» y el log no decia
  // cual era. Un 400 es del contenido, no pasajero: se reintenta historia por
  // historia para que pasen las demas, y el log nombra a la que falla.
  const issue = sampleIssue()
  const ids = ['story-a', 'story-veneno', 'story-c']
  const badRequest = () => Object.assign(new Error('400 Invalid body: failed to parse JSON value'), { status: 400 })
  const sum = (fn: ReturnType<typeof vi.fn>, type: string) =>
    fn.mock.calls.filter(([e]) => e.type === type).reduce((n, [e]) => n + e.count, 0)

  // Modelo simulado: responde por los articulos que vio, salvo que el prompt
  // traiga al veneno; ahi lanza el error que se le pase.
  function modeloQueFallaCon(error: () => Error) {
    const structured = {
      invoke: vi.fn().mockImplementation(async (messages: any[]) => {
        const prompt = String(messages[0].content)
        if (prompt.includes('Article ID: story-veneno')) throw error()
        const seen = [...prompt.matchAll(/Article ID: (\S+)/g)].map(m => m[1])
        return { articles: seen.map(articleId => ({ articleId, issueSlug: issue.slug, rating: 3, emotionTag: 'calm', narrativeFrame: null })) }
      }),
    }
    mockGetMediumLLM.mockReturnValue({ withStructuredOutput: () => structured })
    return structured
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.issue.findMany.mockResolvedValue([issue])
    mockPrisma.story.findMany.mockImplementation(async ({ where }: any) =>
      where.id.in.map((id: string) => storyWithRelations({ id })))
    mockPrisma.story.update.mockResolvedValue({})
  })

  it('parte el lote: pasan las demas y el log nombra a la historia que falla', async () => {
    const llm = modeloQueFallaCon(badRequest)
    const onProgress = vi.fn()

    const results = await preAssessStories(ids, onProgress)

    expect(results.map(r => r.storyId).sort()).toEqual(['story-a', 'story-c'])
    expect(llm.invoke).toHaveBeenCalledTimes(1 + ids.length)
    expect(sum(onProgress, 'completed')).toBe(2)
    expect(sum(onProgress, 'failed')).toBe(1)
    expect(logSpy.warn).toHaveBeenCalledWith(expect.objectContaining({ storyIds: ids }), expect.any(String))
    expect(logSpy.error).toHaveBeenCalledWith(expect.objectContaining({ storyId: 'story-veneno' }), expect.any(String))
  })

  it('un error que no es 400 no parte el lote, y el log trae los ids del lote', async () => {
    // 401: otro 4xx, que withRetry tampoco reintenta. Partir el lote ante
    // cualquier 4xx multiplicaria llamadas que van a fallar igual.
    const llm = modeloQueFallaCon(() => Object.assign(new Error('401 Unauthorized'), { status: 401 }))

    const results = await preAssessStories(ids)

    expect(results).toEqual([])
    expect(llm.invoke).toHaveBeenCalledTimes(1)
    expect(logSpy.error).toHaveBeenCalledWith(expect.objectContaining({ storyIds: ids }), 'batch failed')
  })

  it('un 400 en un lote de una sola historia no se vuelve a intentar', async () => {
    const llm = modeloQueFallaCon(badRequest)

    const results = await preAssessStories(['story-veneno'])

    expect(results).toEqual([])
    expect(llm.invoke).toHaveBeenCalledTimes(1)
    expect(logSpy.error).toHaveBeenCalledWith(expect.objectContaining({ storyIds: ['story-veneno'] }), 'batch failed')
  })
})

describe('reclassifyStories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls small LLM and updates only issueId and emotionTag (not rating or status)', async () => {
    const issue = sampleIssue()
    const story = storyWithRelations({ id: 'story-1', relevancePre: 7, status: 'analyzed' })
    mockPrisma.story.findMany.mockResolvedValue([story])
    mockPrisma.story.update.mockResolvedValue({})
    mockPrisma.issue.findMany.mockResolvedValue([issue])

    const mockStructuredLlm = {
      invoke: vi.fn().mockResolvedValue({
        articles: [
          { articleId: 'story-1', issueSlug: 'ai-technology', emotionTag: 'uplifting' },
        ],
      }),
    }
    mockGetSmallLLM.mockReturnValue({
      withStructuredOutput: () => mockStructuredLlm,
    })

    const results = await reclassifyStories(['story-1'])

    expect(mockGetSmallLLM).toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ storyId: 'story-1', emotionTag: 'uplifting' })

    // Should update issueId and emotionTag only — no relevancePre, no status
    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'story-1' },
      data: { issueId: issue.id, emotionTag: 'uplifting' },
    })
  })

  it('falls back to feed issueId for invalid slugs', async () => {
    const issues = [
      sampleIssue({ id: 'issue-1', slug: 'ai-technology', name: 'AI', description: 'AI topics' }),
    ]
    mockPrisma.issue.findMany.mockResolvedValue(issues)

    const story = storyWithRelations({ id: 'story-1' })
    mockPrisma.story.findMany.mockResolvedValue([story])
    mockPrisma.story.update.mockResolvedValue({})

    const mockStructuredLlm = {
      invoke: vi.fn().mockResolvedValue({
        articles: [
          { articleId: 'story-1', issueSlug: 'nonexistent-slug', emotionTag: 'calm' },
        ],
      }),
    }
    mockGetSmallLLM.mockReturnValue({
      withStructuredOutput: () => mockStructuredLlm,
    })

    await reclassifyStories(['story-1'])

    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'story-1' },
      data: { issueId: story.feed.issue.id, emotionTag: 'calm' },
    })
  })
})

describe('assessStory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDetectAndCluster.mockResolvedValue({ clusterId: null, newCluster: false, memberCount: 0, rejectedIds: [] })
  })

  it('generates embedding before saving analysis and embedding atomically', async () => {
    const story = storyWithRelations({ id: 'story-1' })
    mockPrisma.story.findUnique.mockResolvedValue(story)
    mockPrisma.story.update.mockResolvedValue({})
    mockGenerateEmbeddingForContent.mockResolvedValue({ embedding: [0.1, 0.2], hash: 'abc123' })
    mockSaveEmbeddingTx.mockResolvedValue(undefined)

    const structuredResponse = {
      publicationDate: '2024-01-15 00:00:00',
      quote: '"Test quote" said Expert',
      quoteAttribution: 'Dr. Smith, University of Oxford',
      summary: 'Test summary with key information.',
      factors: ['Factor one: Detailed explanation.', 'Factor two: Detailed explanation.'],
      limitingFactors: ['Limiting factor: Explanation of limitation.'],
      relevanceCalculation: ['Key factor: 5', 'Limitation: -2'],
      relevanceRating: 3,
      relevanceSummary: 'Test relevance summary explaining the rating.',
      titleLabel: 'Test topic',
      relevanceTitle: 'Test title: subtitle here',
      marketingBlurb: 'Publisher reports on test topic with assessment.',
    }

    const mockStructuredLlm = {
      invoke: vi.fn().mockResolvedValue(structuredResponse),
    }
    mockGetMediumLLM.mockReturnValue({
      withStructuredOutput: () => mockStructuredLlm,
    })

    await assessStory('story-1')

    // Embedding generated from analysis results
    expect(mockGenerateEmbeddingForContent).toHaveBeenCalledWith({
      title: 'Test title: subtitle here',
      titleLabel: 'Test topic',
      summary: 'Test summary with key information.',
      embeddingContentHash: null,
    })

    // Transaction saves analysis + embedding atomically
    expect(mockPrisma.$transaction).toHaveBeenCalled()
    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'story-1' },
      data: expect.objectContaining({
        titleLabel: 'Test topic',
        summary: 'Test summary with key information.',
        status: 'analyzed',
      }),
    })
    expect(mockSaveEmbeddingTx).toHaveBeenCalledWith(
      mockPrisma, 'story-1', [0.1, 0.2], 'abc123',
    )
  })

  it('normaliza siglas y toponimos antes de guardar el titulo', async () => {
    // Regresion medida en produccion el 14-ago: con la regla del esquema ya
    // reforzada y desplegada, 3 de 25 historias rastreadas DESPUES del deploy
    // seguian saliendo con "en chile" / "universidad de chile". El `.describe()`
    // es una restriccion blanda; el guardarrail duro va en el codigo.
    const story = storyWithRelations({ id: 'story-1' })
    mockPrisma.story.findUnique.mockResolvedValue(story)
    mockPrisma.story.update.mockResolvedValue({})
    mockGenerateEmbeddingForContent.mockResolvedValue({ embedding: [0.1], hash: 'h' })
    mockSaveEmbeddingTx.mockResolvedValue(undefined)

    mockGetMediumLLM.mockReturnValue({
      withStructuredOutput: () => ({
        invoke: vi.fn().mockResolvedValue({
          publicationDate: '2024-01-15 00:00:00',
          quote: '"Q" said X',
          quoteAttribution: 'X',
          summary: 'S',
          factors: ['f'],
          limitingFactors: ['l'],
          relevanceCalculation: ['c'],
          relevanceRating: 5,
          relevanceSummary: 'r',
          titleLabel: 'derechos en chile',
          relevanceTitle: 'conadi y corfo financian proyectos en chile',
          marketingBlurb: 'b',
        }),
      }),
    })

    await assessStory('story-1')

    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'story-1' },
      data: expect.objectContaining({
        title: 'CONADI y CORFO financian proyectos en Chile',
        titleLabel: 'derechos en Chile',
      }),
    })
  })

  it('quita el año imposible del resumen y no acepta una fecha de publicacion futura', async () => {
    // Caso real del 25-oct-2026: la bajada de la fuente decia «23 de octubre
    // de 2027» en una nota del 23-oct-2026. El modelo fecho el hecho en 2027
    // y devolvio esa fecha como fecha de publicacion, que pisaba la del feed.
    const story = storyWithRelations({ id: 'story-1', sourceDatePublished: new Date('2026-10-23T00:00:00Z') })
    mockPrisma.story.findUnique.mockResolvedValue(story)
    mockPrisma.story.update.mockResolvedValue({})
    mockGenerateEmbeddingForContent.mockResolvedValue({ embedding: [0.1], hash: 'h' })
    mockSaveEmbeddingTx.mockResolvedValue(undefined)

    mockGetMediumLLM.mockReturnValue({
      withStructuredOutput: () => ({
        invoke: vi.fn().mockResolvedValue({
          publicationDate: '2027-10-23 00:00:00',
          quote: 'Q',
          quoteAttribution: 'X',
          summary: 'En 2027, la Cámara de Diputados aprobó un proyecto de ley que facilita desalojos exprés.',
          factors: ['f'],
          limitingFactors: ['l'],
          relevanceCalculation: ['c'],
          relevanceRating: 7,
          relevanceSummary: 'En 2027, Argentina aprobó una ley que facilita desalojos exprés a indígenas.',
          titleLabel: 'desalojos',
          relevanceTitle: 'Argentina aprobó ley que facilita desalojos exprés a indígenas',
          marketingBlurb: 'b',
        }),
      }),
    })

    await assessStory('story-1')

    const { data } = mockPrisma.story.update.mock.calls[0][0]
    expect(data.summary).toBe('La Cámara de Diputados aprobó un proyecto de ley que facilita desalojos exprés.')
    expect(data.relevanceSummary).toBe('Argentina aprobó una ley que facilita desalojos exprés a indígenas.')
    expect(data.title).toBe('Argentina aprobó ley que facilita desalojos exprés a indígenas')
    expect(data).not.toHaveProperty('sourceDatePublished')
  })

  it('deja un año futuro legitimo y acepta una fecha de publicacion plausible', async () => {
    const story = storyWithRelations({ id: 'story-1', sourceDatePublished: null })
    mockPrisma.story.findUnique.mockResolvedValue(story)
    mockPrisma.story.update.mockResolvedValue({})
    mockGenerateEmbeddingForContent.mockResolvedValue({ embedding: [0.1], hash: 'h' })
    mockSaveEmbeddingTx.mockResolvedValue(undefined)

    mockGetMediumLLM.mockReturnValue({
      withStructuredOutput: () => ({
        invoke: vi.fn().mockResolvedValue({
          publicationDate: '2026-10-23 00:00:00',
          quote: 'Q',
          quoteAttribution: 'X',
          summary: 'Chile participará en el Foro Mundial de Negocios Indígenas y será sede de su versión 2027 en Santiago.',
          factors: ['f'],
          limitingFactors: ['l'],
          relevanceCalculation: ['c'],
          relevanceRating: 6,
          relevanceSummary: 'En 2027, se realizará el Foro Mundial de Negocios Indígenas en Santiago.',
          titleLabel: 'economía indígena',
          relevanceTitle: 'Chile será sede del Foro Mundial de Negocios Indígenas 2027',
          marketingBlurb: 'b',
        }),
      }),
    })

    await assessStory('story-1')

    const { data } = mockPrisma.story.update.mock.calls[0][0]
    expect(data.summary).toBe('Chile participará en el Foro Mundial de Negocios Indígenas y será sede de su versión 2027 en Santiago.')
    expect(data.relevanceSummary).toBe('En 2027, se realizará el Foro Mundial de Negocios Indígenas en Santiago.')
    expect(data.title).toBe('Chile será sede del Foro Mundial de Negocios Indígenas 2027')
    expect(data.sourceDatePublished).toBeInstanceOf(Date)
    expect(data.sourceDatePublished.getFullYear()).toBe(2026)
  })

  it('throws when story not found', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(null)
    await expect(assessStory('nonexistent')).rejects.toThrow('Story not found')
  })

  it('fails closed when structured-output parsing fails — writes nothing', async () => {
    // Simulates a prompt-injection-induced malformed function call: the schema
    // parser rejects the response. The story must be skipped without any partial
    // write (no embedding, no transaction, no update). See story c9dfe0c8.
    const story = storyWithRelations({ id: 'story-1' })
    mockPrisma.story.findUnique.mockResolvedValue(story)
    const mockStructuredLlm = {
      invoke: vi.fn().mockRejectedValue(new Error('Failed to parse structured output')),
    }
    mockGetMediumLLM.mockReturnValue({ withStructuredOutput: () => mockStructuredLlm })

    await expect(assessStory('story-1')).rejects.toThrow(/LLM call failed/)

    expect(mockGenerateEmbeddingForContent).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })

  it('throws and does not save when embedding generation fails', async () => {
    const story = storyWithRelations({ id: 'story-1' })
    mockPrisma.story.findUnique.mockResolvedValue(story)
    mockGenerateEmbeddingForContent.mockRejectedValue(new Error('OpenAI API error'))

    const mockStructuredLlm = {
      invoke: vi.fn().mockResolvedValue({
        publicationDate: '',
        quote: '',
        quoteAttribution: '',
        summary: 'Summary',
        factors: ['Factor'],
        limitingFactors: [],
        relevanceCalculation: ['calc'],
        relevanceRating: 5,
        relevanceSummary: 'Relevance summary',
        titleLabel: 'Topic',
        relevanceTitle: 'Title',
        marketingBlurb: 'Blurb',
      }),
    }
    mockGetMediumLLM.mockReturnValue({
      withStructuredOutput: () => mockStructuredLlm,
    })

    await expect(assessStory('story-1')).rejects.toThrow('OpenAI API error')

    // Transaction should not have been called
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })

  it('runs dedup after successful assessment', async () => {
    const story = storyWithRelations({ id: 'story-1' })
    mockPrisma.story.findUnique.mockResolvedValue(story)
    mockPrisma.story.update.mockResolvedValue({})
    mockGenerateEmbeddingForContent.mockResolvedValue({ embedding: [0.1], hash: 'h1' })
    mockSaveEmbeddingTx.mockResolvedValue(undefined)
    mockDetectAndCluster.mockResolvedValue({ clusterId: 'c1', newCluster: true, memberCount: 2, rejectedIds: [] })

    const mockStructuredLlm = {
      invoke: vi.fn().mockResolvedValue({
        publicationDate: '',
        quote: '',
        quoteAttribution: '',
        summary: 'Summary',
        factors: ['Factor'],
        limitingFactors: [],
        relevanceCalculation: ['calc'],
        relevanceRating: 5,
        relevanceSummary: 'Rel',
        titleLabel: 'Topic',
        relevanceTitle: 'Title',
        marketingBlurb: 'Blurb',
      }),
    }
    mockGetMediumLLM.mockReturnValue({
      withStructuredOutput: () => mockStructuredLlm,
    })

    await assessStory('story-1')

    // Wait for fire-and-forget dedup to settle
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockDetectAndCluster).toHaveBeenCalledWith('story-1')
  })
})

describe('selectStories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls LLM and updates selected/rejected statuses', async () => {
    const stories = [
      sampleStory({ id: 'story-1', summary: 'Summary 1', status: 'analyzed' }),
      sampleStory({ id: 'story-2', summary: 'Summary 2', status: 'analyzed' }),
      sampleStory({ id: 'story-3', summary: 'Summary 3', status: 'analyzed' }),
      sampleStory({ id: 'story-4', summary: 'Summary 4', status: 'analyzed' }),
    ]
    mockPrisma.story.findMany.mockResolvedValue(stories)
    mockPrisma.story.updateMany.mockResolvedValue({ count: 2 })

    const mockStructuredLlm = {
      invoke: vi.fn().mockResolvedValue({
        selectedIds: ['story-1', 'story-3'],
      }),
    }
    mockGetLargeLLM.mockReturnValue({
      withStructuredOutput: () => mockStructuredLlm,
    })

    const result = await selectStories(['story-1', 'story-2', 'story-3', 'story-4'])

    expect(result.selected).toEqual(['story-1', 'story-3'])
    expect(result.rejected).toEqual(['story-2', 'story-4'])

    expect(mockPrisma.story.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['story-1', 'story-3'] } },
      data: { status: 'selected' },
    })
    expect(mockPrisma.story.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['story-2', 'story-4'] } },
      data: { status: 'rejected' },
    })
  })

  it('returns empty arrays when no stories found', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])
    const result = await selectStories(['nonexistent'])
    expect(result).toEqual({ selected: [], rejected: [] })
  })
})

describe('rescoreStory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockRescoreLlm(extra: Record<string, unknown> = {}) {
    const mockStructuredLlm = {
      invoke: vi.fn().mockResolvedValue({
        relevanceRating: 8,
        relevanceCalculation: ['- **Factor:** 8'],
        factors: ['- **Factor clave:** alto impacto'],
        limitingFactors: ['- **Límite:** menor'],
        relevanceSummary: 'Resumen recalibrado',
        // copy fields present in the assess output but must be IGNORED by rescore
        relevanceTitle: 'TÍTULO NUEVO que no debe escribirse',
        summary: 'RESUMEN NUEVO que no debe escribirse',
        ...extra,
      }),
    }
    mockGetMediumLLM.mockReturnValue({ withStructuredOutput: () => mockStructuredLlm })
  }

  it('updates only the relevance fields, preserving status and copy', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(
      storyWithRelations({ id: 'story-1', relevance: 5, status: 'published', title: 'Título original' })
    )
    mockPrisma.story.update.mockResolvedValue({})
    mockRescoreLlm()

    const res = await rescoreStory('story-1')

    expect(res).toEqual({ storyId: 'story-1', oldRelevance: 5, newRelevance: 8 })
    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'story-1' },
      data: {
        relevance: 8,
        relevanceCalculation: '- **Factor:** 8',
        relevanceReasons: '- **Factor clave:** alto impacto',
        antifactors: '- **Límite:** menor',
        relevanceSummary: 'Resumen recalibrado',
      },
    })
    const updateData = mockPrisma.story.update.mock.calls[0][0].data
    expect(updateData).not.toHaveProperty('status')
    expect(updateData).not.toHaveProperty('title')
    expect(updateData).not.toHaveProperty('summary')
  })

  it('writes nothing in dry-run mode', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(storyWithRelations({ id: 'story-2', relevance: 6 }))
    mockRescoreLlm({ relevanceRating: 9 })

    const res = await rescoreStory('story-2', { dryRun: true })

    expect(res.newRelevance).toBe(9)
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })

  it('fails closed when structured-output parsing fails — writes nothing', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(storyWithRelations({ id: 'story-3', relevance: 5 }))
    const mockStructuredLlm = {
      invoke: vi.fn().mockRejectedValue(new Error('Failed to parse structured output')),
    }
    mockGetMediumLLM.mockReturnValue({ withStructuredOutput: () => mockStructuredLlm })

    await expect(rescoreStory('story-3')).rejects.toThrow(/parse/)
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })
})
