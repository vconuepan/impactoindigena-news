import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  community: { findFirst: vi.fn() },
  story: { findMany: vi.fn(), count: vi.fn() },
  issue: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}))

vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/brevo.js', () => ({
  sendTransactional: vi.fn().mockResolvedValue(undefined),
  verifyEmail: vi.fn().mockResolvedValue({ valid: true, domainExists: true, isDisposable: false }),
}))
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

const { default: app } = await import('../../app.js')

/** El `where` que la ruta le paso a prisma.story.count, como texto para buscar dentro. */
function whereEnviado(): string {
  return JSON.stringify(mockPrisma.story.count.mock.calls.at(-1)?.[0]?.where)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.story.findMany.mockResolvedValue([])
  mockPrisma.story.count.mockResolvedValue(0)
  mockPrisma.issue.findMany.mockResolvedValue([{ id: 'issue-vivo' }])
  // Sin la tabla de modos de la D4, getReviewMode cae a 'off'.
  mockPrisma.$queryRaw.mockResolvedValue([])
})

describe('GET /api/opendata/stories', () => {
  it('topic usa la regla de /api/stories: incluye subtemas y la via geografica por pais', async () => {
    // Hasta el 4-oct-2026 filtraba por `issue.slug` a secas: las secciones
    // geograficas, el slug legado y los subtemas devolvian de menos o nada.
    const res = await request(app).get('/api/opendata/stories?topic=chile-indigena')
    expect(res.status).toBe(200)
    const where = whereEnviado()
    expect(where).toContain('"parent":{"slug":"chile-indigena"}')
    expect(where).toContain('countryFocus')
  })

  it('topic acepta el slug legado y lo resuelve al vigente', async () => {
    await request(app).get('/api/opendata/stories?topic=desarrollo-sostenible-y-autodeterminado')
    expect(whereEnviado()).toContain('"slug":"economias-indigenas"')
  })

  it('community filtra con publicCommunityWhere: palabras clave y relevancia minima de la vertical', async () => {
    mockPrisma.community.findFirst.mockResolvedValue({ id: 'comm-1', keywords: ['mapuche'], issueIds: [] })
    const res = await request(app).get('/api/opendata/stories?community=mapuche')
    expect(res.status).toBe(200)
    expect(mockPrisma.community.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'mapuche', active: true } }),
    )
    const where = whereEnviado()
    expect(where).toContain('"contains":"mapuche"')
    expect(where).toContain('"relevance":{"gte":3}')
  })

  it('community aplica la retencion de la vertical en modo shadow: no entrega lo retenido', async () => {
    mockPrisma.community.findFirst.mockResolvedValue({ id: 'comm-1', keywords: ['mapuche'], issueIds: [] })
    mockPrisma.$queryRaw.mockResolvedValue([{ mode: 'shadow' }])
    await request(app).get('/api/opendata/stories?community=mapuche')
    expect(whereEnviado()).toContain('"reviewState":"held"')
  })

  it('topic y community se combinan con AND y no se pisan', async () => {
    mockPrisma.community.findFirst.mockResolvedValue({ id: 'comm-1', keywords: ['mapuche'], issueIds: [] })
    await request(app).get('/api/opendata/stories?topic=cambio-climatico&community=mapuche')
    const where = mockPrisma.story.count.mock.calls.at(-1)?.[0]?.where
    expect(Array.isArray(where.AND)).toBe(true)
    const texto = JSON.stringify(where)
    expect(texto).toContain('cambio-climatico')
    expect(texto).toContain('"contains":"mapuche"')
  })

  it('una comunidad inexistente o inactiva responde 404', async () => {
    mockPrisma.community.findFirst.mockResolvedValue(null)
    const res = await request(app).get('/api/opendata/stories?community=pueblo-mapuche')
    expect(res.status).toBe(404)
  })

  it('declara la licencia CC BY 4.0 en cada respuesta', async () => {
    const res = await request(app).get('/api/opendata/stories')
    expect(res.body.license).toBe('CC-BY-4.0')
    expect(res.body.attribution).toMatch(/CC BY 4\.0/)
    expect(res.body.attribution).toMatch(/Fundación KM/)
  })

  it('se puede consultar desde un navegador en otro dominio (CORS abierto)', async () => {
    const res = await request(app)
      .get('/api/opendata/stories')
      .set('Origin', 'https://universidad.example')
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })
})
