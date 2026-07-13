import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  story: {
    findMany: vi.fn(),
  },
  issue: {
    findMany: vi.fn(),
  },
  community: {
    findMany: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

const { default: app } = await import('../../app.js')
const { sitemapCache, newsSitemapCache } = await import('./sitemap.js')

const publishedStories = [
  { slug: 'ai-breakthrough-2024', datePublished: new Date('2024-06-15') },
  { slug: 'climate-summit-results', datePublished: new Date('2024-06-14') },
  { slug: 'space-mission-launch', datePublished: new Date('2024-06-13') },
]

describe('GET /api/sitemap.xml', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sitemapCache.clear()
    mockPrisma.issue.findMany.mockResolvedValue([])
    mockPrisma.community.findMany.mockResolvedValue([])
  })

  it('returns valid XML with correct content type', async () => {
    mockPrisma.story.findMany.mockResolvedValue(publishedStories)

    const res = await request(app).get('/api/sitemap.xml')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/xml/)
    expect(res.text).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  })

  it('includes story URLs with lastmod', async () => {
    mockPrisma.story.findMany.mockResolvedValue(publishedStories)

    const res = await request(app).get('/api/sitemap.xml')

    expect(res.text).toContain('<loc>https://impactoindigena.news/stories/ai-breakthrough-2024</loc>')
    expect(res.text).toContain('<loc>https://impactoindigena.news/stories/climate-summit-results</loc>')
    expect(res.text).toContain('<loc>https://impactoindigena.news/stories/space-mission-launch</loc>')
    expect(res.text).toContain('<lastmod>2024-06-15</lastmod>')
  })

  it('sets Cache-Control header', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    const res = await request(app).get('/api/sitemap.xml')

    expect(res.headers['cache-control']).toMatch(/public/)
    expect(res.headers['cache-control']).toMatch(/max-age=3600/)
  })

  it('queries only published stories with slugs', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    await request(app).get('/api/sitemap.xml')

    expect(mockPrisma.story.findMany).toHaveBeenCalledWith({
      where: { status: 'published', slug: { not: null } },
      select: { slug: true, datePublished: true },
      orderBy: { datePublished: 'desc' },
    })
  })

  it('uses cached response on second request', async () => {
    mockPrisma.story.findMany.mockResolvedValue(publishedStories)

    // First request — hits DB
    const res1 = await request(app).get('/api/sitemap.xml')
    expect(res1.status).toBe(200)

    // Second request — should use cache
    const res2 = await request(app).get('/api/sitemap.xml')
    expect(res2.status).toBe(200)
    expect(res2.text).toBe(res1.text)

    // DB was only called once (cache served second request)
    expect(mockPrisma.story.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.issue.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.community.findMany).toHaveBeenCalledTimes(1)
  })

  it('includes issue and community URLs', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])
    mockPrisma.issue.findMany.mockResolvedValue([{ slug: 'chile-indigena' }, { slug: 'derechos-indigenas' }])
    mockPrisma.community.findMany.mockResolvedValue([{ slug: 'mapuche' }, { slug: 'amazonia' }])

    const res = await request(app).get('/api/sitemap.xml')

    expect(res.text).toContain('<loc>https://impactoindigena.news/issues/chile-indigena</loc>')
    expect(res.text).toContain('<loc>https://impactoindigena.news/issues/derechos-indigenas</loc>')
    expect(res.text).toContain('<loc>https://impactoindigena.news/comunidad/mapuche</loc>')
    expect(res.text).toContain('<loc>https://impactoindigena.news/comunidad/amazonia</loc>')
    expect(res.text).toContain('<loc>https://impactoindigena.news/comunidades</loc>')
  })

  it('returns 500 on database error', async () => {
    mockPrisma.story.findMany.mockRejectedValue(new Error('DB connection failed'))

    const res = await request(app).get('/api/sitemap.xml')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to generate sitemap')
  })
})

describe('GET /api/sitemap-news.xml', () => {
  const newsStories = [
    { slug: 'consulta-mapuche', title: 'Consulta previa en territorio mapuche', datePublished: new Date('2026-07-13T09:00:00Z') },
    { slug: 'corte-idh-fallo', title: 'Corte IDH falla a favor de comunidad', datePublished: new Date('2026-07-12T15:30:00Z') },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    newsSitemapCache.clear()
  })

  it('returns valid Google News XML with the news namespace', async () => {
    mockPrisma.story.findMany.mockResolvedValue(newsStories)

    const res = await request(app).get('/api/sitemap-news.xml')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/xml/)
    expect(res.text).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"')
    expect(res.text).toContain('<news:name>Impacto Indígena</news:name>')
    expect(res.text).toContain('<news:language>es</news:language>')
  })

  it('includes story loc, publication date, and title', async () => {
    mockPrisma.story.findMany.mockResolvedValue(newsStories)

    const res = await request(app).get('/api/sitemap-news.xml')

    expect(res.text).toContain('<loc>https://impactoindigena.news/stories/consulta-mapuche</loc>')
    expect(res.text).toContain('<news:publication_date>2026-07-13T09:00:00.000Z</news:publication_date>')
    expect(res.text).toContain('<news:title>Consulta previa en territorio mapuche</news:title>')
  })

  it('escapes XML special characters in titles', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { slug: 's', title: 'Litio & agua: "derechos" <en juego>', datePublished: new Date('2026-07-13T09:00:00Z') },
    ])

    const res = await request(app).get('/api/sitemap-news.xml')

    expect(res.text).toContain('Litio &amp; agua: &quot;derechos&quot; &lt;en juego&gt;')
    expect(res.text).not.toContain('<en juego>')
  })

  it('queries only recent published stories with slug and title', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    await request(app).get('/api/sitemap-news.xml')

    const call = mockPrisma.story.findMany.mock.calls[0][0]
    expect(call.where.status).toBe('published')
    expect(call.where.slug).toEqual({ not: null })
    expect(call.where.title).toEqual({ not: null })
    expect(call.where.datePublished.gte).toBeInstanceOf(Date)
    expect(call.take).toBe(1000)
    expect(call.orderBy).toEqual({ datePublished: 'desc' })
  })

  it('sets a shorter Cache-Control than the main sitemap', async () => {
    mockPrisma.story.findMany.mockResolvedValue([])

    const res = await request(app).get('/api/sitemap-news.xml')

    expect(res.headers['cache-control']).toMatch(/max-age=900/)
  })

  it('returns 500 on database error', async () => {
    mockPrisma.story.findMany.mockRejectedValue(new Error('DB connection failed'))

    const res = await request(app).get('/api/sitemap-news.xml')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to generate news sitemap')
  })
})
