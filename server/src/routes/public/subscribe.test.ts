import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

/**
 * EL DEFECTO QUE ESTO CIERRA (11-sep-2026): la ruta devolvia
 * `success: true` —«Check your email»— TAMBIEN cuando el correo de
 * confirmacion no habia podido enviarse.
 *
 * La regla de fondo es correcta y se conserva: contestar siempre lo mismo evita
 * decirle a un desconocido si una direccion ya esta suscrita. Pero un fallo de
 * ENTREGA no revela nada sobre la direccion —le ocurre igual a cualquiera
 * cuando el proveedor esta caido—, y callarlo dejaba a la persona esperando un
 * correo que no iba a llegar, sin nada que le dijera que reintentara. Ni el
 * visitante ni el panel se enteraban: una caida de dias habria pasado
 * inadvertida con un embudo de ocho contactos.
 *
 * Se prueba en la RUTA porque es ahi donde vive la decision de que contestar.
 */

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockSubscribe = vi.hoisted(() => ({
  subscribe: vi.fn(),
  confirmSubscription: vi.fn(),
  cleanupExpiredPendingSubscriptions: vi.fn(),
  reconcileUnsubscribedFromBrevo: vi.fn(),
}))

// Las clases de error son reales: la ruta distingue con `instanceof`, asi que
// un doble no serviria para probar justamente lo que importa.
const { EmailValidationError, EmailDeliveryError } = await import('../../services/subscribe.js')

vi.mock('../../services/subscribe.js', async (original) => {
  const real = await original<typeof import('../../services/subscribe.js')>()
  return { ...real, ...mockSubscribe }
})
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

const { default: app } = await import('../../app.js')

describe('POST /api/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscribe.subscribe.mockResolvedValue(undefined)
  })

  it('confirma el alta cuando todo sale bien', async () => {
    const res = await request(app).post('/api/subscribe').send({ email: 'lectora@ejemplo.cl' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('avisa cuando el correo de confirmacion NO se pudo enviar', async () => {
    mockSubscribe.subscribe.mockRejectedValue(new EmailDeliveryError('Failed to send confirmation email'))

    const res = await request(app).post('/api/subscribe').send({ email: 'lectora@ejemplo.cl' })

    // 502 y no 200: el cliente del sitio lanza en no-2xx y muestra su error
    // traducido, asi la persona sabe que tiene que reintentar.
    expect(res.status).toBe(502)
    expect(
      res.body.success,
      'un fallo de entrega volvio a responder exito: la persona queda esperando un correo que no llega',
    ).toBe(false)
  })

  it('sigue sin revelar nada ante cualquier OTRO error', async () => {
    // Aca si importa callar: el error podria depender de si la direccion ya
    // existe, y la respuesta no debe dejarlo ver.
    mockSubscribe.subscribe.mockRejectedValue(new Error('boom'))

    const res = await request(app).post('/api/subscribe').send({ email: 'lectora@ejemplo.cl' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('rechaza un correo que no pasa la validacion, con su motivo', async () => {
    mockSubscribe.subscribe.mockRejectedValue(new EmailValidationError('Please enter a valid email address.'))

    const res = await request(app).post('/api/subscribe').send({ email: 'lectora@ejemplo.cl' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toContain('valid email')
  })

  it('rechaza un formato invalido antes de llegar al servicio', async () => {
    const res = await request(app).post('/api/subscribe').send({ email: 'no-es-un-correo' })

    expect(res.status).toBe(400)
    expect(mockSubscribe.subscribe).not.toHaveBeenCalled()
  })
})
