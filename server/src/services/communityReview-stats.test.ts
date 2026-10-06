import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Alerta de antiguedad de la cola (D4, Tanda B, item 15): la pendiente mas
 * vieja contra config.gate.queueAlertHours. Con el aprendizaje encendido todo
 * es pendiente por diseño, asi que la alerta no se enciende.
 */
const mockPrisma = vi.hoisted(() => ({
  issue: { findMany: vi.fn() },
  story: { count: vi.fn() },
  storyCommunityReview: { groupBy: vi.fn(), findFirst: vi.fn() },
  $queryRaw: vi.fn(),
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
const mockConfig = vi.hoisted(() => ({ learningMode: true, queueAlertHours: 48 }))
vi.mock('../config.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../config.js')>()
  return {
    ...real,
    config: {
      ...real.config,
      gate: { ...real.config.gate, get learningMode() { return mockConfig.learningMode }, get queueAlertHours() { return mockConfig.queueAlertHours } },
    },
  }
})

const { communityReviewStats } = await import('./communityReview.js')
const COMUNIDAD = { id: 'c1', keywords: ['mapuche'], issueIds: [] }
const hace = (h: number) => new Date(Date.now() - h * 3_600_000)

beforeEach(() => {
  vi.clearAllMocks()
  mockConfig.learningMode = true
  mockConfig.queueAlertHours = 48
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.story.count.mockResolvedValue(0)
  mockPrisma.storyCommunityReview.groupBy.mockResolvedValue([{ reviewState: 'pending', _count: { _all: 3 } }])
})

describe('communityReviewStats: antiguedad de la cola', () => {
  it('sin pendientes: null y sin alerta', async () => {
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue(null)
    const s = await communityReviewStats(COMUNIDAD, 'shadow')
    expect(s.oldestPendingAt).toBeNull()
    expect(s.oldestPendingHours).toBeNull()
    expect(s.queueAlert).toBe(false)
  })

  it('con el aprendizaje encendido no alerta aunque la pendiente tenga 100 horas', async () => {
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue({ publishedAt: hace(100), gateEvaluatedAt: hace(100) })
    const s = await communityReviewStats(COMUNIDAD, 'shadow')
    expect(s.oldestPendingHours).toBe(100)
    expect(s.queueAlert).toBe(false)
  })

  it('con el aprendizaje apagado alerta desde el umbral, y no antes', async () => {
    mockConfig.learningMode = false
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue({ publishedAt: hace(47.5), gateEvaluatedAt: hace(47.5) })
    expect((await communityReviewStats(COMUNIDAD, 'shadow')).queueAlert).toBe(false)
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue({ publishedAt: hace(48.2), gateEvaluatedAt: hace(48.2) })
    expect((await communityReviewStats(COMUNIDAD, 'shadow')).queueAlert).toBe(true)
    // La consulta pide la pendiente MAS VIEJA.
    const call = mockPrisma.storyCommunityReview.findFirst.mock.calls[0][0]
    expect(call.where).toEqual({ communityId: 'c1', reviewState: 'pending' })
    expect(call.orderBy[0]).toEqual({ publishedAt: 'asc' })
  })

  it('sin fecha de publicacion en la vertical usa la de evaluacion', async () => {
    mockConfig.learningMode = false
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue({ publishedAt: null, gateEvaluatedAt: hace(50) })
    expect((await communityReviewStats(COMUNIDAD, 'shadow')).oldestPendingHours).toBe(50)
  })

  it('con el aprendizaje encendido «si aplicaras» es una proyeccion: auto, released o pendiente con puntaje 0', async () => {
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue(null)
    const s = await communityReviewStats(COMUNIDAD, 'shadow')
    expect(s.visibleIfEnforcedProjected).toBe(true)
    const where = mockPrisma.story.count.mock.calls[1][0].where
    const some = where.AND[1].communityReviews.some
    expect(some.communityId).toBe('c1')
    expect(some.OR).toEqual([{ reviewState: { in: ['auto', 'released'] } }, { reviewState: 'pending', gateScore: 0 }])
  })

  it('con el aprendizaje apagado «si aplicaras» es el where real de enforce', async () => {
    mockConfig.learningMode = false
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue(null)
    const s = await communityReviewStats(COMUNIDAD, 'shadow')
    expect(s.visibleIfEnforcedProjected).toBe(false)
    const where = mockPrisma.story.count.mock.calls[1][0].where
    expect(JSON.stringify(where)).not.toContain('gateScore')
    expect(JSON.stringify(where)).toContain('"in":["auto","released"]')
  })
})
