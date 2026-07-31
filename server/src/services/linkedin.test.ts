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
  linkedInPost: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
}))

vi.mock('../lib/linkedin.js', () => ({ ...mockLib, LinkedInAuthError }))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../lib/carouselGen.js', () => ({ generateCarousel: vi.fn() }))
vi.mock('./llm.js', () => ({ getMediumLLM: vi.fn(), rateLimitDelay: vi.fn() }))
vi.mock('../config.js', () => ({
  config: { linkedin: { authorUrn: 'urn:li:organization:99', metrics: { maxAgeDays: 30 } } },
}))

const { updateMetrics } = await import('./linkedin.js')

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
