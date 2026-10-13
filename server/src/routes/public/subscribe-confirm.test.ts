import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

/**
 * La confirmacion del boletin se hace con un POST desde el sitio, no al abrir el
 * enlace.
 *
 * EL HUECO QUE ESTO CIERRA (13-oct-2026). El enlace del correo de confirmacion
 * era GET /api/subscribe/confirm y ese GET confirmaba. Los filtros de correo
 * corporativos (Safe Links y similares) abren los enlaces para revisarlos antes
 * que la persona: si un tercero escribia el correo de alguien en el formulario,
 * el escaner del buzon de esa persona confirmaba la suscripcion solo.
 *
 * Ahora el GET solo redirige a /subscribed con el token, y la pagina muestra un
 * boton que hace el POST. Es el mismo patron que /api/alerts/confirm.
 */

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }))

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

process.env.CLIENT_URL = 'https://sitio.example'
process.env.FRONTEND_URL = 'https://sitio.example'

const { default: app } = await import('../../app.js')

const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CORREO = 'lectora@example.com'

beforeEach(() => {
  vi.clearAllMocks()
  mockSubscribe.confirmSubscription.mockResolvedValue(undefined)
})

describe('GET /api/subscribe/confirm: abrir el enlace no confirma nada', () => {
  it('redirige a la pagina con el token y el correo, SIN llamar a confirmSubscription', async () => {
    const res = await request(app).get(`/api/subscribe/confirm?token=${TOKEN}&email=${encodeURIComponent(CORREO)}`)

    expect(res.status).toBe(303)
    const destino = new URL(res.headers.location)
    expect(destino.origin).toBe('https://sitio.example')
    expect(destino.pathname).toBe('/subscribed')
    expect(destino.searchParams.get('confirm_token')).toBe(TOKEN)
    expect(destino.searchParams.get('email')).toBe(CORREO)
    expect(
      mockSubscribe.confirmSubscription,
      'abrir el enlace volvio a confirmar: el escaner del buzon confirma la suscripcion de cualquiera',
    ).not.toHaveBeenCalled()
  })

  it('sin token o sin correo lleva a la pagina con el aviso de enlace invalido', async () => {
    const res = await request(app).get(`/api/subscribe/confirm?token=${TOKEN}`)
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('https://sitio.example/subscribed?error=invalid')
    expect(mockSubscribe.confirmSubscription).not.toHaveBeenCalled()
  })

  it('un parametro repetido (arreglo) no se trata como cadena: va al aviso de invalido', async () => {
    const res = await request(app).get(`/api/subscribe/confirm?token=${TOKEN}&token=${TOKEN}&email=${encodeURIComponent(CORREO)}`)
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('https://sitio.example/subscribed?error=invalid')
    expect(mockSubscribe.confirmSubscription).not.toHaveBeenCalled()
  })

  it('un correo con & o # no puede agregar parametros ni cambiar el destino', async () => {
    const hostil = 'a&error=expired#x@example.com'
    const res = await request(app).get(`/api/subscribe/confirm?token=${TOKEN}&email=${encodeURIComponent(hostil)}`)

    expect(res.status).toBe(303)
    const destino = new URL(res.headers.location)
    expect(destino.origin).toBe('https://sitio.example')
    expect(destino.pathname).toBe('/subscribed')
    expect(destino.searchParams.get('email')).toBe(hostil)
    expect(destino.searchParams.get('error')).toBeNull()
    expect(destino.hash).toBe('')
  })
})

describe('POST /api/subscribe/confirm: confirmar es apretar el boton', () => {
  it('confirma con el token y el correo del cuerpo', async () => {
    const res = await request(app).post('/api/subscribe/confirm').send({ token: TOKEN, email: CORREO })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(mockSubscribe.confirmSubscription).toHaveBeenCalledTimes(1)
    expect(mockSubscribe.confirmSubscription).toHaveBeenCalledWith(TOKEN, CORREO)
  })

  it('un enlace vencido da 400 expired', async () => {
    mockSubscribe.confirmSubscription.mockRejectedValue(new Error('Confirmation link has expired'))
    const res = await request(app).post('/api/subscribe/confirm').send({ token: TOKEN, email: CORREO })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'expired' })
  })

  it('un token o correo que no coinciden dan 400 invalid, sin distinguir cual fallo', async () => {
    mockSubscribe.confirmSubscription.mockRejectedValue(new Error('Invalid confirmation link'))
    const res = await request(app).post('/api/subscribe/confirm').send({ token: TOKEN, email: CORREO })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid' })
  })

  it('un error inesperado es 500 y no se confunde con un enlace invalido', async () => {
    mockSubscribe.confirmSubscription.mockRejectedValue(new Error('connection reset'))
    const res = await request(app).post('/api/subscribe/confirm').send({ token: TOKEN, email: CORREO })

    // Con 400 la pagina mostraria «enlace no valido» y limpiaria la URL: la
    // persona perderia un enlace bueno por una caida pasajera.
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to confirm' })
  })

  it.each([
    ['sin cuerpo', {}],
    ['token que no es uuid', { token: 'no-es-uuid', email: CORREO }],
    ['correo mal formado', { token: TOKEN, email: 'no-es-un-correo' }],
    ['correo demasiado largo', { token: TOKEN, email: `${'a'.repeat(250)}@example.com` }],
    ['token como arreglo', { token: [TOKEN], email: CORREO }],
  ])('rechaza %s antes de llegar al servicio', async (_nombre, cuerpo) => {
    const res = await request(app).post('/api/subscribe/confirm').send(cuerpo)

    expect(res.status).toBe(400)
    expect(mockSubscribe.confirmSubscription).not.toHaveBeenCalled()
  })

  it('un sitio ajeno no puede confirmar: el Origin se rechaza antes de llegar al servicio', async () => {
    const res = await request(app)
      .post('/api/subscribe/confirm')
      .set('Origin', 'https://sitio-ajeno.example')
      .send({ token: TOKEN, email: CORREO })

    expect(res.status).toBe(403)
    expect(mockSubscribe.confirmSubscription).not.toHaveBeenCalled()
  })

  it.each(['application/x-www-form-urlencoded', 'text/plain'])(
    'un formulario simple (%s) no llega al servicio: solo se lee application/json',
    async (tipo) => {
      // Un <form> de otro sitio solo puede mandar estos tipos sin pedir permiso.
      const res = await request(app)
        .post('/api/subscribe/confirm')
        .set('Content-Type', tipo)
        .send(`token=${TOKEN}&email=${encodeURIComponent(CORREO)}`)

      expect(res.status).toBe(400)
      expect(mockSubscribe.confirmSubscription).not.toHaveBeenCalled()
    },
  )

  it('el token y el correo no se aceptan por la URL: solo por el cuerpo', async () => {
    const res = await request(app).post(`/api/subscribe/confirm?token=${TOKEN}&email=${encodeURIComponent(CORREO)}`)

    expect(res.status).toBe(400)
    expect(mockSubscribe.confirmSubscription).not.toHaveBeenCalled()
  })
})
