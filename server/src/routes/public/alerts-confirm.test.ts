import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

/**
 * La confirmacion de alertas se hace con un POST desde el sitio, no al abrir el
 * enlace.
 *
 * EL RESIDUO QUE ESTO CIERRA (11-oct-2026). Cambiar los temas de una suscripcion
 * ya exigia confirmarlo por correo, pero el enlace del correo confirmaba con un
 * GET. Los filtros de correo corporativos (Safe Links y similares) abren los
 * enlaces para revisarlos antes que la persona: un pedido de cambio hecho por un
 * tercero quedaba aplicado sin que la titular hiciera nada.
 *
 * Ahora el GET del enlace solo redirige a /alertas con el token, y la pagina
 * muestra un boton que hace el POST. Abrir el enlace no cambia nada. Es el mismo
 * patron que la baja de alertas, que ya era asi.
 */

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

const mockAlerts = vi.hoisted(() => ({
  confirmAlert: vi.fn(),
  subscribeToAlerts: vi.fn(),
  unsubscribeByToken: vi.fn(),
  sendDailyAlerts: vi.fn(),
  cleanupExpiredAlertSubscriptions: vi.fn(),
}))
vi.mock('../../services/alerts.js', () => mockAlerts)
vi.mock('../../lib/prisma.js', () => ({ default: { $disconnect: vi.fn() } }))
vi.mock('../../services/crawler.js', () => ({ crawlFeed: vi.fn(), crawlAllDueFeeds: vi.fn(), crawlUrl: vi.fn() }))

process.env.CLIENT_URL = 'https://sitio.example'
process.env.FRONTEND_URL = 'https://sitio.example'

const { default: app } = await import('../../app.js')

const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CORREO = 'lectora@example.com'

beforeEach(() => {
  vi.clearAllMocks()
  mockAlerts.confirmAlert.mockResolvedValue('confirmed')
})

describe('GET /api/alerts/confirm: abrir el enlace no confirma nada', () => {
  it('redirige a la pagina con el token y el correo, SIN llamar a confirmAlert', async () => {
    const res = await request(app).get(`/api/alerts/confirm?token=${TOKEN}&email=${encodeURIComponent(CORREO)}`)

    expect(res.status).toBe(303)
    const destino = new URL(res.headers.location)
    expect(destino.origin).toBe('https://sitio.example')
    expect(destino.pathname).toBe('/alertas')
    expect(destino.searchParams.get('confirm_token')).toBe(TOKEN)
    expect(destino.searchParams.get('email')).toBe(CORREO)
    expect(mockAlerts.confirmAlert).not.toHaveBeenCalled()
  })

  it('sin token o sin correo lleva a la pagina con el aviso de enlace invalido', async () => {
    const res = await request(app).get(`/api/alerts/confirm?token=${TOKEN}`)
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('https://sitio.example/alertas?confirmed=invalid')
    expect(mockAlerts.confirmAlert).not.toHaveBeenCalled()
  })

  it('no deja que el correo inyecte parametros ni cambie de sitio', async () => {
    const malicioso = 'a@b.cl&confirmed=true'
    const res = await request(app).get(`/api/alerts/confirm?token=${TOKEN}&email=${encodeURIComponent(malicioso)}`)

    const destino = new URL(res.headers.location)
    expect(destino.origin).toBe('https://sitio.example')
    expect(destino.searchParams.get('email')).toBe(malicioso) // viaja como valor, codificado
    expect(destino.searchParams.get('confirmed')).toBeNull()
  })
})

describe('POST /api/alerts/confirm: la confirmacion es un acto explicito', () => {
  it('confirma con token y correo y devuelve el resultado', async () => {
    mockAlerts.confirmAlert.mockResolvedValue('changed')

    const res = await request(app).post('/api/alerts/confirm').send({ token: TOKEN, email: CORREO })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, result: 'changed' })
    expect(mockAlerts.confirmAlert).toHaveBeenCalledWith(TOKEN, CORREO)
  })

  it('rechaza un cuerpo incompleto o mal formado sin llamar al servicio', async () => {
    for (const cuerpo of [{ token: TOKEN }, { email: CORREO }, { token: 'no-es-uuid', email: CORREO }, { token: TOKEN, email: 'no-es-correo' }]) {
      const res = await request(app).post('/api/alerts/confirm').send(cuerpo)
      expect(res.status).toBe(400)
    }
    expect(mockAlerts.confirmAlert).not.toHaveBeenCalled()
  })

  it('un enlace vencido responde expired', async () => {
    mockAlerts.confirmAlert.mockRejectedValue(new Error('Confirmation link has expired'))
    const res = await request(app).post('/api/alerts/confirm').send({ token: TOKEN, email: CORREO })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'expired' })
  })

  it('un token o correo que no coinciden responde invalid, sin decir cual fallo', async () => {
    mockAlerts.confirmAlert.mockRejectedValue(new Error('Invalid confirmation link'))
    const res = await request(app).post('/api/alerts/confirm').send({ token: TOKEN, email: CORREO })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid' })
  })

  it('un error inesperado es 500, no un exito', async () => {
    mockAlerts.confirmAlert.mockRejectedValue(new Error('db down'))
    const res = await request(app).post('/api/alerts/confirm').send({ token: TOKEN, email: CORREO })
    expect(res.status).toBe(500)
    expect(res.body.success).toBeUndefined()
  })

  // Un formulario de otro sitio no puede disparar la confirmacion por el
  // navegador de la persona: el CORS restringido rechaza el origen ajeno.
  it('rechaza una peticion desde otro origen', async () => {
    const res = await request(app)
      .post('/api/alerts/confirm')
      .set('Origin', 'https://evil.example')
      .send({ token: TOKEN, email: CORREO })
    expect(res.status).toBe(403)
    expect(mockAlerts.confirmAlert).not.toHaveBeenCalled()
  })
})
