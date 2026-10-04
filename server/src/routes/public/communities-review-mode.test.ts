import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

/**
 * Retencion por vertical (D4), a nivel de ruta: la pagina y el panel de señales
 * de una vertical respetan el modo de revision. Sin esto, una ruta podria
 * ignorar el modo y los tests de la funcion pura seguirian verdes.
 */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

const mockPrisma = vi.hoisted(() => ({
  community: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  communityMember: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  story: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  issue: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/brevo.js', () => ({ sendTransactional: vi.fn(), verifyEmail: vi.fn() }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

const { default: app } = await import('../../app.js')

const FILA_COMUNIDAD = { id: 'c-mapuche', name: 'Pueblo Mapuche', type: 'PUEBLO', region: null, issue_ids: [], keywords: ['mapuche'] }
const HELD = { NOT: { communityReviews: { some: { communityId: 'c-mapuche', reviewState: 'held' } } } }
const ENFORCE = { communityReviews: { some: { communityId: 'c-mapuche', reviewState: { in: ['auto', 'released'] } } } }

/** La primera consulta cruda trae la comunidad; la segunda, su modo de revision. */
function conModo(modo: string | null) {
  mockPrisma.$queryRaw.mockReset()
  mockPrisma.$queryRaw.mockResolvedValueOnce([FILA_COMUNIDAD])
  if (modo === null) mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('relation "community_review_modes" does not exist'))
  else mockPrisma.$queryRaw.mockResolvedValueOnce(modo === 'sin-fila' ? [] : [{ mode: modo }])
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.story.count.mockResolvedValue(0)
  mockPrisma.story.findMany.mockResolvedValue([])
  mockPrisma.story.groupBy.mockResolvedValue([])
})

describe('GET /api/communities/:slug/stories respeta el modo de revision', () => {
  it('sin fila de modo: el where de siempre, sin exclusion', async () => {
    conModo('sin-fila')
    const res = await request(app).get('/api/communities/mapuche/stories')
    expect(res.status).toBe(200)
    const where = mockPrisma.story.count.mock.calls[0][0].where
    expect(where.AND).toBeUndefined()
    expect(where).toMatchObject({ status: 'published', relevance: { gte: 3 } })
  })

  it('si la tabla de modos no existe: responde 200 y se comporta como off', async () => {
    conModo(null)
    const res = await request(app).get('/api/communities/mapuche/stories')
    expect(res.status).toBe(200)
    expect(mockPrisma.story.count.mock.calls[0][0].where.AND).toBeUndefined()
  })

  it('en sombra: excluye solo lo retenido por una persona', async () => {
    conModo('shadow')
    await request(app).get('/api/communities/mapuche/stories')
    expect(mockPrisma.story.count.mock.calls[0][0].where.AND).toContainEqual(HELD)
    expect(mockPrisma.story.findMany.mock.calls[0][0].where.AND).toContainEqual(HELD)
  })

  it('en enforce con el aprendizaje encendido (default): se comporta como sombra', async () => {
    conModo('enforce')
    await request(app).get('/api/communities/mapuche/stories')
    expect(mockPrisma.story.count.mock.calls[0][0].where.AND).toContainEqual(HELD)
  })
})

describe('GET /api/communities/:slug/signals respeta el modo de revision', () => {
  it('en sombra: todas las consultas heredan la exclusion', async () => {
    conModo('shadow')
    const res = await request(app).get('/api/communities/mapuche/signals')
    expect(res.status).toBe(200)
    for (const call of [...mockPrisma.story.findMany.mock.calls, ...mockPrisma.story.count.mock.calls]) {
      expect(call[0].where.AND).toContainEqual(HELD)
    }
  })

  it('sin fila de modo: sin exclusion', async () => {
    conModo('sin-fila')
    await request(app).get('/api/communities/mapuche/signals')
    expect(mockPrisma.story.findMany.mock.calls[0][0].where.AND).toBeUndefined()
  })
})

// Referencia para quien lea: la forma de enforce real (con aprendizaje apagado)
// la fija lib/communityVisibility.test.ts; aqui el default de config es aprendizaje encendido.
void ENFORCE
