import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { authHeader, TEST_JWT_SECRET, TEST_API_KEY } from '../../test/helpers.js'

/** Lista de clientes del aviso de independencia (regla 2, 25-nov-2026). */
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))
const mockPrisma = vi.hoisted(() => ({
  disclosureClient: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  storyDisclosureDismissal: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  story: { findMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $disconnect: vi.fn(),
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))
process.env.PUBLIC_API_KEY = TEST_API_KEY
const { default: app } = await import('../../app.js')

const editorHeader = () => ({ Authorization: `Bearer ${jwt.sign({ userId: 'ed-1', email: 'ed@example.com', role: 'editor' }, TEST_JWT_SECRET, { expiresIn: '1h' })}` })
const BASE = '/api/admin/aviso-clientes'
const cliente = { id: 'c1', name: 'Minera Ejemplo del Norte', aliases: ['MENSA'], vertical: 'legal', rut: null, endedOn: null }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.auditLog.create.mockResolvedValue({})
  mockPrisma.disclosureClient.findMany.mockResolvedValue([cliente])
  mockPrisma.disclosureClient.findUnique.mockResolvedValue(cliente)
  mockPrisma.disclosureClient.create.mockImplementation(async ({ data }: any) => ({ id: 'nuevo', ...data }))
  mockPrisma.storyDisclosureDismissal.findMany.mockResolvedValue([])
})

describe('acceso', () => {
  it('401 sin sesión', async () => {
    expect((await request(app).get(BASE)).status).toBe(401)
  })

  it('403 para un editor: la lista puede estar bajo secreto profesional', async () => {
    expect((await request(app).get(BASE).set(editorHeader())).status).toBe(403)
  })

  it('200 para un administrador', async () => {
    const res = await request(app).get(BASE).set(authHeader())
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })
})

describe('POST: solo organizaciones', () => {
  it('crea y deja constancia en audit_log', async () => {
    const res = await request(app).post(BASE).set(authHeader())
      .send({ name: 'Asociación Ejemplo', aliases: ['Ejemplo'], vertical: 'ai', rut: '65.191.983-5' })
    expect(res.status).toBe(201)
    expect(mockPrisma.disclosureClient.create).toHaveBeenCalled()
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('disclosure_client.create')
  })

  it('rechaza el RUT de una persona natural', async () => {
    const res = await request(app).post(BASE).set(authHeader())
      .send({ name: 'Juan Ejemplo', vertical: 'legal', rut: '12.345.678-5' })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/persona natural/)
    expect(mockPrisma.disclosureClient.create).not.toHaveBeenCalled()
  })

  it('rechaza un alias de menos de tres letras', async () => {
    const res = await request(app).post(BASE).set(authHeader())
      .send({ name: 'Asociación Ejemplo', aliases: ['AE'], vertical: 'ai' })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/muy corto/)
  })

  it('rechaza una vertical que no es ai ni legal', async () => {
    const res = await request(app).post(BASE).set(authHeader()).send({ name: 'Asociación Ejemplo', vertical: 'org' })
    expect(res.status).toBe(400)
  })

  it('503 con mensaje claro si la migración no está aplicada', async () => {
    mockPrisma.disclosureClient.findMany.mockRejectedValue(Object.assign(new Error('x'), { code: 'P2021' }))
    const res = await request(app).get(BASE).set(authHeader())
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/20261125000000_aviso_clientes/)
  })
})

describe('notas que lo mencionan y descarte', () => {
  it('devuelve solo las notas publicadas que lo nombran, con su descarte', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 's1', slug: 'a', title: 'Acuerdo con MENSA', datePublished: new Date('2026-11-01'), sourceTitle: '', summary: '', quote: null, quoteAttribution: null, body: null },
      { id: 's2', slug: 'b', title: 'Semillas nativas', datePublished: new Date('2026-11-02'), sourceTitle: '', summary: '', quote: null, quoteAttribution: null, body: null },
    ])
    mockPrisma.storyDisclosureDismissal.findMany.mockResolvedValue([{ storyId: 's1', reason: 'homónimo', dismissedBy: 'x', createdAt: new Date() }])
    const res = await request(app).get(`${BASE}/c1/notas`).set(authHeader())
    expect(res.status).toBe(200)
    expect(res.body.data.map((n: any) => n.id)).toEqual(['s1'])
    expect(res.body.data[0].dismissed.reason).toBe('homónimo')
  })

  it('descartar pide motivo y queda en audit_log', async () => {
    expect((await request(app).put(`${BASE}/c1/notas/s1/descarte`).set(authHeader()).send({ reason: '' })).status).toBe(400)
    mockPrisma.storyDisclosureDismissal.upsert.mockResolvedValue({ id: 'd1' })
    const res = await request(app).put(`${BASE}/c1/notas/s1/descarte`).set(authHeader()).send({ reason: 'Es un fundo homónimo, no la empresa.' })
    expect(res.status).toBe(200)
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('disclosure.dismiss')
  })
})
