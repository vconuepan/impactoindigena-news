import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const { mockStoryCount, mockFeedCount } = vi.hoisted(() => ({
  mockStoryCount: vi.fn(),
  mockFeedCount: vi.fn(),
}))

vi.mock('../../lib/prisma.js', () => ({
  default: {
    story: { count: mockStoryCount },
    feed: { count: mockFeedCount },
  },
}))

const { default: app } = await import('../../app.js')

describe('GET /api/stats/daily', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFeedCount.mockResolvedValue(119)
  })

  it('cuenta sobre una ventana movil de 24 h, no sobre el dia calendario UTC', async () => {
    mockStoryCount.mockResolvedValue(23)

    const res = await request(app).get('/api/stats/daily')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ crawled24h: 23, published24h: 23, activeFeeds: 119 })

    // El filtro debe ser un `gte` abierto hacia el presente. Un corte por dia
    // calendario traeria ademas un `lt` (fin del dia) y arrancaria a medianoche.
    for (const call of mockStoryCount.mock.calls) {
      const dateFilter = call[0].where.dateCrawled ?? call[0].where.datePublished
      expect(dateFilter).toBeDefined()
      expect(dateFilter.lt).toBeUndefined()
      expect(dateFilter.gte).toBeInstanceOf(Date)

      const ageMs = Date.now() - dateFilter.gte.getTime()
      expect(ageMs).toBeGreaterThan(23.9 * 60 * 60 * 1000)
      expect(ageMs).toBeLessThan(24.1 * 60 * 60 * 1000)

      // La regresion concreta: a las 09:00 UTC un corte por dia empezaria hace
      // 9 h y perderia la tanda de las 11:00 UTC de ayer.
      expect(dateFilter.gte.getUTCHours()).not.toBe(0)
    }
  })

  it('solo cuenta como seleccionadas las historias publicadas', async () => {
    mockStoryCount.mockResolvedValue(5)

    await request(app).get('/api/stats/daily')

    const publishedCall = mockStoryCount.mock.calls.find((c) => c[0].where.datePublished)
    expect(publishedCall?.[0].where.status).toBe('published')
  })

  it('responde 500 cuando la consulta falla', async () => {
    mockStoryCount.mockRejectedValue(new Error('db caida'))

    const res = await request(app).get('/api/stats/daily')

    expect(res.status).toBe(500)
  })
})
