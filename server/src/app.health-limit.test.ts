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

  // Detras de Static Web Apps la IP del socket es la salida del proxy, la misma
  // para todos los lectores. El limitador cuenta por el lector que viene en
  // X-Forwarded-For: uno que agota su cupo no deja sin API a los demas.
  it('dos lectores distintos no comparten el cupo, y falsificar un prefijo no regala uno nuevo', async () => {
    const SWA = '20.50.1.9'
    const lector = (ip: string, prefijo = '') =>
      request(app).get('/api/health').set('X-Forwarded-For', `${prefijo}${ip}:40000, ${SWA}`)

    expect((await lector('203.0.113.5')).status).toBe(200)
    expect((await lector('203.0.113.5')).status).toBe(200)
    expect((await lector('203.0.113.5')).status).toBe(429)
    expect((await lector('203.0.113.5', '9.9.9.9, ')).status).toBe(429) // el prefijo falso no cambia al lector
    expect((await lector('198.51.100.7')).status).toBe(200) // otro lector, su propio cupo
  })
})
