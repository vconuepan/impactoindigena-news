import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { authHeader, sampleUser, TEST_API_KEY } from '../../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  refreshToken: {
    deleteMany: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }))

// El borrado completo vive en services/supresion.ts y tiene sus propias pruebas;
// aquí se prueba que la ruta lo llame bien y traduzca sus errores.
const mockSuprimir = vi.hoisted(() => vi.fn())
vi.mock('../../services/supresion.js', async (original) => ({
  ...(await original<typeof import('../../services/supresion.js')>()),
  suprimirPorCorreo: mockSuprimir,
}))
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

describe('Admin Users API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/admin/users', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/admin/users')
      expect(res.status).toBe(401)
    })

    it('returns all users', async () => {
      const users = [
        { id: 'u1', email: 'a@b.com', name: 'Alice', role: 'admin', createdAt: new Date(), updatedAt: new Date() },
        { id: 'u2', email: 'c@d.com', name: 'Bob', role: 'editor', createdAt: new Date(), updatedAt: new Date() },
      ]
      mockPrisma.user.findMany.mockResolvedValue(users)

      const res = await request(app)
        .get('/api/admin/users')
        .set(authHeader())
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })
  })

  describe('POST /api/admin/users', () => {
    it('creates a user', async () => {
      const created = { id: 'u1', email: 'new@test.com', name: 'New User', role: 'editor', createdAt: new Date(), updatedAt: new Date() }
      mockPrisma.user.create.mockResolvedValue(created)

      const res = await request(app)
        .post('/api/admin/users')
        .set(authHeader())
        .send({ email: 'new@test.com', name: 'New User', password: 'securepass123', role: 'editor' })
      expect(res.status).toBe(201)
      expect(res.body.email).toBe('new@test.com')
    })

    it('returns 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set(authHeader())
        .send({})
      expect(res.status).toBe(400)
    })

    it('returns 400 for password too short', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set(authHeader())
        .send({ email: 'new@test.com', name: 'New User', password: 'short' })
      expect(res.status).toBe(400)
    })

    it('returns 409 for duplicate email', async () => {
      mockPrisma.user.create.mockRejectedValue({ code: 'P2002' })

      const res = await request(app)
        .post('/api/admin/users')
        .set(authHeader())
        .send({ email: 'dupe@test.com', name: 'Dupe', password: 'securepass123' })
      expect(res.status).toBe(409)
      expect(res.body.error).toContain('already exists')
    })
  })

  describe('PUT /api/admin/users/:id', () => {
    it('updates a user name', async () => {
      const updated = { id: 'u1', email: 'a@b.com', name: 'Updated', role: 'admin', createdAt: new Date(), updatedAt: new Date() }
      mockPrisma.user.update.mockResolvedValue(updated)

      const res = await request(app)
        .put('/api/admin/users/u1')
        .set(authHeader())
        .send({ name: 'Updated' })
      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Updated')
    })

    it('updates a user role', async () => {
      const updated = { id: 'u1', email: 'a@b.com', name: 'Alice', userType: 'VEEDOR', createdAt: new Date(), updatedAt: new Date() }
      mockPrisma.user.update.mockResolvedValue(updated)

      const res = await request(app)
        .put('/api/admin/users/u1')
        .set(authHeader())
        .send({ userType: 'VEEDOR' })
      expect(res.status).toBe(200)
      expect(res.body.userType).toBe('VEEDOR')
    })

    it('returns 400 for empty body', async () => {
      const res = await request(app)
        .put('/api/admin/users/u1')
        .set(authHeader())
        .send({})
      expect(res.status).toBe(400)
    })

    it('returns 404 for unknown user', async () => {
      mockPrisma.user.update.mockRejectedValue({ code: 'P2025' })

      const res = await request(app)
        .put('/api/admin/users/unknown')
        .set(authHeader())
        .send({ name: 'Ghost' })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/admin/users/:id', () => {
    const RESULTADO = { cuentas: 1, suscripciones: 1, alertas: 2, enlaces: 0, comentarios: 0, brevo: 'borrado' }

    it('suprime todo lo del correo de la cuenta, no solo la fila del usuario', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(sampleUser({ id: 'u1', email: 'ana@x.cl' }))
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 })
      mockSuprimir.mockResolvedValue(RESULTADO)

      const res = await request(app)
        .delete('/api/admin/users/u1')
        .set(authHeader())

      expect(res.status).toBe(204)
      expect(mockSuprimir).toHaveBeenCalledWith({
        correo: 'ana@x.cl',
        userId: 'u1',
        protegerUserId: 'test-admin-id',
      })
      expect(mockPrisma.user.delete, 'volvio el borrado a secas de la fila').not.toHaveBeenCalled()
    })

    it('revokes tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(sampleUser({ id: 'u1' }))
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 })
      mockSuprimir.mockResolvedValue(RESULTADO)

      await request(app)
        .delete('/api/admin/users/u1')
        .set(authHeader())

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    })

    it('returns 404 for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .delete('/api/admin/users/unknown')
        .set(authHeader())
      expect(res.status).toBe(404)
      expect(mockSuprimir).not.toHaveBeenCalled()
    })

    it('si Brevo no responde, 502 y no se borra nada', async () => {
      const { BrevoNoRespondeError } = await import('../../services/supresion.js')
      mockPrisma.user.findUnique.mockResolvedValue(sampleUser({ id: 'u1' }))
      mockSuprimir.mockRejectedValue(new BrevoNoRespondeError())

      const res = await request(app)
        .delete('/api/admin/users/u1')
        .set(authHeader())

      expect(res.status).toBe(502)
      expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled()
    })

    it('blocks deleting an account that shares the operator’s email', async () => {
      const { SupresionPropiaError } = await import('../../services/supresion.js')
      mockPrisma.user.findUnique.mockResolvedValue(sampleUser({ id: 'u9' }))
      mockSuprimir.mockRejectedValue(new SupresionPropiaError())

      const res = await request(app)
        .delete('/api/admin/users/u9')
        .set(authHeader())

      expect(res.status).toBe(400)
    })

    it('blocks self-delete', async () => {
      // authHeader() generates a JWT with userId 'test-admin-id'
      const res = await request(app)
        .delete('/api/admin/users/test-admin-id')
        .set(authHeader())
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Cannot delete your own account')
    })
  })

  describe('PUT /api/admin/users/:id/password', () => {
    it('resets a user password', async () => {
      mockPrisma.user.update.mockResolvedValue({})
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .put('/api/admin/users/u1/password')
        .set(authHeader())
        .send({ password: 'newsecurepass123' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Password reset')
    })

    it('returns 400 for password too short', async () => {
      const res = await request(app)
        .put('/api/admin/users/u1/password')
        .set(authHeader())
        .send({ password: 'short' })

      expect(res.status).toBe(400)
    })

    it('returns 400 for missing password', async () => {
      const res = await request(app)
        .put('/api/admin/users/u1/password')
        .set(authHeader())
        .send({})

      expect(res.status).toBe(400)
    })

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .put('/api/admin/users/u1/password')
        .send({ password: 'newsecurepass123' })

      expect(res.status).toBe(401)
    })

    it('revokes tokens after reset', async () => {
      mockPrisma.user.update.mockResolvedValue({})
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 })

      await request(app)
        .put('/api/admin/users/u1/password')
        .set(authHeader())
        .send({ password: 'newsecurepass123' })

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      })
    })
  })
})
