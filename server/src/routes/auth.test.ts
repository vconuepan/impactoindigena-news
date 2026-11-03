import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { sampleUser, TEST_API_KEY } from '../test/helpers.js'

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  communityMember: { findMany: vi.fn() },
  digestExclusion: { findMany: vi.fn() },
  communityPost: { findMany: vi.fn() },
  pendingSubscription: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  alertSubscription: { findMany: vi.fn(), deleteMany: vi.fn() },
  feedback: { findMany: vi.fn(), deleteMany: vi.fn() },
  magicLink: { findMany: vi.fn(), deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $disconnect: vi.fn(),
}))

// Brevo se mockea: el borrado de cuenta ahora lo llama siempre (por id o por
// correo), y sin esto los tests irian a la red real.
const mockBrevo = vi.hoisted(() => ({ deleteContact: vi.fn(), updateContact: vi.fn(), getContact: vi.fn() }))
vi.mock('../services/brevo.js', () => mockBrevo)

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY
// helpers.ts sets JWT_SECRET, but we set it explicitly here for clarity
process.env.JWT_SECRET = 'test-jwt-secret-for-auth-routes-padded'

// Pre-computed bcrypt hash for 'testpassword' (4 rounds, generated via bcryptjs)
const testPasswordHash = '$2b$04$a7oe401dL9h9L7VNbNSZJObgY3lSlqg30AUD7GB1Tut7MlkoCCdUC'

const { default: app } = await import('../app.js')
const { generateAccessToken } = await import('../services/auth.js')

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/auth/login', () => {
    it('returns access token and user on valid credentials', async () => {
      const user = sampleUser({ passwordHash: testPasswordHash })
      mockPrisma.user.findUnique.mockResolvedValue(user)
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1', token: 'rt' })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'testpassword' })

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBeDefined()
      expect(res.body.user.email).toBe('admin@test.com')
      expect(res.body.user.name).toBe('Test Admin')
      expect(res.body.user.role).toBe('admin')
      // Should not expose passwordHash
      expect(res.body.user.passwordHash).toBeUndefined()
    })

    it('returns 401 for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'testpassword' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid email or password')
    })

    it('returns 401 for wrong password', async () => {
      const user = sampleUser({ passwordHash: testPasswordHash })
      mockPrisma.user.findUnique.mockResolvedValue(user)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'wrongpassword' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid email or password')
    })

    it('returns 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({})

      expect(res.status).toBe(400)
    })

    it('sets refresh token cookie with strict sameSite in dev', async () => {
      const user = sampleUser({ passwordHash: testPasswordHash })
      mockPrisma.user.findUnique.mockResolvedValue(user)
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1', token: 'rt' })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'testpassword' })

      expect(res.status).toBe(200)
      const cookies = res.headers['set-cookie']
      expect(cookies).toBeDefined()
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies
      expect(cookieStr).toContain('refresh_token')
      expect(cookieStr).toContain('HttpOnly')
      expect(cookieStr).toContain('SameSite=Lax')
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('returns 401 without refresh cookie', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('No refresh token')
    })

    it('returns new access token with valid refresh cookie', async () => {
      const user = { id: 'user-1', email: 'admin@test.com', role: 'admin' }
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: 'valid-refresh',
        userId: 'user-1',
        familyId: 'family-abc',
        rotatedAt: null,
        user,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      })
      mockPrisma.refreshToken.update.mockResolvedValue({})
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-2', token: 'new-refresh' })

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Origin', 'http://localhost:5173') // CSRF defense requires a trusted Origin
        .set('Cookie', 'refresh_token=valid-refresh')

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBeDefined()
    })

    it('returns 401 for invalid refresh token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', 'refresh_token=invalid-token')

      expect(res.status).toBe(401)
    })

    it('returns 401 on token reuse detection', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: 'reused-token',
        userId: 'user-1',
        familyId: 'family-abc',
        rotatedAt: new Date(), // already rotated = reuse
        user: { id: 'user-1', email: 'admin@test.com', role: 'admin' },
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      })
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 })

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', 'refresh_token=reused-token')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Refresh token reuse detected')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('clears refresh cookie', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', 'refresh_token=some-token')

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Logged out')
    })

    it('succeeds even without cookie', async () => {
      const res = await request(app)
        .post('/api/auth/logout')

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Logged out')
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns current user with valid JWT', async () => {
      const token = generateAccessToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' })
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.email).toBe('admin@test.com')
    })

    it('returns 401 without authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me')

      expect(res.status).toBe(401)
    })

    it('returns 401 for invalid JWT', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')

      expect(res.status).toBe(401)
    })
  })

  describe('PUT /api/auth/password', () => {
    it('returns 200 when current password is correct', async () => {
      const token = generateAccessToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' })
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: testPasswordHash,
      })
      mockPrisma.user.update.mockResolvedValue({})
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'testpassword', newPassword: 'newpassword123' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Password changed')
    })

    it('returns 401 when current password is wrong', async () => {
      const token = generateAccessToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' })
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: testPasswordHash,
      })

      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword123' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Current password is incorrect')
    })

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .put('/api/auth/password')
        .send({ currentPassword: 'old', newPassword: 'newpassword123' })

      expect(res.status).toBe(401)
    })

    it('returns 400 for missing fields', async () => {
      const token = generateAccessToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' })

      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(400)
    })

    it('returns 400 when new password is too short', async () => {
      const token = generateAccessToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' })

      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'testpassword', newPassword: 'short' })

      expect(res.status).toBe(400)
    })
  })

  describe('Account data (ARCO)', () => {
    const memberToken = () => generateAccessToken({ id: 'user-1', email: 'member@example.com', role: 'veedor' })

    it('exports all of the member personal data as JSON', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'member@example.com', name: 'Miembro' })
      mockPrisma.communityMember.findMany.mockResolvedValue([])
      mockPrisma.digestExclusion.findMany.mockResolvedValue([])
      mockPrisma.communityPost.findMany.mockResolvedValue([])
      mockPrisma.pendingSubscription.findMany.mockResolvedValue([])
      mockPrisma.alertSubscription.findMany.mockResolvedValue([])
      mockPrisma.feedback.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/auth/export')
        .set('Authorization', `Bearer ${memberToken()}`)

      expect(res.status).toBe(200)
      expect(res.headers['content-disposition']).toContain('attachment')
      expect(res.body.profile.email).toBe('member@example.com')
      expect(res.body).toHaveProperty('communityMemberships')
      expect(res.body).toHaveProperty('newsletterSubscriptions')
      expect(mockPrisma.auditLog.create).toHaveBeenCalled()
    })

    it('rejects account deletion without the typed confirmation', async () => {
      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${memberToken()}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('confirmation_required')
      expect(mockPrisma.user.delete).not.toHaveBeenCalled()
    })

    /**
     * Lo que la base guarda de member@example.com. El borrado pasa por
     * services/supresion.ts, que busca candidatas por correo y borra por id.
     */
    function sembrarSupresion(suscripciones: { id: string; plunkContactId: string | null }[] = []) {
      const fila = (id: string) => ({ id, email: 'member@example.com' })
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'member@example.com' })
      mockPrisma.user.findMany.mockResolvedValue([fila('user-1')])
      mockPrisma.pendingSubscription.findMany.mockResolvedValue(
        suscripciones.map((s) => ({ ...s, email: 'member@example.com' })),
      )
      mockPrisma.alertSubscription.findMany.mockResolvedValue([fila('al-1')])
      mockPrisma.magicLink.findMany.mockResolvedValue([fila('ml-1')])
      mockPrisma.feedback.findMany.mockResolvedValue([fila('fb-1')])
      for (const m of ['user', 'pendingSubscription', 'alertSubscription', 'magicLink', 'feedback'] as const) {
        mockPrisma[m].deleteMany.mockImplementation(async ({ where }: any) => ({ count: where.id.in.length }))
      }
    }

    it('deletes the account, orphan records by email, and audits', async () => {
      sembrarSupresion()
      mockBrevo.deleteContact.mockResolvedValue(undefined)

      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${memberToken()}`)
        .send({ confirm: 'ELIMINAR' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['user-1'] } } })
      expect(mockPrisma.magicLink.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['ml-1'] } } })
      expect(mockPrisma.alertSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['al-1'] } } })
      expect(mockPrisma.feedback.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['fb-1'] } } })
      expect(mockPrisma.auditLog.create).toHaveBeenCalled()
      const registro = JSON.stringify(mockPrisma.auditLog.create.mock.calls[0][0])
      expect(registro, 'el correo del titular quedo en el registro de su propio borrado').not.toContain('member@example.com')
    })

    describe('GET /api/auth/export', () => {
      const exportar = () => request(app).get('/api/auth/export').set('Authorization', `Bearer ${memberToken()}`)

      beforeEach(() => {
        mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'member@example.com', name: 'Miembro' })
        mockPrisma.communityMember.findMany.mockResolvedValue([])
        mockPrisma.digestExclusion.findMany.mockResolvedValue([])
        mockPrisma.communityPost.findMany.mockResolvedValue([])
        mockPrisma.alertSubscription.findMany.mockResolvedValue([])
        mockPrisma.feedback.findMany.mockResolvedValue([])
      })

      it('incluye TODAS las suscripciones al boletin, no solo la primera', async () => {
        // Quien se suscribio dos veces (o dejo una pendiente sin confirmar) tiene
        // varias filas; `findFirst` exportaba una y callaba el resto.
        mockPrisma.pendingSubscription.findMany.mockResolvedValue([
          { email: 'member@example.com', confirmedAt: new Date('2026-08-01'), createdAt: new Date('2026-07-30') },
          { email: 'member@example.com', confirmedAt: null, createdAt: new Date('2026-09-15') },
        ])

        const res = await exportar()

        expect(res.status).toBe(200)
        expect(res.body.newsletterSubscriptions, 'el export volvio a callar suscripciones').toHaveLength(2)
        expect(res.body).not.toHaveProperty('newsletterSubscription')
      })

      it('incluye lo guardado con mayusculas y nada que ILIKE traiga de mas', async () => {
        // Lo mismo que borraria la supresion, ni mas ni menos.
        mockPrisma.pendingSubscription.findMany.mockResolvedValue([
          { email: 'Member@Example.com', confirmedAt: new Date(), createdAt: new Date() },
          { email: 'memberXexample.com', confirmedAt: new Date(), createdAt: new Date() },
        ])

        const res = await exportar()

        expect(res.body.newsletterSubscriptions).toHaveLength(1)
        expect(JSON.stringify(res.body.newsletterSubscriptions)).not.toContain('@')
      })

      it('con la cuenta ya borrada (token huerfano) no exporta datos guardados con ese correo', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null)
        mockPrisma.pendingSubscription.findMany.mockResolvedValue([
          { email: 'member@example.com', confirmedAt: new Date(), createdAt: new Date() },
        ])
        mockPrisma.feedback.findMany.mockResolvedValue([{ email: 'member@example.com', message: 'de otra persona' }])

        const res = await exportar()

        expect(res.body.newsletterSubscriptions).toEqual([])
        expect(res.body.feedback, 'entrego comentarios de quien tiene hoy ese correo').toEqual([])
      })
    })

    describe('borrado de cuenta y el contacto en Brevo', () => {
      const borrar = () =>
        request(app).delete('/api/auth/account').set('Authorization', `Bearer ${memberToken()}`).send({ confirm: 'ELIMINAR' })

      beforeEach(() => {
        mockBrevo.deleteContact.mockResolvedValue(undefined)
      })

      it('BORRA el contacto por su id y por el correo, no solo lo da de baja', async () => {
        sembrarSupresion([{ id: 'ps-1', plunkContactId: '4242' }])

        const res = await borrar()

        expect(res.status).toBe(200)
        expect(mockBrevo.deleteContact).toHaveBeenCalledWith('4242')
        expect(mockBrevo.deleteContact).toHaveBeenCalledWith('member@example.com')
        expect(
          mockBrevo.updateContact,
          'el borrado de cuenta volvio a «dar de baja» al contacto: su correo sigue guardado en Brevo',
        ).not.toHaveBeenCalled()
      })

      it('sin fila de suscripcion, lo borra por el correo (quien vuelve tras una baja no tiene id)', async () => {
        sembrarSupresion()

        await borrar()

        expect(mockBrevo.deleteContact).toHaveBeenCalledWith('member@example.com')
      })

      it('lo borra ANTES de eliminar el registro local', async () => {
        sembrarSupresion([{ id: 'ps-1', plunkContactId: '4242' }])

        await borrar()

        // Id y correo antes de la base; el tercero es el barrido final.
        const [id, correo] = mockBrevo.deleteContact.mock.invocationCallOrder
        const local = mockPrisma.user.deleteMany.mock.invocationCallOrder[0]
        expect(Math.max(id, correo)).toBeLessThan(local)
      })

      it('un 404 de Brevo (no habia contacto) no impide el borrado', async () => {
        sembrarSupresion()
        mockBrevo.deleteContact.mockRejectedValue(Object.assign(new Error('Not Found'), { response: { status: 404 } }))

        const res = await borrar()

        expect(res.status).toBe(200)
        expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['user-1'] } } })
      })

      it('si Brevo cae, no borra nada y pide reintentar: seguir de largo dejaba a la persona en la lista sin registro', async () => {
        sembrarSupresion([{ id: 'ps-1', plunkContactId: '4242' }])
        mockBrevo.deleteContact.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 503 } }))

        const res = await borrar()

        expect(res.status).toBe(503)
        expect(mockPrisma.user.deleteMany).not.toHaveBeenCalled()
        expect(mockPrisma.pendingSubscription.deleteMany).not.toHaveBeenCalled()
        expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
      })

      it('la cuenta va por su id, nunca por el correo del token', async () => {
        // El correo del token puede ser viejo y pertenecer ya a otra cuenta.
        sembrarSupresion()
        mockPrisma.user.findMany.mockResolvedValue([{ id: 'otra-cuenta', email: 'member@example.com' }])

        await borrar()

        expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['user-1'] } } })
      })
    })

    describe('DELETE /api/auth/subscription (la baja desde el perfil)', () => {
      const darDeBaja = () =>
        request(app).delete('/api/auth/subscription').set('Authorization', `Bearer ${memberToken()}`)

      it('borra el contacto por el correo aunque la fila no tenga id (quien volvio tras una baja)', async () => {
        sembrarSupresion([{ id: 'ps-1', plunkContactId: null }])
        mockBrevo.deleteContact.mockResolvedValue(undefined)

        const res = await darDeBaja()

        expect(res.status).toBe(200)
        expect(mockBrevo.deleteContact, 'la baja volvio a saltarse Brevo sin id de contacto').toHaveBeenCalledWith(
          'member@example.com',
        )
        expect(mockPrisma.pendingSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['ps-1'] } } })
        expect(mockPrisma.user.deleteMany, 'darse de baja del boletin borro la cuenta').not.toHaveBeenCalled()
      })

      it('alcanza a quien se suscribio con mayusculas: el enlace magico baja el correo a minusculas', async () => {
        sembrarSupresion()
        mockPrisma.pendingSubscription.findMany.mockResolvedValue([
          { id: 'ps-1', email: 'Member@Example.com', plunkContactId: '4242', confirmedAt: new Date() },
        ])
        mockBrevo.deleteContact.mockResolvedValue(undefined)

        const res = await darDeBaja()

        expect(res.status, 'respondio «sin suscripcion» a quien si la tenia').toBe(200)
        expect(mockBrevo.deleteContact).toHaveBeenCalledWith('4242')
      })

      it('usa el correo de la base, no el del token', async () => {
        sembrarSupresion([{ id: 'ps-1', plunkContactId: null }])
        mockPrisma.user.findUnique.mockResolvedValue({ email: 'nuevo@example.com' })
        mockPrisma.pendingSubscription.findMany.mockResolvedValue([
          { id: 'ps-1', email: 'nuevo@example.com', plunkContactId: null, confirmedAt: new Date() },
        ])
        mockBrevo.deleteContact.mockResolvedValue(undefined)

        await darDeBaja()

        expect(mockBrevo.deleteContact).toHaveBeenCalledWith('nuevo@example.com')
        expect(mockBrevo.deleteContact).not.toHaveBeenCalledWith('member@example.com')
      })

      it('si Brevo no responde, avisa y no borra la fila: la baja no ocurrio', async () => {
        sembrarSupresion([{ id: 'ps-1', plunkContactId: '4242' }])
        mockBrevo.deleteContact.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 503 } }))

        const res = await darDeBaja()

        expect(res.status).toBe(503)
        expect(mockPrisma.pendingSubscription.deleteMany).not.toHaveBeenCalled()
      })

      it('con la cuenta ya borrada (token huérfano) no toca el boletín del dueño actual del correo', async () => {
        sembrarSupresion([{ id: 'ps-1', plunkContactId: '4242' }])
        mockPrisma.user.findUnique.mockResolvedValue(null)

        const baja = await darDeBaja()
        const estado = await request(app).get('/api/auth/subscription').set('Authorization', `Bearer ${memberToken()}`)

        expect(baja.status).toBe(404)
        expect(mockBrevo.deleteContact).not.toHaveBeenCalled()
        expect(estado.body, 'le reveló al token huérfano la suscripción de otra persona').toEqual({ subscribed: false, confirmedAt: null })
      })

      it('sin suscripcion confirmada responde 404', async () => {
        sembrarSupresion()

        const res = await darDeBaja()

        expect(res.status).toBe(404)
        expect(mockBrevo.deleteContact).not.toHaveBeenCalled()
      })
    })
  })
})
