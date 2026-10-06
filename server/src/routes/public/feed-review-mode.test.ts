import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

/**
 * Aislamiento por vertical (D4, Tanda B, item 14), consumidor RSS: el feed de
 * una vertical usa el MISMO filtro que su pagina, con el modo de revision real.
 * Al 4-oct-2026 el RSS exigia tema Y palabras clave y entregaba 44 notas donde
 * la pagina mostraba 389; y una nota retenida habria seguido saliendo por RSS.
 */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

const mockPrisma = vi.hoisted(() => ({
  story: { count: vi.fn(), findMany: vi.fn() },
  issue: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

const { default: app } = await import('../../app.js')

const FILA = { id: 'c-mapuche', name: 'Pueblo Mapuche', description: null, issue_ids: ['tema-fantasma'], keywords: ['mapuche'] }
const HELD = { NOT: { communityReviews: { some: { communityId: 'c-mapuche', reviewState: 'held' } } } }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.story.findMany.mockResolvedValue([])
})

describe('GET /api/feed/comunidad/:slug respeta el modo de revision', () => {
  it('en sombra excluye lo retenido y NO exige el tema (las palabras clave mandan)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([FILA]).mockResolvedValueOnce([{ mode: 'shadow' }])
    const res = await request(app).get('/api/feed/comunidad/mapuche-rss-a')
    expect(res.status).toBe(200)
    const where = mockPrisma.story.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ status: 'published', relevance: { gte: 3 } })
    expect(where.AND[1]).toEqual(HELD)
    expect(JSON.stringify(where)).not.toContain('issueId')
    expect(JSON.stringify(where.AND[0])).toContain('mapuche')
  })

  it('sin fila de modo: el filtro de la pagina, sin exclusion', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([FILA]).mockResolvedValueOnce([])
    const res = await request(app).get('/api/feed/comunidad/mapuche-rss-b')
    expect(res.status).toBe(200)
    const where = mockPrisma.story.findMany.mock.calls[0][0].where
    expect(where.AND).toBeUndefined()
    expect(JSON.stringify(where)).toContain('mapuche')
  })
})
