import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, TEST_API_KEY } from '../../test/helpers.js'

/**
 * PATCH de palabras clave de una comunidad (D4, Tanda B, item 15): validado,
 * auditado con antes y despues, y con conciliacion inmediata si la vertical
 * esta en revision. Hasta el 4-oct-2026 solo se cambiaban por SQL.
 */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

const mockPrisma = vi.hoisted(() => ({
  community: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  story: { count: vi.fn(), findMany: vi.fn() },
  issue: { findMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}))
const reconcile = vi.hoisted(() => vi.fn().mockResolvedValue([]))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/communityReview.js', () => ({ reconcileCommunityReviews: reconcile, communitiesUnderReview: vi.fn(), communityReviewStats: vi.fn() }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

process.env.PUBLIC_API_KEY = TEST_API_KEY
const { default: app } = await import('../../app.js')

const esperar = () => new Promise((r) => setTimeout(r, 10))

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.community.findUnique.mockResolvedValue({ slug: 'mapuche', keywords: ['mapuche'] })
  mockPrisma.community.update.mockImplementation(async ({ data }: any) => ({ id: 'c1', slug: 'mapuche', ...data }))
  mockPrisma.auditLog.create.mockResolvedValue({})
})

describe('PATCH /api/admin/communities/:id con keywords', () => {
  it('400 si no es lista, si hay vacias o si supera 40', async () => {
    for (const keywords of ['mapuche', [], ['a'], Array.from({ length: 41 }, (_, i) => `k${i}`)]) {
      const res = await request(app).patch('/api/admin/communities/c1').set(authHeader()).send({ keywords })
      expect(res.status, JSON.stringify(keywords).slice(0, 40)).toBe(400)
    }
    expect(mockPrisma.community.update).not.toHaveBeenCalled()
  })

  it('limpia, deduplica sin distinguir mayusculas, audita antes/despues y concilia si esta en revision', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ mode: 'shadow' }])
    const res = await request(app)
      .patch('/api/admin/communities/c1')
      .set(authHeader())
      .send({ keywords: [' Mapuche ', 'mapuche', 'Wallmapu', 'Puelmapu'] })
    expect(res.status).toBe(200)
    expect(mockPrisma.community.update.mock.calls[0][0].data.keywords).toEqual(['Mapuche', 'Wallmapu', 'Puelmapu'])
    const audit = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({ action: 'community.keywords', targetId: 'c1', actorId: 'test-admin-id' })
    expect(audit.metadata).toEqual({ slug: 'mapuche', from: ['mapuche'], to: ['Mapuche', 'Wallmapu', 'Puelmapu'] })
    await esperar()
    expect(reconcile).toHaveBeenCalledWith({ slugs: ['mapuche'], force: true })
  })

  it('en off no concilia, pero audita igual', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    const res = await request(app).patch('/api/admin/communities/c1').set(authHeader()).send({ keywords: ['mapuche'] })
    expect(res.status).toBe(200)
    await esperar()
    expect(reconcile).not.toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce()
  })

  it('cambiar solo active no audita ni concilia', async () => {
    const res = await request(app).patch('/api/admin/communities/c1').set(authHeader()).send({ active: false })
    expect(res.status).toBe(200)
    expect(mockPrisma.community.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
  })
})

/**
 * Vista previa (11-oct-2026): mide el cambio sin escribir. La pertenencia se
 * coteja por subcadena, asi que una palabra corta arrastra notas ajenas («cam»,
 * 92 notas, 6 sobre la CAM): el editor ve el efecto antes de guardar.
 */
describe('POST /api/admin/communities/:id/keywords-preview', () => {
  const textoDe = (where: unknown) => JSON.stringify(where)
  const nota = (id: string) => ({ id, slug: id, title: `Nota ${id}`, datePublished: '2026-10-10T00:00:00.000Z' })

  beforeEach(() => {
    mockPrisma.community.findUnique.mockResolvedValue({ id: 'c1', keywords: ['mapuche', 'Wallmapu'], issueIds: [] })
    mockPrisma.issue.findMany.mockResolvedValue([])
    mockPrisma.$queryRaw.mockResolvedValue([{ mode: 'shadow' }])
    mockPrisma.story.count.mockResolvedValue(0)
    mockPrisma.story.findMany.mockResolvedValue([])
  })

  it('valida igual que el PATCH y no escribe nada', async () => {
    const res = await request(app).post('/api/admin/communities/c1/keywords-preview').set(authHeader()).send({ keywords: ['a'] })
    expect(res.status).toBe(400)
    const ok = await request(app).post('/api/admin/communities/c1/keywords-preview').set(authHeader()).send({ keywords: ['mapuche'] })
    expect(ok.status).toBe(200)
    expect(mockPrisma.community.update).not.toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('404 si la comunidad no existe', async () => {
    mockPrisma.community.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/api/admin/communities/zz/keywords-preview').set(authHeader()).send({ keywords: ['mapuche'] })
    expect(res.status).toBe(404)
  })

  it('mide pertenencia, no visibilidad, con las dos listas en una transaccion, y cada palabra nueva por si sola', async () => {
    const compartidas = Array.from({ length: 431 }, (_, i) => nota(`s${i}`))
    const soloActual = [nota('a1'), nota('a2')]
    const soloPropuesta = Array.from({ length: 9 }, (_, i) => nota(`p${i}`))
    // Cada consulta se identifica por su where: la propuesta lleva «Puelmapu»; la de una palabra sola lleva take.
    mockPrisma.story.findMany.mockImplementation(async ({ where, take }: any) => {
      if (take) return [nota('k1'), nota('k2'), nota('k3')]
      const t = textoDe(where)
      return t.includes('Puelmapu') && t.includes('Wallmapu') ? [...soloPropuesta, ...compartidas] : [...soloActual, ...compartidas]
    })
    mockPrisma.story.count.mockResolvedValue(12)

    const res = await request(app)
      .post('/api/admin/communities/c1/keywords-preview')
      .set(authHeader())
      .send({ keywords: ['MAPUCHE', 'Wallmapu', 'Puelmapu', 'puelmapu'] })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ mode: 'shadow', actual: 433, propuesta: 440, quitadas: [], keywords: ['MAPUCHE', 'Wallmapu', 'Puelmapu'] })
    // entran = propuesta − actual; salen = actual − propuesta; ejemplos recortados y en el orden de la consulta.
    expect(res.body.entran.total).toBe(9)
    expect(res.body.entran.ejemplos.map((e: any) => e.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
    expect(res.body.salen.total).toBe(2)
    expect(res.body.salen.ejemplos.map((e: any) => e.id)).toEqual(['a1', 'a2'])
    // Solo «Puelmapu» es nueva: «MAPUCHE» ya estaba (sin distinguir mayusculas) y el duplicado se descarta.
    expect(res.body.nuevas).toEqual([{ keyword: 'Puelmapu', notas: 12, ejemplos: [nota('k1'), nota('k2'), nota('k3')] }])

    // Las dos listas se leen juntas, con REPEATABLE READ: la misma foto de la base.
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
    expect(mockPrisma.$transaction.mock.calls[0][0]).toHaveLength(2)
    expect(mockPrisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead' })

    // Pertenencia: la regla de la pagina (publicada, relevancia >= 3) SIN la exclusion del modo y sin NOT.
    const wheres = [...mockPrisma.story.findMany.mock.calls, ...mockPrisma.story.count.mock.calls].map(([a]: any) => textoDe(a.where))
    expect(wheres).toHaveLength(4)
    for (const t of wheres) {
      expect(t).toContain('"status":"published"')
      expect(t).toContain('"relevance":{"gte":3}')
      expect(t).not.toContain('reviewState')
      expect(t).not.toContain('"NOT"')
    }
  })

  it('las palabras que se quitan salen en la respuesta', async () => {
    const res = await request(app).post('/api/admin/communities/c1/keywords-preview').set(authHeader()).send({ keywords: ['mapuche'] })
    expect(res.body.quitadas).toEqual(['Wallmapu'])
    expect(res.body.nuevas).toEqual([])
  })
})
