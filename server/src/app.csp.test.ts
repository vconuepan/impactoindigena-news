import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))
vi.mock('./lib/prisma.js', () => ({ default: { $disconnect: vi.fn() } }))
vi.mock('./services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))
vi.mock('./services/analysis.js', () => ({
  preAssessStories: vi.fn(), assessStory: vi.fn(), selectStories: vi.fn(),
  bulkPreAssess: vi.fn(), bulkAssess: vi.fn(), bulkSelect: vi.fn(),
}))

// El Static Web App declara el origen de R2 en su `connect-src`. La CSP del
// servidor tiene que nombrar el mismo, o una página servida por Express no podría
// leer el snapshot de la portada y fallaría solo en producción, en silencio.
const swaConfig = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../client/public/staticwebapp.config.json', import.meta.url)),
    'utf-8',
  ),
)

function connectSrc(csp: string): string[] {
  const dir = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'))
  return dir ? dir.split(/\s+/).slice(1) : []
}

const swaCsp: string =
  swaConfig.globalHeaders?.['Content-Security-Policy'] ??
  swaConfig.routes.map((r: any) => r.headers?.['Content-Security-Policy']).find(Boolean)
const r2Del_SWA = connectSrc(swaCsp).find((o) => o.startsWith('https://') && o.includes('.r2.dev'))!

// Reiniciar módulos reimporta todo el grafo de la app: pasa de los 5 s por defecto.
vi.setConfig({ testTimeout: 30_000 })

describe('CSP del servidor: R2 en connect-src', () => {
  it('el Static Web App declara un origen de R2 (precondición del test)', () => {
    expect(r2Del_SWA).toBeTruthy()
  })

  it('con R2_PUBLIC_URL configurada, el servidor permite el mismo origen que el SWA', async () => {
    process.env.R2_PUBLIC_URL = `${r2Del_SWA}/`
    vi.resetModules()
    const { default: app } = await import('./app.js')
    const res = await request(app).get('/api/nonexistent-route')

    expect(connectSrc(res.headers['content-security-policy'])).toEqual(["'self'", r2Del_SWA])
  })

  it('sin R2_PUBLIC_URL se queda en self, sin abrir nada de más', async () => {
    delete process.env.R2_PUBLIC_URL
    vi.resetModules()
    const { default: app } = await import('./app.js')
    const res = await request(app).get('/api/nonexistent-route')

    expect(connectSrc(res.headers['content-security-policy'])).toEqual(["'self'"])
  })

  it('r2ConnectOrigin ignora valores que no son URL', async () => {
    const { r2ConnectOrigin } = await import('./app.js')
    expect(r2ConnectOrigin('no es una url')).toBeNull()
    expect(r2ConnectOrigin('')).toBeNull()
    expect(r2ConnectOrigin('https://pub-x.r2.dev/carpeta')).toBe('https://pub-x.r2.dev')
  })
})
