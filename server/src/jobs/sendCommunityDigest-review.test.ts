import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Aislamiento por vertical (D4, Tanda B, item 14), consumidor digest: el correo
 * semanal arma cada seccion con el MISMO filtro que la pagina de la vertical,
 * acotado a la semana. Una nota retenida por el editor no viaja por correo.
 */
const mockPrisma = vi.hoisted(() => ({
  communityMember: { findMany: vi.fn() },
  digestExclusion: { findMany: vi.fn() },
  story: { findMany: vi.fn() },
  issue: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}))
const sendTransactional = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../services/brevo.js', () => ({ sendTransactional }))

const { runSendCommunityDigest } = await import('./sendCommunityDigest.js')

const HELD = { NOT: { communityReviews: { some: { communityId: 'c-mapuche', reviewState: 'held' } } } }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.digestExclusion.findMany.mockResolvedValue([])
  mockPrisma.story.findMany.mockResolvedValue([])
  mockPrisma.communityMember.findMany.mockResolvedValue([
    {
      user: { id: 'u1', email: 'u1@example.com', name: 'U' },
      community: { id: 'c-mapuche', slug: 'mapuche', name: 'Pueblo Mapuche', type: 'PUEBLO', issueIds: ['tema-fantasma'], keywords: ['mapuche'] },
    },
  ])
})

describe('digest semanal y la retencion por vertical', () => {
  it('en sombra: filtro de la pagina + semana, con lo retenido excluido', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ mode: 'shadow' }])
    await runSendCommunityDigest()
    expect(mockPrisma.story.findMany).toHaveBeenCalledOnce()
    const where = mockPrisma.story.findMany.mock.calls[0][0].where
    expect(where.AND).toHaveLength(2)
    const [vertical, semana] = where.AND
    expect(vertical).toMatchObject({ status: 'published', relevance: { gte: 3 } })
    expect(vertical.AND[1]).toEqual(HELD)
    expect(JSON.stringify(vertical)).not.toContain('issueId')
    expect(semana.datePublished.gte).toBeInstanceOf(Date)
  })

  it('en off: el mismo filtro sin exclusion, y sigue acotado a la semana', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    await runSendCommunityDigest()
    const where = mockPrisma.story.findMany.mock.calls[0][0].where
    const [vertical, semana] = where.AND
    expect(vertical.AND).toBeUndefined()
    expect(JSON.stringify(vertical)).toContain('mapuche')
    expect(semana.datePublished.gte).toBeInstanceOf(Date)
  })
})
