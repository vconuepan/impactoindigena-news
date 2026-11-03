import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  pendingSubscription: { findUnique: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
  $disconnect: vi.fn(),
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

const mockBorrar = vi.hoisted(() => vi.fn())
vi.mock('../../services/supresion.js', async (original) => ({
  ...(await original<typeof import('../../services/supresion.js')>()),
  borrarDelBoletin: mockBorrar,
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')
const { BrevoNoRespondeError } = await import('../../services/supresion.js')

describe('DELETE /api/admin/subscribers/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.auditLog.create.mockResolvedValue({})
  })

  it('saca a la persona del boletín en Brevo, no solo borra la fila', async () => {
    mockPrisma.pendingSubscription.findUnique.mockResolvedValue({ email: 'Ana@x.cl' })
    mockBorrar.mockResolvedValue({ suscripciones: 2, brevo: 'borrado' })

    const res = await request(app).delete('/api/admin/subscribers/ps-1').set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, suscripciones: 2, brevo: 'borrado' })
    expect(mockBorrar).toHaveBeenCalledWith('Ana@x.cl')
    expect(mockPrisma.pendingSubscription.delete, 'volvio el borrado de la fila sola').not.toHaveBeenCalled()
    expect(JSON.stringify(mockPrisma.auditLog.create.mock.calls[0][0])).not.toContain('Ana@x.cl')
  })

  it('404 si la fila no existe', async () => {
    mockPrisma.pendingSubscription.findUnique.mockResolvedValue(null)

    const res = await request(app).delete('/api/admin/subscribers/nada').set(authHeader())

    expect(res.status).toBe(404)
    expect(mockBorrar).not.toHaveBeenCalled()
  })

  it('502 si Brevo no responde', async () => {
    mockPrisma.pendingSubscription.findUnique.mockResolvedValue({ email: 'ana@x.cl' })
    mockBorrar.mockRejectedValue(new BrevoNoRespondeError())

    const res = await request(app).delete('/api/admin/subscribers/ps-1').set(authHeader())

    expect(res.status).toBe(502)
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
  })
})
