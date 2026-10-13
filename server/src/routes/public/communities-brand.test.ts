import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

/** La página y la ficha de la vertical con la vitrina de marca (D5, entrega 2). */

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))
const mockPrisma = vi.hoisted(() => ({
  story: { count: vi.fn(), findMany: vi.fn() },
  storyBrandAssessment: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  issue: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

const { default: app } = await import('../../app.js')

const marca = vi.hoisted(() => ({ mode: 'enforce', rescue_mode: 'off' }))
const publicada = (id: string, dia: number) => ({
  id, slug: id, title: id, sourceUrl: 'u', sourceTitle: 's', titleLabel: null, datePublished: new Date(Date.UTC(2026, 9, dia)),
  relevance: 5, emotionTag: null, summary: 'x', quote: null, quoteAttribution: null, marketingBlurb: null, relevanceSummary: null,
  imageUrl: null, clusterId: null, issue: { name: 'T', slug: 't' }, feed: { id: 'f', title: 'F', displayTitle: null, issue: { name: 'T', slug: 't' } },
})
const deMarca = (id: string, dia: number) => ({
  brandTitle: `Título ${id}`, brandSummary: 'Resumen de marca.', brandSlug: `${id}-abc`, brandDate: new Date(Date.UTC(2026, 9, dia)),
  brandScore: 6, axis: 'region_completa', place: null, sourceSignal: 'term',
  story: { id, sourceUrl: 'https://fuente', sourceTitle: 'Crudo', imageUrl: null, narrativeFrame: null, feedId: 'f2', feed: { id: 'f2', title: 'Angol Noticias', displayTitle: null, issue: { name: 'T', slug: 't' } } },
})

beforeEach(() => {
  vi.clearAllMocks()
  marca.mode = 'enforce'
  mockPrisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?')
    if (sql.includes('community_brand_criteria')) return [{ ...marca }]
    if (sql.includes('community_review_modes')) return []
    if (sql.includes('FROM communities')) return [{ id: 'c-arauc', name: 'Araucanía', issue_ids: [], keywords: ['temuco'] }]
    return []
  })
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.story.count.mockResolvedValue(2)
  mockPrisma.story.findMany.mockResolvedValue([publicada('p13', 13), publicada('p11', 11)])
  mockPrisma.storyBrandAssessment.count.mockResolvedValue(1)
  mockPrisma.storyBrandAssessment.findMany.mockResolvedValue([deMarca('m12', 12)])
})

describe('GET /api/communities/:slug/stories con la vitrina de marca', () => {
  it('apagada: la consulta de siempre, sin leer la vitrina', async () => {
    marca.mode = 'shadow'
    const res = await request(app).get('/api/communities/wallmapu-araucania/stories?page=2&pageSize=10')
    expect(res.status).toBe(200)
    expect(mockPrisma.story.findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 10 })
    expect(mockPrisma.storyBrandAssessment.findMany).not.toHaveBeenCalled()
  })

  it('encendida: mezcla por fecha, suma los totales y la nota de marca enlaza a su ficha', async () => {
    const res = await request(app).get('/api/communities/wallmapu-araucania/stories?pageSize=10')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(3)
    expect(res.body.data.map((x: { id: string }) => x.id)).toEqual(['p13', 'm12', 'p11'])
    expect(res.body.data[1]).toMatchObject({ slug: null, brandSlug: 'm12-abc', communitySlug: 'wallmapu-araucania', title: 'Título m12', issue: null })
    // la vitrina solo trae lo publicado por la marca y visible en D4
    expect(mockPrisma.storyBrandAssessment.findMany.mock.calls[0][0].where).toMatchObject({ communityId: 'c-arauc', state: 'published' })
  })

  it('encendida: la segunda página corta la mezcla, no cada fuente', async () => {
    const res = await request(app).get('/api/communities/wallmapu-araucania/stories?page=2&pageSize=2')
    expect(res.body.data.map((x: { id: string }) => x.id)).toEqual(['p11'])
    expect(mockPrisma.story.findMany.mock.calls[0][0]).toMatchObject({ take: 4 })
    expect(mockPrisma.story.findMany.mock.calls[0][0].skip).toBeUndefined()
  })
})

describe('GET /api/communities/:slug/notas/:brandSlug', () => {
  it('devuelve la ficha de marca, sin tema ni relevancia', async () => {
    mockPrisma.storyBrandAssessment.findFirst.mockResolvedValue(deMarca('m12', 12))
    const res = await request(app).get('/api/communities/wallmapu-araucania/notas/m12-abc')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ title: 'Título m12', summary: 'Resumen de marca.', publisher: 'Angol Noticias', origen: 'territorial', community: { slug: 'wallmapu-araucania', name: 'Araucanía' } })
    expect(res.body.issue).toBeUndefined()
    expect(res.body.relevance).toBeUndefined()
  })

  it('404 si la vitrina está apagada o la nota no está visible', async () => {
    marca.mode = 'shadow'
    expect((await request(app).get('/api/communities/wallmapu-araucania/notas/m12-abc')).status).toBe(404)
    marca.mode = 'enforce'
    mockPrisma.storyBrandAssessment.findFirst.mockResolvedValue(null)
    expect((await request(app).get('/api/communities/wallmapu-araucania/notas/nada')).status).toBe(404)
  })
})
