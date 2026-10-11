import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import rateLimit from 'express-rate-limit'
import request from 'supertest'

const logSpy = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock('../lib/logger.js', () => ({ createLogger: () => logSpy }))

const { resolveClientIp } = await import('./clientIp.js')

/**
 * Detras de Static Web Apps, `req.ip` era la salida del proxy y no el lector: el
 * cupo de cada limitador no era de nadie en particular. Medido en produccion el
 * 11-oct-2026 sobre /api/health: el contador de una misma conexion y una misma
 * instancia iba 97, 98, 98, 97, 99, o sea que la clave cambiaba de una peticion a
 * otra. Se arma una app minima con el limitador REAL de express-rate-limit.
 */
function appConLimite(fromRight: number, max = 2) {
  const app = express()
  app.set('trust proxy', 1)
  app.use(resolveClientIp(fromRight))
  app.use(rateLimit({ windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false }))
  app.get('/ping', (req, res) => res.json({ ip: req.ip }))
  return app
}

const LECTOR_A = '203.0.113.5'
const LECTOR_B = '198.51.100.7'
const SWA = '20.50.1.9'

describe('resolveClientIp: cada lector con su propio cupo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dos lectores distintos detras del mismo proxy no comparten el cupo', async () => {
    const app = appConLimite(2)
    const a = (n: number) => request(app).get('/ping').set('X-Forwarded-For', `${LECTOR_A}:${40000 + n}, ${SWA}`)
    const b = () => request(app).get('/ping').set('X-Forwarded-For', `${LECTOR_B}:55555, ${SWA}`)

    expect((await a(1)).status).toBe(200)
    expect((await a(2)).status).toBe(200)
    expect((await a(3)).status).toBe(429) // A agoto SU cupo, aunque cambie de puerto en cada conexion
    expect((await b()).status).toBe(200) // B sigue con el suyo
  })

  it('falsificar un prefijo de X-Forwarded-For no da un cupo nuevo', async () => {
    const app = appConLimite(2)
    const falso = (v: string) => request(app).get('/ping').set('X-Forwarded-For', `${v}, ${LECTOR_A}:1234, ${SWA}`)

    expect((await falso('1.1.1.1')).status).toBe(200)
    expect((await falso('2.2.2.2')).status).toBe(200)
    expect((await falso('3.3.3.3')).status).toBe(429)
  })

  it('el contador decrece de a uno para el mismo lector, sin importar la conexion', async () => {
    const app = appConLimite(2, 5)
    const restantes: string[] = []
    for (let i = 0; i < 4; i++) {
      const r = await request(app).get('/ping').set('X-Forwarded-For', `${LECTOR_A}:${50000 + i * 7}, ${SWA}`)
      restantes.push(String(r.headers['ratelimit-remaining']))
    }
    expect(restantes).toEqual(['4', '3', '2', '1'])
  })

  it('un lector con IPv6 que cambia de direccion dentro de su /64 no gana un cupo nuevo', async () => {
    const app = appConLimite(2)
    const desde = (addr: string) => request(app).get('/ping').set('X-Forwarded-For', `[${addr}]:443, ${SWA}`)

    expect((await desde('2001:db8:aaaa:1::1')).status).toBe(200)
    expect((await desde('2001:db8:aaaa:1::2')).status).toBe(200)
    expect((await desde('2001:db8:aaaa:1:9999:8888:7777:6666')).status).toBe(429)
    expect((await desde('2001:db8:aaaa:2::1')).status).toBe(200) // otro /64, otro lector
  })

  it('sin X-Forwarded-For usa la direccion del socket, como antes', async () => {
    const app = appConLimite(2)
    expect((await request(app).get('/ping')).status).toBe(200)
    expect((await request(app).get('/ping')).status).toBe(200)
    expect((await request(app).get('/ping')).status).toBe(429)
  })

  it('con 0 queda desactivado y req.ip vuelve a ser el de Express', async () => {
    const app = appConLimite(0)
    const r = await request(app).get('/ping').set('X-Forwarded-For', `${LECTOR_A}:1234, ${SWA}`)
    expect(r.body.ip).toBe(SWA) // la ultima entrada, que es la salida del proxy
  })

  it('con la cadena esperada req.ip es el lector, sin puerto', async () => {
    const app = appConLimite(2)
    const r = await request(app).get('/ping').set('X-Forwarded-For', `${LECTOR_A}:1234, ${SWA}`)
    expect(r.body.ip).toBe(LECTOR_A)
  })
})

describe('resolveClientIp: registro de la forma de la cadena', () => {
  beforeEach(() => vi.clearAllMocks())

  it('anota la FORMA de las entradas para poder medir la topologia, sin escribir ninguna IP', async () => {
    const app = appConLimite(2, 1000)
    await request(app).get('/ping').set('X-Forwarded-For', `${LECTOR_A}:51840, ${SWA}`)

    const escrito = JSON.stringify(logSpy.info.mock.calls)
    expect(escrito).toContain('v4:port')
    expect(escrito).toContain('v4')
    expect(escrito).not.toContain(LECTOR_A)
    expect(escrito).not.toContain(SWA)
  })
})
