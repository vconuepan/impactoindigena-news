import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

/**
 * Los logs se descargan y se comparten para depurar, y la Politica promete que
 * por ellos no pasan correos de lectores (maskEmail). Estas rutas escribian el
 * correo crudo, y las URL de confirmacion llevaban ademas el token: en las
 * alertas es la credencial de baja permanente.
 *
 * Se reemplaza `createLogger` por un espia unico y se mira TODO lo que alguien
 * escribio, en cualquier nivel y con cualquier forma.
 */
const logSpy = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock('../lib/logger.js', async (original) => ({
  ...(await original<typeof import('../lib/logger.js')>()),
  createLogger: () => logSpy,
}))

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

const mockPrisma = vi.hoisted(() => ({
  magicLink: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  user: { upsert: vi.fn() },
  $disconnect: vi.fn(),
}))
const mockBrevo = vi.hoisted(() => ({ verifyEmail: vi.fn(), sendTransactional: vi.fn() }))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../services/brevo.js', () => mockBrevo)
vi.mock('../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))
vi.mock('../services/alerts.js', () => ({
  confirmAlert: vi.fn().mockRejectedValue(new Error('Invalid confirmation link')),
  subscribeToAlerts: vi.fn(),
  unsubscribeByToken: vi.fn(),
}))
vi.mock('../services/subscribe.js', async (original) => ({
  ...(await original<typeof import('../services/subscribe.js')>()),
  confirmSubscription: vi.fn().mockRejectedValue(new Error('Invalid confirmation link')),
}))

process.env.JWT_SECRET = 'test-jwt-secret-for-log-privacy-tests'
process.env.CLIENT_URL = 'https://test.example.com'
process.env.API_URL = 'https://api.test.example.com'

const { default: app } = await import('../app.js')

const CORREO = 'lectora@example.com'
const TOKEN = '0b1c2d3e-aaaa-bbbb-cccc-111122223333'

/** Todo lo escrito al log, aplanado: argumentos de cada llamada, de cualquier nivel. */
function todoLoEscrito(): string {
  return [logSpy.info, logSpy.warn, logSpy.error, logSpy.debug]
    .flatMap((fn) => fn.mock.calls)
    .map((args) => JSON.stringify(args, (_k, v) => (v instanceof Error ? v.message : v)))
    .join('\n')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBrevo.verifyEmail.mockResolvedValue({ valid: true, domainExists: true, isDisposable: false })
  mockBrevo.sendTransactional.mockResolvedValue(undefined)
  mockPrisma.magicLink.findFirst.mockResolvedValue(null)
  mockPrisma.magicLink.create.mockResolvedValue({ id: 'ml-1' })
  mockPrisma.magicLink.findUnique.mockResolvedValue({
    id: 'ml-1', email: CORREO, token: 'x', expiresAt: new Date(Date.now() + 600_000), usedAt: null, redirectTo: null,
  })
  mockPrisma.magicLink.update.mockResolvedValue({})
  mockPrisma.user.upsert.mockResolvedValue({ id: 'user-1', email: CORREO, name: 'lectora', userType: 'VEEDOR' })
})

describe('logs: el correo y el token no se escriben crudos', () => {
  it('solicitar, reenviar y verificar un enlace magico', async () => {
    await request(app).post('/api/auth/magic').send({ email: CORREO })
    await request(app).post('/api/auth/magic/resend').send({ email: CORREO })
    await request(app).get('/api/auth/magic/verify?token=abc')

    const log = todoLoEscrito()
    expect(log).toContain('magic link sent') // el log se escribio...
    expect(log).not.toContain(CORREO) // ...pero sin el correo
    expect(log).toContain('l***@example.com')
  })

  it('un correo cuya verificacion de dominio falla tampoco se escribe crudo', async () => {
    mockBrevo.verifyEmail.mockRejectedValue(new Error('dns down'))
    await request(app).post('/api/auth/magic').send({ email: CORREO })
    expect(todoLoEscrito()).not.toContain(CORREO)
  })

  it('confirmar una suscripcion o una alerta: ni el correo ni el token, ni en la linea HTTP', async () => {
    await request(app).get(`/api/subscribe/confirm?token=${TOKEN}&email=${encodeURIComponent(CORREO)}`)
    await request(app).get(`/api/alerts/confirm?token=${TOKEN}&email=${encodeURIComponent(CORREO)}`)

    const log = todoLoEscrito()
    expect(log).toContain('confirmation failed') // el log se escribio...
    expect(log).not.toContain(CORREO)
    expect(log).not.toContain(encodeURIComponent(CORREO))
    expect(log).not.toContain(TOKEN)
    expect(log).toContain('/api/alerts/confirm?token=[REDACTED]&email=[REDACTED]')
  })
})
