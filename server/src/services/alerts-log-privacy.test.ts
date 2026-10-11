import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * El servicio de alertas escribia el correo del lector en el log al suscribir,
 * actualizar los temas, confirmar y cuando fallaba un envio. Los logs se
 * descargan y se comparten: el correo va enmascarado (maskEmail).
 */
const logSpy = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock('../lib/logger.js', async (original) => ({
  ...(await original<typeof import('../lib/logger.js')>()),
  createLogger: () => logSpy,
}))

const mockPrisma = vi.hoisted(() => ({
  alertSubscription: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  story: { findMany: vi.fn() },
}))
const mockBrevo = vi.hoisted(() => ({ sendTransactional: vi.fn() }))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./brevo.js', () => mockBrevo)

const { subscribeToAlerts, confirmAlert, sendDailyAlerts } = await import('./alerts.js')

const CORREO = 'lectora@example.com'

function todoLoEscrito(): string {
  return [logSpy.info, logSpy.warn, logSpy.error, logSpy.debug]
    .flatMap((fn) => fn.mock.calls)
    .map((args) => JSON.stringify(args))
    .join('\n')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBrevo.sendTransactional.mockResolvedValue(undefined)
  mockPrisma.alertSubscription.deleteMany.mockResolvedValue({ count: 0 })
  mockPrisma.alertSubscription.create.mockResolvedValue({ id: 's1' })
  mockPrisma.alertSubscription.update.mockResolvedValue({})
  mockPrisma.alertSubscription.updateMany.mockResolvedValue({ count: 0 })
})

describe('alertas: el correo no se escribe crudo en el log', () => {
  it('al suscribir una direccion nueva', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue(null)
    await subscribeToAlerts(CORREO, ['litio'])
    expect(todoLoEscrito()).toContain('alert subscription created')
    expect(todoLoEscrito()).not.toContain(CORREO)
  })

  it('al pedir el cambio de temas de una suscripcion confirmada', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue({ id: 's1', topics: ['agua'] })
    await subscribeToAlerts(CORREO, ['litio'])
    expect(todoLoEscrito()).toContain('alert topics change requested')
    expect(todoLoEscrito()).not.toContain(CORREO)
  })

  it('al pedir los mismos temas que ya tiene', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue({ id: 's1', topics: ['litio'] })
    await subscribeToAlerts(CORREO, ['litio'])
    expect(todoLoEscrito()).toContain('nothing to do')
    expect(todoLoEscrito()).not.toContain(CORREO)
  })

  it('al confirmar un cambio de temas', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue({ id: 's2', topics: ['litio'], confirmedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    mockPrisma.alertSubscription.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.alertSubscription.deleteMany.mockResolvedValue({ count: 1 })
    await confirmAlert('tok', CORREO)
    expect(todoLoEscrito()).toContain('change confirmed and applied')
    expect(todoLoEscrito()).not.toContain(CORREO)
  })

  it('al confirmar', async () => {
    mockPrisma.alertSubscription.findFirst.mockResolvedValue({ id: 's1', confirmedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    await confirmAlert('tok', CORREO)
    expect(todoLoEscrito()).toContain('alert subscription confirmed')
    expect(todoLoEscrito()).not.toContain(CORREO)
  })

  it('cuando falla un envio de la alerta diaria', async () => {
    mockPrisma.story.findMany.mockResolvedValue([
      { id: 's', title: 'litio', slug: 'litio', summary: 'litio', imageUrl: null, sourceUrl: 'https://x.cl/a', datePublished: new Date(), issue: null, feed: { title: 'F', displayTitle: null } },
    ])
    mockPrisma.alertSubscription.findMany.mockResolvedValue([{ email: CORREO, token: 't', topics: ['litio'], active: true, confirmedAt: new Date() }])
    mockBrevo.sendTransactional.mockRejectedValue(new Error('smtp down'))
    await sendDailyAlerts()
    expect(todoLoEscrito()).toContain('failed to send alert email')
    expect(todoLoEscrito()).not.toContain(CORREO)
  })
})
