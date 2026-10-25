import { describe, it, expect, vi, beforeEach } from 'vitest'

// La clase real vive en lib/linkedin.js, pero ese módulo está mockeado acá.
// Se define en el mock para que el `instanceof` del servicio compare contra la
// misma clase que el test lanza.
class LinkedInAuthError extends Error {
  status: number
  serviceErrorCode?: number
  constructor(message: string, status: number, serviceErrorCode?: number) {
    super(message)
    this.name = 'LinkedInAuthError'
    this.status = status
    this.serviceErrorCode = serviceErrorCode
  }
}

const mockLib = vi.hoisted(() => ({
  createUgcPost: vi.fn(),
  getOrgPostMetrics: vi.fn(),
  isLinkedInConfigured: vi.fn(() => true),
}))

const mockPrisma = vi.hoisted(() => ({
  story: { findUnique: vi.fn() },
  instagramPost: { findUnique: vi.fn() },
  linkedInPost: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
}))

// El carrusel desde el original se prueba en storyCarousel.test.ts; acá se
// simula, y se conservan los ayudantes reales (nombre de las láminas, error).
const mockCarrusel = vi.hoisted(() => ({
  buildStoryCarouselForSocial: vi.fn(),
  subirCarrusel: vi.fn(),
}))
const mockLLM = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../lib/linkedin.js', () => ({ ...mockLib, LinkedInAuthError }))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('./storyCarousel.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storyCarousel.js')>()),
  ...mockCarrusel,
}))
vi.mock('./llm.js', () => ({
  getMediumLLM: () => ({ withStructuredOutput: () => ({ invoke: mockLLM.invoke }) }),
  rateLimitDelay: vi.fn(),
}))
vi.mock('../config.js', () => ({
  config: { linkedin: { authorUrn: 'urn:li:organization:99', metrics: { maxAgeDays: 30 } } },
}))

const { updateMetrics, generateDraft, publishPost } = await import('./linkedin.js')
const { StoryCarouselError } = await import('./storyCarousel.js')

function publishedPosts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `post-${i}`,
    linkedinPostId: `urn:li:share:${i}`,
    status: 'published',
  }))
}

describe('updateMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isLinkedInConfigured.mockReturnValue(true)
    mockPrisma.linkedInPost.update.mockResolvedValue({})
  })

  /**
   * El bug que dejó Instagram 12 días caído sin una sola alerta: el bucle se
   * tragaba el error de token post por post (`log.warn` + `failed++`) y el job
   * terminaba "OK", así que el scheduler nunca avisaba. Acá tiene que subir.
   */
  it('aborts and rethrows when the token is rejected, instead of finishing "OK"', async () => {
    mockPrisma.linkedInPost.findMany.mockResolvedValue(publishedPosts(5))
    mockLib.getOrgPostMetrics.mockRejectedValue(
      new LinkedInAuthError('expired', 401, 65602),
    )

    await expect(updateMetrics()).rejects.toThrow(LinkedInAuthError)
  })

  it('stops at the first dead-token error instead of walking every post', async () => {
    mockPrisma.linkedInPost.findMany.mockResolvedValue(publishedPosts(5))
    mockLib.getOrgPostMetrics.mockRejectedValue(
      new LinkedInAuthError('expired', 401, 65602),
    )

    await updateMetrics().catch(() => {})

    expect(mockLib.getOrgPostMetrics).toHaveBeenCalledTimes(1)
  })

  // Un fallo puntual de un post no debe tumbar la corrida entera: se cuenta y
  // se sigue, que es el comportamiento que ya existía.
  it('keeps going past a non-auth failure on a single post', async () => {
    mockPrisma.linkedInPost.findMany.mockResolvedValue(publishedPosts(3))
    mockLib.getOrgPostMetrics
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ likeCount: 1, commentCount: 2, impressionCount: 3 })

    await expect(updateMetrics()).resolves.toBeUndefined()
    expect(mockLib.getOrgPostMetrics).toHaveBeenCalledTimes(3)
    expect(mockPrisma.linkedInPost.update).toHaveBeenCalledTimes(2)
  })

  it('writes the metrics it manages to fetch', async () => {
    mockPrisma.linkedInPost.findMany.mockResolvedValue(publishedPosts(1))
    mockLib.getOrgPostMetrics.mockResolvedValue({
      likeCount: 7,
      commentCount: 2,
      impressionCount: 140,
    })

    await updateMetrics()

    expect(mockPrisma.linkedInPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-0' },
        data: expect.objectContaining({ likeCount: 7, commentCount: 2, impressionCount: 140 }),
      }),
    )
  })

  // Con autor de perfil personal getOrgPostMetrics devuelve null: se salta, no
  // se cuenta como fallo. Es el no-op estructural que obligó a crear un job
  // aparte para vigilar el token.
  it('skips posts when metrics are unavailable, without failing', async () => {
    mockPrisma.linkedInPost.findMany.mockResolvedValue(publishedPosts(2))
    mockLib.getOrgPostMetrics.mockResolvedValue(null)

    await expect(updateMetrics()).resolves.toBeUndefined()
    expect(mockPrisma.linkedInPost.update).not.toHaveBeenCalled()
  })

  it('does nothing when there are no published posts in the window', async () => {
    mockPrisma.linkedInPost.findMany.mockResolvedValue([])

    await updateMetrics()

    expect(mockLib.getOrgPostMetrics).not.toHaveBeenCalled()
  })

  it('does nothing when LinkedIn is not configured', async () => {
    mockLib.isLinkedInConfigured.mockReturnValue(false)

    await updateMetrics()

    expect(mockPrisma.linkedInPost.findMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Desde el 25-oct-2026: la galería es el carrusel armado desde el original
// ---------------------------------------------------------------------------

const NUEVAS = ['https://pub.r2.test/social/s1-original-01-1.jpg', 'https://pub.r2.test/social/s1-original-02-1.jpg']
const VIEJAS = ['https://pub.r2.test/social/s1-slide1-1792832458341.jpg']

function noticia() {
  return {
    id: 's1', title: 'Titular de Voces', sourceTitle: 'Titular original', slug: 'titular',
    summary: 'Resumen', imageUrl: 'https://medio.test/foto.jpg',
    feed: { url: 'https://medio.test/feed' }, issue: { name: 'Territorio' },
  }
}

describe('la galería de LinkedIn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.story.findUnique.mockResolvedValue(noticia())
    mockPrisma.linkedInPost.findFirst.mockResolvedValue(null)
    mockPrisma.linkedInPost.create.mockImplementation(async ({ data }: any) => ({ id: 'li-1', ...data }))
    mockLLM.invoke.mockResolvedValue({ postText: 'Texto del post' })
  })

  it('reutiliza el carrusel de Instagram si se armó desde el original', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue({ slideUrls: NUEVAS })

    const post = await generateDraft('s1')

    expect(post.slideUrls).toEqual(NUEVAS)
    expect(mockCarrusel.buildStoryCarouselForSocial).not.toHaveBeenCalled()
  })

  it('no reutiliza el carrusel anterior de Instagram: arma uno desde el original', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue({ slideUrls: VIEJAS })
    mockCarrusel.buildStoryCarouselForSocial.mockResolvedValue({ imagenes: [Buffer.from('a')] })
    mockCarrusel.subirCarrusel.mockResolvedValue(NUEVAS)

    const post = await generateDraft('s1')

    expect(mockCarrusel.buildStoryCarouselForSocial).toHaveBeenCalledWith('s1')
    expect(post.slideUrls).toEqual(NUEVAS)
  })

  it('si el carrusel no pasa los candados, sale sin galería', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue(null)
    mockCarrusel.buildStoryCarouselForSocial.mockRejectedValue(new StoryCarouselError('no pasó', []))

    const post = await generateDraft('s1')

    expect(post.slideUrls).toEqual([])
    expect(mockCarrusel.subirCarrusel).not.toHaveBeenCalled()
  })

  it('al publicar un borrador guardado con la galería anterior, la deja fuera', async () => {
    mockLib.isLinkedInConfigured.mockReturnValue(true)
    mockPrisma.linkedInPost.findUnique.mockResolvedValue({
      id: 'li-1', status: 'draft', postText: 'Texto', slideUrls: VIEJAS, story: noticia(),
    })
    mockPrisma.linkedInPost.update.mockResolvedValue({})
    mockLib.createUgcPost.mockResolvedValue({ id: 'urn:li:share:1', permalink: 'https://linkedin.com/x' })

    await publishPost('li-1')

    const imagenes = mockLib.createUgcPost.mock.calls[0][4]
    expect(imagenes).toEqual(['https://medio.test/foto.jpg'])
  })
})
