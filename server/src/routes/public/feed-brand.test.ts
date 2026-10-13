import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

/** El RSS de la vertical con la vitrina de marca (D5, entrega 2). */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))
const mockPrisma = vi.hoisted(() => ({
  story: { findMany: vi.fn() },
  storyBrandAssessment: { findMany: vi.fn() },
  issue: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

const { default: app } = await import('../../app.js')
const { invalidarFeedComunidad } = await import('./feed.js')
const marca = vi.hoisted(() => ({ mode: 'enforce' }))

beforeEach(() => {
  vi.clearAllMocks()
  invalidarFeedComunidad('wallmapu-araucania')
  marca.mode = 'enforce'
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?')
    if (sql.includes('community_brand_criteria')) return [{ criterion: 'territorial', mode: marca.mode, rescue_mode: 'off' }]
    if (sql.includes('FROM communities')) return [{ id: 'c1', name: 'Araucanía', description: null, issue_ids: [], keywords: ['temuco'] }]
    return []
  })
  mockPrisma.story.findMany.mockResolvedValue([
    { id: 's1', slug: 'nota-1', title: 'Publicada', sourceTitle: 'F', summary: 'R', datePublished: new Date('2026-10-10'), dateCrawled: new Date('2026-10-10'), issue: { name: 'Territorio' } },
  ])
  mockPrisma.storyBrandAssessment.findMany.mockResolvedValue([
    {
      brandTitle: 'Angol inaugura su CESFAM', brandSummary: 'Resumen.', brandSlug: 'angol-abc', brandDate: new Date('2026-10-12'),
      brandScore: 6, axis: 'region_completa', place: null, sourceSignal: 'term',
      story: { id: 's2', sourceUrl: 'u', sourceTitle: 'Crudo', imageUrl: null, narrativeFrame: null, feedId: 'f', feed: { id: 'f', title: 'Angol Noticias', displayTitle: null, issue: { name: 'T', slug: 't' } } },
    },
  ])
})

describe('RSS de la vertical con la vitrina de marca', () => {
  it('incluye la nota de marca con enlace a su ficha, por fecha, y con la vertical como categoría', async () => {
    const res = await request(app).get('/api/feed/comunidad/wallmapu-araucania')
    expect(res.status).toBe(200)
    expect(res.text).toContain('/comunidad/wallmapu-araucania/n/angol-abc')
    expect(res.text.indexOf('angol-abc')).toBeLessThan(res.text.indexOf('nota-1'))
    expect(res.text).toMatch(/<category>(<!\[CDATA\[)?Araucanía/)
    // la vitrina no repite lo que ya sale por el filtro de siempre (revisión del 13-oct)
    expect(mockPrisma.storyBrandAssessment.findMany.mock.calls[0][0].where.story.AND[1]).toEqual({ NOT: mockPrisma.story.findMany.mock.calls[0][0].where })
  })

  it('al invalidar la caché, el cambio de modo se ve en el próximo pedido', async () => {
    await request(app).get('/api/feed/comunidad/wallmapu-araucania')
    marca.mode = 'shadow'
    expect((await request(app).get('/api/feed/comunidad/wallmapu-araucania')).text).toContain('angol-abc') // sigue en caché
    invalidarFeedComunidad('wallmapu-araucania')
    expect((await request(app).get('/api/feed/comunidad/wallmapu-araucania')).text).not.toContain('angol-abc')
  })
})
