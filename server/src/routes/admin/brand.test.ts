import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { authHeader, TEST_JWT_SECRET, TEST_API_KEY } from '../../test/helpers.js'

/** «Criterio por marca» (D5, entrega 2, ítem 11): lectura, vista previa e interruptor. */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))
const mockPrisma = vi.hoisted(() => ({
  brandLaneCall: { count: vi.fn() },
  storyBrandAssessment: { count: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $disconnect: vi.fn(),
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))
process.env.PUBLIC_API_KEY = TEST_API_KEY
const { default: app } = await import('../../app.js')
const { quedariaVisible } = await import('../../services/brandAdmin.js')

const editorHeader = () => ({ Authorization: `Bearer ${jwt.sign({ userId: 'ed-1', email: 'ed@example.com', role: 'editor' }, TEST_JWT_SECRET, { expiresIn: '1h' })}` })
const fila = (extra: Record<string, unknown> = {}) => ({
  community_id: 'c-arauc', slug: 'wallmapu-araucania', name: 'Araucanía', criterion: 'territorial', mode: 'shadow', rescue_mode: 'off',
  guidelines_version: 1, largo: 5000, daily_call_cap: 20, daily_target: 3, relevance_min: 5, d4_mode: 'shadow', ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$queryRaw.mockResolvedValue([fila()])
  mockPrisma.$executeRaw.mockResolvedValue(1)
  mockPrisma.auditLog.create.mockResolvedValue({})
  mockPrisma.brandLaneCall.count.mockResolvedValue(10)
  mockPrisma.storyBrandAssessment.count.mockResolvedValue(3)
  mockPrisma.storyBrandAssessment.findMany.mockResolvedValue([
    { brandTitle: null, brandSummary: null, sensitiveFlagsJudge: [], sensitiveFlagsFilter: [], story: { sourceTitle: 'Inauguran CESFAM en Angol', title: null, summary: null, narrativeFrame: null } },
    { brandTitle: null, brandSummary: null, sensitiveFlagsJudge: ['violencia'], sensitiveFlagsFilter: [], story: { sourceTitle: 'Agresión en Renaico', title: null, summary: null, narrativeFrame: null } },
  ])
})

describe('GET /api/admin/brand', () => {
  it('401 sin auth', async () => {
    expect((await request(app).get('/api/admin/brand')).status).toBe(401)
  })

  it('muestra cada marca con lo de hoy y la vista previa «si encendieras»', async () => {
    const res = await request(app).get('/api/admin/brand').set(editorHeader())
    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      slug: 'wallmapu-araucania', mode: 'shadow', tienePautas: true, d4Mode: 'shadow',
      hoy: { llamadas: 10 },
      siEncendieras: { elegidas: 2, visibles: 1, aLaCola: 1, dias: 7 },
    })
  })
})

describe('PUT /api/admin/brand/:slug/mode', () => {
  const put = (body: object, h = authHeader()) => request(app).put('/api/admin/brand/wallmapu-araucania/mode').set(h).send(body)

  it('solo administradores', async () => {
    expect((await put({ mode: 'enforce' }, editorHeader())).status).toBe(403)
  })

  it('400 sin modo', async () => {
    expect((await put({})).status).toBe(400)
  })

  it('se niega sin pautas cargadas', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([fila({ largo: 0, mode: 'off' })])
    const res = await put({ mode: 'shadow' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/pautas/)
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled()
  })

  it('se niega a aplicar si D4 no revisa la vertical (diseño 7.1)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([fila({ d4_mode: null })])
    const res = await put({ mode: 'enforce' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/D4/)
  })

  it('Araucanía no tiene rescate', async () => {
    expect((await put({ rescueMode: 'shadow' })).status).toBe(409)
  })

  it('cambia el modo, lo audita y deja el resto como estaba', async () => {
    const res = await put({ mode: 'enforce' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ from: { mode: 'shadow', rescueMode: 'off' }, to: { mode: 'enforce', rescueMode: 'off' } })
    expect(mockPrisma.$executeRaw.mock.calls[0].slice(1)).toEqual(expect.arrayContaining(['enforce', 'off', 'c-arauc']))
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'brand.mode', targetId: 'c-arauc' })
  })
})

describe('quedariaVisible', () => {
  it('sin banderas ni retención del gate, sí; con bandera del juez o término de la Lista A, no', () => {
    expect(quedariaVisible({ titulo: 'Inauguran CESFAM en Angol', resumen: null, encuadre: null, juez: [], filtro: [] }, 'wallmapu-araucania')).toBe(true)
    expect(quedariaVisible({ titulo: 'Inauguran CESFAM en Angol', resumen: null, encuadre: null, juez: ['victimas'], filtro: [] }, 'wallmapu-araucania')).toBe(false)
    expect(quedariaVisible({ titulo: 'Homicidio en Angol', resumen: null, encuadre: null, juez: [], filtro: [] }, 'wallmapu-araucania')).toBe(false)
  })
})
