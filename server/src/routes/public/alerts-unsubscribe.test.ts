import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { TEST_API_KEY } from '../../test/helpers.js'

/**
 * EL DEFECTO QUE ESTO CIERRA (8-sep-2026): `POST /api/alerts/unsubscribe`
 * aceptaba `{ email }` a secas y borraba TODAS las suscripciones de esa
 * direccion. Bastaba conocer el correo de alguien para desactivar sus alertas,
 * sin ninguna prueba de posesion — y el endpoint era el unico de este router
 * SIN limitador, asi que se podia hacer en masa.
 *
 * El camino existia para los enlaces `?unsubscribe=<correo>` ya entregados en
 * bandejas. El enlace con token esta en cada alerta desde el 10-jun-2026 y las
 * alertas salen a diario, asi que un suscriptor activo llevaba tres meses
 * recibiendo el enlace bueno.
 *
 * Se prueba en la RUTA y no solo en el servicio porque la ruta es la superficie
 * que estaba expuesta: un atacante manda un POST, no importa a que funcion
 * llegue por dentro.
 */

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

const mockAlerts = vi.hoisted(() => ({
  unsubscribeByToken: vi.fn(),
  subscribeToAlerts: vi.fn(),
  confirmAlert: vi.fn(),
  sendDailyAlerts: vi.fn(),
  cleanupExpiredAlertSubscriptions: vi.fn(),
}))

vi.mock('../../services/alerts.js', () => mockAlerts)
vi.mock('../../lib/prisma.js', () => ({ default: { $disconnect: vi.fn() } }))
vi.mock('../../services/crawler.js', () => ({
  crawlFeed: vi.fn(),
  crawlAllDueFeeds: vi.fn(),
  crawlUrl: vi.fn(),
}))

process.env.PUBLIC_API_KEY = TEST_API_KEY

const { default: app } = await import('../../app.js')

const TOKEN = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('POST /api/alerts/unsubscribe exige prueba de posesion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAlerts.unsubscribeByToken.mockResolvedValue(true)
  })

  it('RECHAZA un correo suelto: era el defecto explotable', async () => {
    const res = await request(app)
      .post('/api/alerts/unsubscribe')
      .send({ email: 'lectora@example.com' })

    expect(res.status).toBe(400)
    // Y lo que importa de verdad: no llego a tocar la base.
    expect(mockAlerts.unsubscribeByToken).not.toHaveBeenCalled()
  })

  it('RECHAZA correo y token juntos si el token no es valido', async () => {
    // Un atacante podria intentar colar el correo acompañandolo de basura.
    const res = await request(app)
      .post('/api/alerts/unsubscribe')
      .send({ email: 'lectora@example.com', token: 'no-es-un-uuid' })

    expect(res.status).toBe(400)
    expect(mockAlerts.unsubscribeByToken).not.toHaveBeenCalled()
  })

  it('RECHAZA un cuerpo vacio', async () => {
    const res = await request(app).post('/api/alerts/unsubscribe').send({})
    expect(res.status).toBe(400)
    expect(mockAlerts.unsubscribeByToken).not.toHaveBeenCalled()
  })

  it('ACEPTA el token, que es la prueba de posesion', async () => {
    const res = await request(app)
      .post('/api/alerts/unsubscribe')
      .send({ token: TOKEN })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(mockAlerts.unsubscribeByToken).toHaveBeenCalledWith(TOKEN)
  })

  it('ignora un correo que venga de acompañante: solo se usa el token', async () => {
    // Si el schema dejara pasar `email` sin validarlo, la ruta podria volver a
    // usarlo por dentro. Aqui se comprueba que lo unico que viaja es el token.
    const res = await request(app)
      .post('/api/alerts/unsubscribe')
      .send({ token: TOKEN, email: 'otra@example.com' })

    expect(res.status).toBe(200)
    expect(mockAlerts.unsubscribeByToken).toHaveBeenCalledWith(TOKEN)
    expect(mockAlerts.unsubscribeByToken).toHaveBeenCalledTimes(1)
  })

  it('un token desconocido responde exito igual: no hay oraculo para sondear tokens', async () => {
    mockAlerts.unsubscribeByToken.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/alerts/unsubscribe')
      .send({ token: TOKEN })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })
})

describe('el limitador esta aplicado, aunque los tests lo desactiven', () => {
  it('todas las rutas POST del router llevan alertLimiter', () => {
    // El mock de express-rate-limit de arriba deja pasar todo, asi que ningun
    // test de peticion puede comprobar el limitador. Se lee el fuente.
    //
    // Importa porque /unsubscribe era el UNICO POST del router sin el: se podian
    // intentar bajas en masa sin freno. Y el limitador es la segunda linea —la
    // primera es el token—, asi que si vuelve a faltar no se nota en nada.
    const fuente = readFileSync(path.resolve(__dirname, 'alerts.ts'), 'utf8')
    const posts = [...fuente.matchAll(/router\.post\('([^']+)',\s*(\w+)/g)]
    expect(posts.length, 'no se encontro ninguna ruta POST').toBeGreaterThan(1)
    const sinLimitador = posts.filter((m) => m[2] !== 'alertLimiter').map((m) => m[1])
    expect(sinLimitador, `rutas POST sin limitador: ${sinLimitador.join(', ')}`).toEqual([])
  })
})
