import { describe, it, expect, vi, beforeEach } from 'vitest'

// La clase real vive en lib/instagram.js, pero ese módulo está mockeado acá.
// Se define en el mock para que el `instanceof` del servicio compare contra la
// misma clase que el test lanza.
class InstagramAuthError extends Error {
  code: number
  constructor(message: string, code: number) {
    super(message)
    this.name = 'InstagramAuthError'
    this.code = code
  }
}

const mockLib = vi.hoisted(() => ({
  createCarouselPost: vi.fn(),
  createSingleImagePost: vi.fn(),
  getPostMetrics: vi.fn(),
  isInstagramConfigured: vi.fn(() => true),
}))

const mockPrisma = vi.hoisted(() => ({
  instagramPost: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
}))

vi.mock('../lib/instagram.js', () => ({ ...mockLib, InstagramAuthError }))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../lib/carouselGen.js', () => ({ generateCarousel: vi.fn() }))
vi.mock('../lib/imageGen.js', () => ({ generateStoryImage: vi.fn() }))
vi.mock('./llm.js', () => ({ getMediumLLM: vi.fn(), rateLimitDelay: vi.fn() }))
vi.mock('../prompts/instagram.js', () => ({ buildInstagramCaptionPrompt: vi.fn() }))
vi.mock('../config.js', () => ({
  config: { instagram: { metrics: { maxAgeDays: 30 } } },
}))

const { updateMetrics, updateDraft } = await import('./instagram.js')

const posts = [
  { id: 'a', instagramPostId: '1791', status: 'published' },
  { id: 'b', instagramPostId: '1792', status: 'published' },
  { id: 'c', instagramPostId: '1793', status: 'published' },
]

describe('updateMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isInstagramConfigured.mockReturnValue(true)
    mockPrisma.instagramPost.findMany.mockResolvedValue(posts)
    mockPrisma.instagramPost.update.mockResolvedValue({})
  })

  // Regresión de la caída de julio de 2026. El bucle se tragaba el error de cada
  // post, el job terminaba "con éxito" y el scheduler nunca alertaba: 12 días
  // caído en silencio y 1956 llamadas inútiles a la API.
  it('aborts on the first dead-token error instead of hitting every post', async () => {
    mockLib.getPostMetrics.mockRejectedValue(
      new InstagramAuthError('Error validating access token: Session has expired', 190),
    )

    await expect(updateMetrics()).rejects.toThrow(InstagramAuthError)
    expect(mockLib.getPostMetrics).toHaveBeenCalledTimes(1)
  })

  it('keeps going when a single post fails for a non-auth reason', async () => {
    mockLib.getPostMetrics
      .mockRejectedValueOnce(new Error('Media ID is not available'))
      .mockResolvedValue({ likeCount: 7, commentCount: 2 })

    await updateMetrics()

    expect(mockLib.getPostMetrics).toHaveBeenCalledTimes(3)
    expect(mockPrisma.instagramPost.update).toHaveBeenCalledTimes(2)
  })

  it('writes the metrics it fetches', async () => {
    mockLib.getPostMetrics.mockResolvedValue({ likeCount: 12, commentCount: 3 })

    await updateMetrics()

    expect(mockPrisma.instagramPost.update).toHaveBeenCalledTimes(3)
    expect(mockPrisma.instagramPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a' },
        data: expect.objectContaining({ likeCount: 12, commentCount: 3 }),
      }),
    )
  })
})

describe('updateDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.instagramPost.update.mockResolvedValue({})
  })

  // Regresión: publishPost acepta 'failed' para reintentar, pero updateDraft solo
  // aceptaba 'draft'. El panel guarda el caption antes de publicar, así que editar
  // un post fallido devolvía 400 y la publicación nunca corría. Se vio en vivo el
  // 30-jul-2026: dos PUT con 400 seguidos, cero intentos de publicación.
  it('allows editing a failed post so it can be retried', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue({ id: 'x', status: 'failed' })

    await updateDraft('x', 'caption corregido')

    expect(mockPrisma.instagramPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'x' }, data: { caption: 'caption corregido' } }),
    )
  })

  it('still allows editing a draft', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue({ id: 'y', status: 'draft' })

    await updateDraft('y', 'otro caption')

    expect(mockPrisma.instagramPost.update).toHaveBeenCalledTimes(1)
  })

  it('refuses to edit an already published post', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue({ id: 'z', status: 'published' })

    await expect(updateDraft('z', 'no')).rejects.toThrow('Can only edit draft posts')
    expect(mockPrisma.instagramPost.update).not.toHaveBeenCalled()
  })

  it('ignores captions for posts that do not exist', async () => {
    mockPrisma.instagramPost.findUnique.mockResolvedValue(null)

    await expect(updateDraft('nope', 'x')).rejects.toThrow('Post not found')
  })
})

describe('updateMetrics (writes)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLib.isInstagramConfigured.mockReturnValue(true)
    mockPrisma.instagramPost.findMany.mockResolvedValue(posts)
    mockPrisma.instagramPost.update.mockResolvedValue({})
  })

  it('writes the metrics it fetches (regression guard)', async () => {
    mockLib.getPostMetrics.mockResolvedValue({ likeCount: 12, commentCount: 3 })

    await updateMetrics()

    expect(mockPrisma.instagramPost.update).toHaveBeenCalledTimes(3)
    expect(mockPrisma.instagramPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a' },
        data: expect.objectContaining({ likeCount: 12, commentCount: 3 }),
      }),
    )
  })
})
