import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { authHeader, TEST_API_KEY, TEST_JWT_SECRET } from '../../test/helpers.js'

/**
 * La API del editor de verticales (D4, Tanda B, item 12). Lo que NO puede
 * fallar en silencio: la guardia de puntaje al liberar en masa, el 409 a
 * enforce con el aprendizaje encendido, el codigo obligatorio al retener, que
 * solo un administrador cambie el modo, y que cada decision deje auditoria.
 */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

const mockPrisma = vi.hoisted(() => ({
  storyCommunityReview: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
  communityReviewMode: { upsert: vi.fn() },
  auditLog: { create: vi.fn(), createMany: vi.fn() },
  story: { count: vi.fn(), findMany: vi.fn() },
  issue: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $disconnect: vi.fn(),
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))
const mockConfig = vi.hoisted(() => ({ learningMode: true }))
vi.mock('../../config.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../config.js')>()
  return { ...real, config: { ...real.config, gate: { ...real.config.gate, get learningMode() { return mockConfig.learningMode } } } }
})

process.env.PUBLIC_API_KEY = TEST_API_KEY
const { default: app } = await import('../../app.js')

const VERTICAL = { id: 'c-mapuche', slug: 'mapuche', name: 'Pueblo Mapuche', active: true, keywords: ['mapuche'], issue_ids: [], mode: 'shadow' }
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const editorHeader = () => ({ Authorization: `Bearer ${jwt.sign({ userId: 'ed-1', email: 'ed@example.com', role: 'editor' }, TEST_JWT_SECRET, { expiresIn: '1h' })}` })

beforeEach(() => {
  vi.clearAllMocks()
  mockConfig.learningMode = true
  mockPrisma.$queryRaw.mockResolvedValue([VERTICAL])
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.story.count.mockResolvedValue(0)
  mockPrisma.story.findMany.mockResolvedValue([])
  mockPrisma.storyCommunityReview.count.mockResolvedValue(0)
  mockPrisma.storyCommunityReview.findMany.mockResolvedValue([])
  mockPrisma.storyCommunityReview.groupBy.mockResolvedValue([])
  mockPrisma.storyCommunityReview.updateMany.mockResolvedValue({ count: 0 })
  mockPrisma.auditLog.create.mockResolvedValue({})
  mockPrisma.auditLog.createMany.mockResolvedValue({ count: 0 })
})

describe('GET /api/admin/reviews/:slug', () => {
  it('401 sin auth', async () => {
    expect((await request(app).get('/api/admin/reviews/mapuche')).status).toBe(401)
  })

  it('404 si la vertical no existe', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    expect((await request(app).get('/api/admin/reviews/nadie').set(authHeader())).status).toBe(404)
  })

  it('la cola va por puntaje y luego por fecha, y filtra por estado', async () => {
    const res = await request(app).get('/api/admin/reviews/mapuche?state=pending&pageSize=10').set(authHeader())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ slug: 'mapuche', mode: 'shadow', total: 0, page: 1, pageSize: 10 })
    const call = mockPrisma.storyCommunityReview.findMany.mock.calls[0][0]
    expect(call.where).toEqual({ communityId: 'c-mapuche', reviewState: 'pending' })
    expect(call.orderBy[0]).toEqual({ gateScore: 'desc' })
    // Por la fecha de la NOTA, no por publishedAt de la fila (null mientras esta pendiente).
    expect(call.orderBy[1]).toEqual({ story: { datePublished: 'desc' } })
  })

  it('400 con un estado que no existe', async () => {
    expect((await request(app).get('/api/admin/reviews/mapuche?state=lo-que-sea').set(authHeader())).status).toBe(400)
  })
})

describe('POST /api/admin/reviews/:slug/decide', () => {
  const fila = { id: 'r1', storyId: UUID(1), communityId: 'c-mapuche', reviewState: 'pending', gateDecision: 'held_for_review', gateScore: 3, gateReasons: ['frame:confrontacion'] }

  it('retener sin codigo: 400 y no escribe', async () => {
    const res = await request(app).post('/api/admin/reviews/mapuche/decide').set(authHeader()).send({ storyId: UUID(1), decision: 'hold' })
    expect(res.status).toBe(400)
    expect(mockPrisma.storyCommunityReview.update).not.toHaveBeenCalled()
  })

  it('retener con codigo: escribe held, quien y cuando, y audita con las razones del gate', async () => {
    mockPrisma.storyCommunityReview.findUnique.mockResolvedValue(fila)
    mockPrisma.storyCommunityReview.update.mockResolvedValue({ ...fila, reviewState: 'held' })
    const res = await request(app)
      .post('/api/admin/reviews/mapuche/decide')
      .set(editorHeader())
      .send({ storyId: UUID(1), decision: 'hold', code: 'out_of_scope', note: 'es de Neuquén, no de Araucanía' })
    expect(res.status).toBe(200)
    const data = mockPrisma.storyCommunityReview.update.mock.calls[0][0].data
    expect(data).toMatchObject({ reviewState: 'held', reviewCode: 'out_of_scope', reviewedBy: 'ed-1' })
    expect(data.reviewedAt).toBeInstanceOf(Date)
    const audit = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({ action: 'community_review.hold', actorId: 'ed-1', targetId: 'r1' })
    expect(audit.metadata).toMatchObject({ slug: 'mapuche', from: 'pending', to: 'held', gateScore: 3, gateReasons: ['frame:confrontacion'], code: 'out_of_scope' })
  })

  it('reabrir devuelve la fila a lo que dijo la maquina y borra la decision', async () => {
    mockPrisma.storyCommunityReview.findUnique.mockResolvedValue({ ...fila, reviewState: 'held', gateDecision: 'auto_publish' })
    mockPrisma.storyCommunityReview.update.mockResolvedValue({})
    const res = await request(app).post('/api/admin/reviews/mapuche/decide').set(authHeader()).send({ storyId: UUID(1), decision: 'reopen' })
    expect(res.status).toBe(200)
    expect(mockPrisma.storyCommunityReview.update.mock.calls[0][0].data).toEqual({ reviewState: 'auto', reviewCode: null, reviewNote: null, reviewedBy: null, reviewedAt: null })
  })

  it('404 si la nota no tiene fila en la vertical', async () => {
    mockPrisma.storyCommunityReview.findUnique.mockResolvedValue(null)
    expect((await request(app).post('/api/admin/reviews/mapuche/decide').set(authHeader()).send({ storyId: UUID(9), decision: 'release' })).status).toBe(404)
  })
})

describe('POST /api/admin/reviews/:slug/bulk-decide', () => {
  const filas = [
    { id: 'r1', storyId: UUID(1), reviewState: 'pending', gateDecision: 'held_for_review', gateScore: 0, gateReasons: [] },
    { id: 'r2', storyId: UUID(2), reviewState: 'pending', gateDecision: 'held_for_review', gateScore: 1, gateReasons: ['listB+corroborated:conflicto'] },
    { id: 'r3', storyId: UUID(3), reviewState: 'pending', gateDecision: 'held_for_review', gateScore: 2, gateReasons: ['listA:condena'] },
  ]

  it('liberar en masa con una señal fuerte: 409 con los ids, y no toca ninguna', async () => {
    mockPrisma.storyCommunityReview.findMany.mockResolvedValue(filas)
    const res = await request(app).post('/api/admin/reviews/mapuche/bulk-decide').set(authHeader()).send({ storyIds: filas.map((f) => f.storyId), decision: 'release' })
    expect(res.status).toBe(409)
    expect(res.body.storyIds).toEqual([UUID(3)])
    expect(mockPrisma.storyCommunityReview.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.auditLog.createMany).not.toHaveBeenCalled()
  })

  it('liberar en masa solo señales debiles: escribe y devuelve el conteo REAL, no el largo de la lista', async () => {
    mockPrisma.storyCommunityReview.findMany.mockResolvedValue(filas.slice(0, 2))
    mockPrisma.storyCommunityReview.updateMany.mockResolvedValue({ count: 1 })
    const res = await request(app)
      .post('/api/admin/reviews/mapuche/bulk-decide')
      .set(authHeader())
      .send({ storyIds: [UUID(1), UUID(2), UUID(7)], decision: 'release' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ updated: 1, missing: [UUID(7)] })
    expect(mockPrisma.auditLog.createMany.mock.calls[0][0].data).toHaveLength(2)
    expect(mockPrisma.auditLog.createMany.mock.calls[0][0].data[0].metadata).toMatchObject({ to: 'released', bulk: true })
  })

  it('retener en masa siempre se permite, aunque haya señales fuertes', async () => {
    mockPrisma.storyCommunityReview.findMany.mockResolvedValue(filas)
    mockPrisma.storyCommunityReview.updateMany.mockResolvedValue({ count: 3 })
    const res = await request(app)
      .post('/api/admin/reviews/mapuche/bulk-decide')
      .set(authHeader())
      .send({ storyIds: filas.map((f) => f.storyId), decision: 'hold', code: 'sensitive' })
    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(3)
    const call = mockPrisma.storyCommunityReview.updateMany.mock.calls[0][0]
    expect(call.data).toMatchObject({ reviewState: 'held', reviewCode: 'sensitive' })
    // Por id de FILA, no de nota: con storyIds no cambiaria nada y nadie lo veria.
    expect(call.where).toEqual({ id: { in: ['r1', 'r2', 'r3'] } })
  })
})

describe('PUT /api/admin/reviews/:slug/mode', () => {
  it('un editor no puede cambiar el modo: 403', async () => {
    const res = await request(app).put('/api/admin/reviews/mapuche/mode').set(editorHeader()).send({ mode: 'enforce' })
    expect(res.status).toBe(403)
    expect(mockPrisma.communityReviewMode.upsert).not.toHaveBeenCalled()
  })

  it('enforce con el aprendizaje encendido: 409 y no escribe', async () => {
    const res = await request(app).put('/api/admin/reviews/mapuche/mode').set(authHeader()).send({ mode: 'enforce' })
    expect(res.status).toBe(409)
    expect(mockPrisma.communityReviewMode.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('enforce con el aprendizaje apagado: escribe, audita y devuelve cuantas se ocultan', async () => {
    mockConfig.learningMode = false
    mockPrisma.story.count.mockResolvedValueOnce(389).mockResolvedValueOnce(185)
    mockPrisma.communityReviewMode.upsert.mockResolvedValue({})
    const res = await request(app).put('/api/admin/reviews/mapuche/mode').set(authHeader()).send({ mode: 'enforce' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ from: 'shadow', to: 'enforce', preview: { visibleNow: 389, visibleAfter: 185, hidden: 204 }, reconciled: null })
    expect(mockPrisma.communityReviewMode.upsert.mock.calls[0][0]).toMatchObject({ where: { communityId: 'c-mapuche' }, create: { mode: 'enforce', updatedBy: 'test-admin-id' } })
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'community_review.mode', metadata: { from: 'shadow', to: 'enforce' } })
  })

  it('mode-preview no escribe nada', async () => {
    mockPrisma.story.count.mockResolvedValueOnce(107).mockResolvedValueOnce(107)
    const res = await request(app).get('/api/admin/reviews/mapuche/mode-preview?mode=shadow').set(authHeader())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ current: 'shadow', mode: 'shadow', hidden: 0 })
    expect(mockPrisma.communityReviewMode.upsert).not.toHaveBeenCalled()
  })
})
