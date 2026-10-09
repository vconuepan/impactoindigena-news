import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

// Sin mock de express-rate-limit: lo que se comprueba es el comportamiento real.
vi.mock('./lib/prisma.js', () => ({
  default: { $queryRaw: vi.fn().mockResolvedValue([1]), $disconnect: vi.fn() },
}))
vi.mock('./services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))
vi.mock('./services/analysis.js', () => ({
  preAssessStories: vi.fn(), assessStory: vi.fn(), selectStories: vi.fn(),
  bulkPreAssess: vi.fn(), bulkAssess: vi.fn(), bulkSelect: vi.fn(),
}))

process.env.RATE_LIMIT_PUBLIC_MAX = '2'

const { default: app } = await import('./app.js')

describe('/api/health detrás del limitador público', () => {
  // Cada llamada consulta la base: sin tope, una sonda pública es un amplificador.
  it('responde 429 al pasar el máximo por ventana', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200)
    expect((await request(app).get('/api/health')).status).toBe(200)
    expect((await request(app).get('/api/health')).status).toBe(429)
  })
})
