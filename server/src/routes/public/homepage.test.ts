import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { TEST_API_KEY } from '../../test/helpers.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { HOMEPAGE_ISSUE_SLUGS } from './homepage.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  story: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  issue: {
    findMany: vi.fn(),
  },
  ongoingCase: {
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

// Bypass TTLCache in tests to avoid cross-test pollution
vi.mock('../../lib/cache.js', () => ({
  TTLCache: class {
    get() {
      return undefined
    }
    set() {}
    delete() {}
    clear() {}
  },
  cached: async <T>(_cache: unknown, _key: string, fn: () => Promise<T>) => fn(),
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

const mockIssue = {
  id: 'issue-1',
  name: 'Human Development',
  slug: 'human-development',
  description: 'Test description',
  intro: 'Test intro',
  evaluationIntro: 'Test eval intro',
  evaluationCriteria: JSON.stringify(['criterion 1']),
  makeADifference: JSON.stringify([{ label: 'Link', url: 'https://example.com' }]),
  parentId: null,
  feeds: [{ title: 'Feed 1', displayTitle: 'Feed Display', active: true }],
  children: [],
}

const mockStory = {
  id: 'story-1',
  slug: 'test-story',
  sourceUrl: 'https://example.com/article',
  sourceTitle: 'Example Article',
  title: 'Test Story',
  titleLabel: null,
  dateCrawled: new Date('2024-01-14'),
  datePublished: new Date('2024-01-15'),
  status: 'published',
  relevancePre: 7,
  relevance: 9,
  emotionTag: 'uplifting',
  summary: 'A test summary',
  quote: 'A notable quote',
  quoteAttribution: 'Author',
  marketingBlurb: 'Read this article',
  relevanceReasons: 'Very relevant',
  relevanceSummary: 'Summary',
  antifactors: 'None',
  issue: { name: 'Human Development', slug: 'human-development' },
  feed: {
    id: 'feed-1',
    title: 'Test Feed',
    displayTitle: 'Display Title',
    issue: { name: 'Human Development', slug: 'human-development' },
  },
}

describe('Homepage API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.ongoingCase.findMany.mockResolvedValue([])
    mockPrisma.story.count.mockResolvedValue(0)
  })

  describe('GET /api/homepage', () => {
    it('returns combined homepage data without auth', async () => {
      mockPrisma.issue.findMany.mockResolvedValue([mockIssue])
      mockPrisma.story.findMany.mockResolvedValue([mockStory])

      const res = await request(app).get('/api/homepage')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('issues')
      expect(res.body).toHaveProperty('storiesByIssue')
      expect(res.body).not.toHaveProperty('heroPositive')
      expect(res.body).not.toHaveProperty('heroNegative')
    })

    it('returns issues list', async () => {
      mockPrisma.issue.findMany.mockResolvedValue([mockIssue])
      mockPrisma.story.findMany.mockResolvedValue([mockStory])

      const res = await request(app).get('/api/homepage')
      expect(res.status).toBe(200)
      expect(res.body.issues).toHaveLength(1)
      expect(res.body.issues[0].slug).toBe('human-development')
    })

    it('returns stories grouped by issue slug with uplifting/calm/negative buckets', async () => {
      mockPrisma.issue.findMany.mockResolvedValue([mockIssue])
      mockPrisma.story.findMany.mockResolvedValue([mockStory])

      const res = await request(app).get('/api/homepage')
      expect(res.status).toBe(200)
      expect(res.body.storiesByIssue).toBeDefined()
      expect(typeof res.body.storiesByIssue).toBe('object')

      // Each issue entry should have uplifting, calm, and negative arrays
      for (const slug of Object.keys(res.body.storiesByIssue)) {
        const entry = res.body.storiesByIssue[slug]
        expect(entry).toHaveProperty('uplifting')
        expect(entry).toHaveProperty('calm')
        expect(entry).toHaveProperty('negative')
        expect(Array.isArray(entry.uplifting)).toBe(true)
        expect(Array.isArray(entry.calm)).toBe(true)
        expect(Array.isArray(entry.negative)).toBe(true)
      }
    })

    it('handles empty data gracefully', async () => {
      mockPrisma.issue.findMany.mockResolvedValue([])
      mockPrisma.story.findMany.mockResolvedValue([])

      const res = await request(app).get('/api/homepage')
      expect(res.status).toBe(200)
      expect(res.body.issues).toEqual([])
    })

    it('sets cache headers', async () => {
      mockPrisma.issue.findMany.mockResolvedValue([mockIssue])
      mockPrisma.story.findMany.mockResolvedValue([mockStory])

      const res = await request(app).get('/api/homepage')
      expect(res.headers['cache-control']).toBe('public, max-age=60')
    })
  })
})

/**
 * El servidor y el cliente enumeran las mismas ocho categorias, y no pueden
 * compartir el archivo porque el server no resuelve el alias `@shared`. Este
 * test lee el del cliente como texto y compara.
 *
 * El 5-sep-2026 se desincronizaron: el server se quedo con cinco slugs y con el
 * legado de Economias, asi que la portada pedia historias para cinco secciones
 * y las cuatro nuevas llegaban vacias al navegador aunque tuvieran 1.180
 * historias entre ellas. Nada fallaba: simplemente no se veian.
 */
function slugsDelCliente(): string[] {
  const archivo = path.resolve(__dirname, '../../../../client/src/lib/issue-order.ts')
  const src = readFileSync(archivo, 'utf8')
  const bloque = src.slice(src.indexOf('ISSUE_ORDER'), src.indexOf('GEOGRAPHIC_SLUGS'))
  return [...bloque.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
}

describe('las categorias de la portada', () => {
  it('son las mismas en el servidor y en el cliente, y en el mismo orden', () => {
    expect(HOMEPAGE_ISSUE_SLUGS).toEqual(slugsDelCliente())
  })

  it('son ocho', () => {
    expect(HOMEPAGE_ISSUE_SLUGS).toHaveLength(8)
  })

  it('ninguna es una seccion geografica', () => {
    // Una seccion geografica se llena por pais, no por asunto: pedirle
    // historias a la portada como si fuera un tema devuelve el mismo material
    // dos veces.
    for (const geo of ['chile-indigena', 'latinoamerica', 'africa', 'asia', 'oceania']) {
      expect(HOMEPAGE_ISSUE_SLUGS).not.toContain(geo)
    }
  })

  it('usa el slug canonico de Economias, no el legado', () => {
    expect(HOMEPAGE_ISSUE_SLUGS).toContain('economias-indigenas')
    expect(HOMEPAGE_ISSUE_SLUGS).not.toContain('desarrollo-sostenible-y-autodeterminado')
  })
})
