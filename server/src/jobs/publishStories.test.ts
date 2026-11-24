import { describe, it, expect, vi, beforeEach } from 'vitest'

// ──── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  story: { findMany: vi.fn(), update: vi.fn() },
  storyImage: { findMany: vi.fn(), update: vi.fn() },
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const mockGenerateImage = vi.hoisted(() => vi.fn())
vi.mock('../lib/imageGen.js', () => ({ generateStoryImage: mockGenerateImage }))

const mockFetchOg = vi.hoisted(() => vi.fn())
vi.mock('../lib/extract-og-image.js', () => ({ fetchOgImage: mockFetchOg }))

const mockRehost = vi.hoisted(() => vi.fn())
vi.mock('../lib/storyCard.js', () => ({ rehostOrComposeStoryImage: mockRehost }))

const mockRehostFoto = vi.hoisted(() => vi.fn())
vi.mock('../lib/imageStorage.js', () => ({ rehostArticlePhoto: mockRehostFoto }))

// La guardia SSRF: el respaldo en crudo solo se guarda si la URL todavia la pasa.
const mockAssertUrl = vi.hoisted(() => vi.fn())
vi.mock('../utils/urlValidation.js', () => ({ assertUrlAllowed: mockAssertUrl }))

const mockConfig = vi.hoisted(() => ({
  r2: { publicUrl: 'https://cdn.r2.example' },
  imageGen: { heroAiMinRelevance: 8, heroAiFallback: true },
  translation: { catchUpDays: 3, catchUpLimit: 10 },
}))
vi.mock('../config.js', () => ({ config: mockConfig }))

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

// story.js / translation.js: generateHeroImages no los usa; runPublishStories sí.
const mockStory = vi.hoisted(() => ({ getStoryIdsByStatus: vi.fn(), bulkUpdateStatus: vi.fn() }))
vi.mock('../services/story.js', () => mockStory)
const mockTranslation = vi.hoisted(() => ({ translateStoriesBatch: vi.fn(), translateRecentUntranslated: vi.fn() }))
vi.mock('../services/translation.js', () => mockTranslation)
const mockSnapshot = vi.hoisted(() => vi.fn())
vi.mock('../lib/homepage-snapshot.js', () => ({ publishHomepageSnapshot: mockSnapshot }))
vi.mock('../services/storyBody.js', () => ({ draftStoryBodies: vi.fn().mockResolvedValue({ saved: 0, blocked: 0, skipped: 0, failed: 0 }) }))

const { generateHeroImages, rehostStoryPhotos, runPublishStories } = await import('./publishStories.js')

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
    mockConfig.imageGen.heroAiFallback = true
  })

  // AZURE_IMAGE_HERO_AI_FALLBACK=off: con el umbral en 99 seguían saliendo imágenes
  // IA por esta vía. Apagado, la noticia sin og:image queda sin imagen propia.
  it('with the AI fallback off, a non-featured story with no og:image gets no AI hero', async () => {
    mockConfig.imageGen.heroAiFallback = false
    mockPrisma.story.findMany.mockResolvedValue([story({ relevance: 4 })])
    mockFetchOg.mockResolvedValue(null)
    await generateHeroImages(['id'])
    expect(mockFetchOg).toHaveBeenCalledTimes(1)
    expect(mockGenerateImage).not.toHaveBeenCalled()
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })

  it('with the AI fallback off, an og:image rejected by the SSRF guard does not trigger AI either', async () => {
    mockConfig.imageGen.heroAiFallback = false
    mockPrisma.story.findMany.mockResolvedValue([story({ relevance: 5 })])
    mockFetchOg.mockResolvedValue('http://169.254.169.254/latest/meta-data')
    mockRehost.mockResolvedValue(null)
    mockAssertUrl.mockRejectedValue(new Error('Blocked disallowed URL'))
    await generateHeroImages(['id'])
    expect(mockGenerateImage).not.toHaveBeenCalled()
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })

  it('with the AI fallback off, a non-featured story with og:image still gets it rehosted', async () => {
    mockConfig.imageGen.heroAiFallback = false
    mockPrisma.story.findMany.mockResolvedValue([story({ relevance: 6 })])
    await generateHeroImages(['id'])
    expect(mockGenerateImage).not.toHaveBeenCalled()
    expect(mockPrisma.story.update).toHaveBeenCalledWith({
      where: { id: 'id' }, data: { imageUrl: 'https://cdn.r2.example/oghero-id.jpg' },
    })
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

describe('rehostStoryPhotos — las fotos del cuerpo del artículo, al publicar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.storyImage.update.mockResolvedValue({})
  })

  it('rehospeda cada foto sin copia y guarda su URL en la fila', async () => {
    mockPrisma.storyImage.findMany.mockResolvedValue([
      { id: 'f1', storyId: 'id', position: 1, sourceUrl: 'https://src/1.jpg' },
      { id: 'f2', storyId: 'id', position: 2, sourceUrl: 'https://src/2.jpg' },
    ])
    mockRehostFoto.mockImplementation(async (_u: string, storyId: string, n: number) => `https://cdn.r2.example/ogfoto-${storyId}-0${n}.jpg`)

    await rehostStoryPhotos(['id'])

    expect(mockPrisma.storyImage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storyId: { in: ['id'] }, hostedUrl: null },
    }))
    expect(mockRehostFoto).toHaveBeenCalledTimes(2)
    expect(mockPrisma.storyImage.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { hostedUrl: 'https://cdn.r2.example/ogfoto-id-01.jpg' } })
    expect(mockPrisma.storyImage.update).toHaveBeenCalledWith({ where: { id: 'f2' }, data: { hostedUrl: 'https://cdn.r2.example/ogfoto-id-02.jpg' } })
  })

  it('una foto que no pasa queda sin copia, y no detiene a las demás', async () => {
    mockPrisma.storyImage.findMany.mockResolvedValue([
      { id: 'f1', storyId: 'id', position: 1, sourceUrl: 'https://src/icono.jpg' },
      { id: 'f2', storyId: 'id', position: 2, sourceUrl: 'https://src/2.jpg' },
    ])
    mockRehostFoto.mockResolvedValueOnce(null).mockResolvedValueOnce('https://cdn.r2.example/ogfoto-id-02.jpg')

    await rehostStoryPhotos(['id'])

    expect(mockPrisma.storyImage.update).toHaveBeenCalledTimes(1)
    expect(mockPrisma.storyImage.update).toHaveBeenCalledWith({ where: { id: 'f2' }, data: { hostedUrl: 'https://cdn.r2.example/ogfoto-id-02.jpg' } })
  })

  it('si la tabla no existe todavía (SQL pendiente), no lanza', async () => {
    mockPrisma.storyImage.findMany.mockRejectedValue(Object.assign(new Error('table does not exist'), { code: 'P2021' }))

    await expect(rehostStoryPhotos(['id'])).resolves.toBeUndefined()
    expect(mockRehostFoto).not.toHaveBeenCalled()
  })

  it('sin ids no consulta nada', async () => {
    await rehostStoryPhotos([])
    expect(mockPrisma.storyImage.findMany).not.toHaveBeenCalled()
  })
})

// ──── Rescate del inglés (23-nov-2026) ───────────────────────────────────────
// La destacada de la portada quedó en español con el sitio en inglés: su
// traducción falló al publicarse y nada volvía a intentarla.
describe('runPublishStories — retoma las traducciones pendientes de días anteriores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStory.bulkUpdateStatus.mockResolvedValue({ count: 1 })
    mockTranslation.translateStoriesBatch.mockResolvedValue({ translated: 1, failed: 0 })
    mockTranslation.translateRecentUntranslated.mockResolvedValue({ pending: 0, translated: 0, failed: 0 })
    mockPrisma.story.findMany.mockResolvedValue([])
    mockPrisma.storyImage.findMany.mockResolvedValue([])
    mockSnapshot.mockResolvedValue(null)
  })

  it('tras traducir lo recién publicado, retoma las anteriores sin inglés, excluyendo las de esta corrida', async () => {
    mockStory.getStoryIdsByStatus.mockResolvedValue(['nueva'])
    await runPublishStories()
    expect(mockTranslation.translateRecentUntranslated).toHaveBeenCalledWith({ days: 3, limit: 10, exclude: ['nueva'] })
    const ordenTraducir = mockTranslation.translateStoriesBatch.mock.invocationCallOrder[0]
    const ordenRescate = mockTranslation.translateRecentUntranslated.mock.invocationCallOrder[0]
    const ordenPortada = mockSnapshot.mock.invocationCallOrder[0]
    expect(ordenTraducir).toBeLessThan(ordenRescate)
    expect(ordenRescate).toBeLessThan(ordenPortada)
  })

  it('sin noticias nuevas igual retoma, y rehace la portada solo si tradujo alguna', async () => {
    mockStory.getStoryIdsByStatus.mockResolvedValue([])
    mockTranslation.translateRecentUntranslated.mockResolvedValue({ pending: 1, translated: 1, failed: 0 })
    await runPublishStories()
    expect(mockTranslation.translateRecentUntranslated).toHaveBeenCalledWith({ days: 3, limit: 10, exclude: [] })
    expect(mockSnapshot).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    mockTranslation.translateRecentUntranslated.mockResolvedValue({ pending: 0, translated: 0, failed: 0 })
    await runPublishStories()
    expect(mockSnapshot).not.toHaveBeenCalled()
  })

  it('si el rescate falla, la publicación sigue y la portada se rehace igual', async () => {
    mockStory.getStoryIdsByStatus.mockResolvedValue(['nueva'])
    mockTranslation.translateRecentUntranslated.mockRejectedValue(new Error('db down'))
    await expect(runPublishStories()).resolves.toBeUndefined()
    expect(mockSnapshot).toHaveBeenCalledTimes(1)
  })
})
