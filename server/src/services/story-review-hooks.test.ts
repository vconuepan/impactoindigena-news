import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Retencion por vertical (D4): los caminos que dejan una nota publicada tienen
 * que registrar lo que dice el gate. Si el gancho se colgara de uno solo, los
 * otros publicarian sin fila. Y un fallo del gancho nunca puede cambiar el
 * resultado de publicar en la casa grande.
 */
const mockPrisma = vi.hoisted(() => ({
  story: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
}))
const register = vi.hoisted(() => vi.fn())

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./communityReview.js', () => ({ registerCommunityReviews: register }))
vi.mock('./embedding.js', () => ({
  generateEmbeddingForContent: vi.fn(),
  generateSearchEmbedding: vi.fn(),
  ensureEmbedding: vi.fn(),
  ensureEmbeddings: vi.fn(),
}))

const { updateStoryStatus, publishStory, bulkUpdateStatus, updateStory } = await import('./story.js')

describe('ganchos de la retencion por vertical', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.story.findUnique.mockResolvedValue({ datePublished: new Date(), slug: 'ya-tiene', title: 't', sourceTitle: 't' })
    mockPrisma.story.update.mockResolvedValue({ id: 'x', status: 'published' })
    mockPrisma.story.findMany.mockResolvedValue([])
    mockPrisma.story.updateMany.mockResolvedValue({ count: 1 })
  })

  it('updateStoryStatus a published registra la nota', async () => {
    await updateStoryStatus('x', 'published')
    expect(register).toHaveBeenCalledWith(['x'])
  })

  it('updateStoryStatus a otro estado no registra', async () => {
    await updateStoryStatus('x', 'rejected')
    expect(register).not.toHaveBeenCalled()
  })

  it('publishStory registra la nota', async () => {
    await publishStory('x')
    expect(register).toHaveBeenCalledWith(['x'])
  })

  it('bulkUpdateStatus a published registra todas (cubre el job y /bulk-status)', async () => {
    await bulkUpdateStatus(['a', 'b'], 'published')
    expect(register).toHaveBeenCalledWith(['a', 'b'])
  })

  it('bulkUpdateStatus a otro estado no registra', async () => {
    await bulkUpdateStatus(['a'], 'trashed')
    expect(register).not.toHaveBeenCalled()
  })

  it('updateStory con status published registra; sin cambio de estado, no', async () => {
    await updateStory('x', { status: 'published' })
    expect(register).toHaveBeenCalledWith(['x'])
    register.mockClear()
    await updateStory('x', { relevance: 7 })
    expect(register).not.toHaveBeenCalled()
  })
})
