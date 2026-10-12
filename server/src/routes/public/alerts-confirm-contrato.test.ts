import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

/**
 * El contrato entre la ruta y el servicio, sin simular el servicio.
 *
 * La ruta traduce los errores de confirmAlert comparando el mensaje exacto
 * ('Confirmation link has expired' / 'Invalid confirmation link'). Los tests de la
 * ruta simulan el servicio con esos mismos literales, y los del servicio usan
 * regex: si alguien cambia la redaccion en el servicio, todo sigue en verde y en
 * produccion cada enlace vencido cae en un 500 que invita a reintentar sin fin.
 * Aqui va el servicio REAL y solo se simula la base.
 */

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

const mockPrisma = vi.hoisted(() => ({
  alertSubscription: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  $disconnect: vi.fn(),
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/brevo.js', () => ({ sendTransactional: vi.fn(), verifyEmail: vi.fn() }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

process.env.CLIENT_URL = 'https://sitio.example'

const { default: app } = await import('../../app.js')

const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CORREO = 'lectora@example.com'
const fila = (extra: Record<string, unknown> = {}) => ({
  id: 'sub-1', email: CORREO, token: TOKEN, topics: ['litio'], confirmedAt: null,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000), active: true, ...extra,
})
const confirmar = () => request(app).post('/api/alerts/confirm').send({ token: TOKEN, email: CORREO })

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.alertSubscription.update.mockResolvedValue({})
  mockPrisma.alertSubscription.updateMany.mockResolvedValue({ count: 0 })
  mockPrisma.alertSubscription.deleteMany.mockResolvedValue({ count: 1 })
})

describe('POST /api/alerts/confirm contra el servicio real', () => {
  it('un enlace vencido da 400 expired, no 500', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue(fila({ expiresAt: new Date(Date.now() - 1000) }))
    const res = await confirmar()
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'expired' })
  })

  it('un token o correo que no existen dan 400 invalid, no 500', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue(null)
    const res = await confirmar()
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid' })
  })

  it('un alta nueva da confirmed', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue(fila())
    const res = await confirmar()
    expect(res.body).toEqual({ success: true, result: 'confirmed' })
  })

  it('un cambio de temas sobre una suscripcion ya confirmada da changed', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue(fila())
    mockPrisma.alertSubscription.updateMany.mockResolvedValue({ count: 1 })
    const res = await confirmar()
    expect(res.body).toEqual({ success: true, result: 'changed' })
  })

  it('un enlace de alta ya usado da already', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue(fila({ confirmedAt: new Date() }))
    const res = await confirmar()
    expect(res.body).toEqual({ success: true, result: 'already' })
  })
})

describe('GET /api/alerts/confirm contra el servicio real', () => {
  it('abrir el enlace no toca la base', async () => {
    const res = await request(app).get(`/api/alerts/confirm?token=${TOKEN}&email=${encodeURIComponent(CORREO)}`)
    expect(res.status).toBe(303)
    for (const fn of Object.values(mockPrisma.alertSubscription)) expect(fn).not.toHaveBeenCalled()
  })
})
