import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { authHeader, TEST_API_KEY, TEST_JWT_SECRET } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  auditLog: { create: vi.fn() },
  $disconnect: vi.fn(),
}))
vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

const mockSupresion = vi.hoisted(() => ({ suprimirPorCorreo: vi.fn(), vistaPreviaSupresion: vi.fn() }))
vi.mock('../../services/supresion.js', async (original) => ({
  ...(await original<typeof import('../../services/supresion.js')>()),
  ...mockSupresion,
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')
const { BrevoNoRespondeError, SupresionPropiaError } = await import('../../services/supresion.js')

const editor = () => ({
  Authorization: `Bearer ${jwt.sign({ userId: 'ed-1', email: 'ed@test.com', role: 'editor' }, TEST_JWT_SECRET, { expiresIn: '15m' })}`,
})
const RESULTADO = { cuentas: 1, suscripciones: 2, alertas: 1, enlaces: 0, comentarios: 0, brevo: 'borrado' }

describe('Admin · supresión por correo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.auditLog.create.mockResolvedValue({})
    mockSupresion.suprimirPorCorreo.mockResolvedValue(RESULTADO)
    mockSupresion.vistaPreviaSupresion.mockResolvedValue({ ...RESULTADO, brevo: 'esta' })
  })

  it('es solo para administradores: un editor recibe 403', async () => {
    const res = await request(app).post('/api/admin/supresion').set(editor()).send({ email: 'ana@x.cl', confirm: 'SUPRIMIR' })

    expect(res.status).toBe(403)
    expect(mockSupresion.suprimirPorCorreo).not.toHaveBeenCalled()
  })

  it('la vista previa cuenta y no borra', async () => {
    const res = await request(app).post('/api/admin/supresion/vista-previa').set(authHeader()).send({ email: 'ana@x.cl' })

    expect(res.status).toBe(200)
    expect(res.body.brevo).toBe('esta')
    expect(mockSupresion.suprimirPorCorreo).not.toHaveBeenCalled()
  })

  it('sin la confirmación escrita no borra', async () => {
    const res = await request(app).post('/api/admin/supresion').set(authHeader()).send({ email: 'ana@x.cl' })

    expect(res.status).toBe(400)
    expect(mockSupresion.suprimirPorCorreo).not.toHaveBeenCalled()
  })

  it('rechaza lo que no es un correo', async () => {
    const res = await request(app).post('/api/admin/supresion').set(authHeader()).send({ email: 'ana', confirm: 'SUPRIMIR' })

    expect(res.status).toBe(400)
  })

  it('suprime protegiendo la cuenta de quien opera', async () => {
    const res = await request(app)
      .post('/api/admin/supresion')
      .set(authHeader())
      .send({ email: ' ana@x.cl ', confirm: 'SUPRIMIR' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(RESULTADO)
    expect(mockSupresion.suprimirPorCorreo).toHaveBeenCalledWith({
      correo: 'ana@x.cl',
      protegerUserId: 'test-admin-id',
    })
  })

  it('el registro guarda quién y cuántas filas, NUNCA el correo suprimido', async () => {
    await request(app).post('/api/admin/supresion').set(authHeader()).send({ email: 'ana@x.cl', confirm: 'SUPRIMIR' })

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
    const registro = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(registro.action).toBe('person.suppress')
    expect(registro.metadata).toEqual(RESULTADO)
    expect(JSON.stringify(registro), 'el correo suprimido quedo guardado en la constancia').not.toContain('ana@x.cl')
  })

  it('si Brevo no responde, 502', async () => {
    mockSupresion.suprimirPorCorreo.mockRejectedValue(new BrevoNoRespondeError())

    const res = await request(app).post('/api/admin/supresion').set(authHeader()).send({ email: 'ana@x.cl', confirm: 'SUPRIMIR' })

    expect(res.status).toBe(502)
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('el propio correo de quien opera, 400', async () => {
    mockSupresion.suprimirPorCorreo.mockRejectedValue(new SupresionPropiaError())

    const res = await request(app).post('/api/admin/supresion').set(authHeader()).send({ email: 'admin@test.com', confirm: 'SUPRIMIR' })

    expect(res.status).toBe(400)
  })
})
