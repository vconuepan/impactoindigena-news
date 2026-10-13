import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

/**
 * Los limitadores del boletin, con el limitador REAL: los otros tests de la ruta
 * lo reemplazan por un paso libre, asi que quitar o juntar los limitadores no
 * rompia nada.
 *
 * LO QUE ESTO CIERRA (13-oct-2026). El POST de confirmar compartia el cupo del
 * alta (3 por minuto por lector): alta, alta, confirmar agotaba los tres y el
 * cuarto intento daba 429. Era un cambio de comportamiento —el GET antiguo no
 * tenia limite— y rompia a quien comparte IP con otros (una oficina, un campus,
 * la red movil de un operador). Confirmar tiene su propio cupo, mas holgado.
 */

const mockSubscribe = vi.hoisted(() => ({
  subscribe: vi.fn(),
  confirmSubscription: vi.fn(),
  cleanupExpiredPendingSubscriptions: vi.fn(),
  reconcileUnsubscribedFromBrevo: vi.fn(),
}))

vi.mock('../../services/subscribe.js', async (original) => {
  const real = await original<typeof import('../../services/subscribe.js')>()
  return { ...real, ...mockSubscribe }
})
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

const { default: app } = await import('../../app.js')
const { config } = await import('../../config.js')

const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CORREO = 'lectora@example.com'

const alta = () => request(app).post('/api/subscribe').send({ email: CORREO })
const confirmar = () => request(app).post('/api/subscribe/confirm').send({ token: TOKEN, email: CORREO })

beforeEach(() => {
  vi.clearAllMocks()
  mockSubscribe.subscribe.mockResolvedValue(undefined)
  mockSubscribe.confirmSubscription.mockResolvedValue(undefined)
})

describe('limitadores del boletin, con el limitador real', () => {
  it('agotar el cupo del alta NO agota el de confirmar', async () => {
    // El cupo del alta se agota y el siguiente alta recibe 429...
    for (let i = 0; i < config.subscribe.rateLimitMax; i++) expect((await alta()).status).toBe(200)
    expect((await alta()).status).toBe(429)

    // ...pero confirmar sigue disponible. Con un solo limitador compartido esto era 429.
    const res = await confirmar()
    expect(res.status, 'confirmar comparte el cupo del alta: quien se suscribe varias veces no puede confirmar').toBe(200)
  })

  it('confirmar tiene su propio tope, y lo respeta', async () => {
    const tope = config.subscribe.confirmRateLimitMax
    // (el test anterior ya gasto una confirmacion de este lector)
    for (let i = 0; i < tope - 1; i++) expect((await confirmar()).status).toBe(200)

    const res = await confirmar()
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/too many confirmation attempts/i)
    // Y el servicio no se llamo de mas.
    expect(mockSubscribe.confirmSubscription).toHaveBeenCalledTimes(tope - 1)
  })
})
