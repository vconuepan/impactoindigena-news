import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { apiLimiter, expensiveOpLimiter, authLimiter, refreshLimiter, searchLimiter } from './rateLimit.js'
import { config } from '../config.js'

const SECRETO = 'prerender-'.padEnd(48, 'z')

function appCon(limiter: express.RequestHandler) {
  const app = express()
  app.get('/x', limiter, (_req, res) => { res.json({ ok: true }) })
  app.post('/x', limiter, (_req, res) => { res.json({ ok: true }) })
  return app
}

describe('apiLimiter y el secreto del build (B23)', () => {
  const original = config.rateLimit.prerenderBypassToken
  afterEach(() => { config.rateLimit.prerenderBypassToken = original })

  it('con el secreto correcto la peticion no cuenta ni lleva RateLimit-*', async () => {
    config.rateLimit.prerenderBypassToken = SECRETO
    const res = await request(appCon(apiLimiter)).get('/x').set('x-prerender-token', SECRETO)
    expect(res.status).toBe(200)
    expect(res.headers['ratelimit-limit']).toBeUndefined()
  })

  it('con un secreto equivocado cuenta como cualquier lector', async () => {
    config.rateLimit.prerenderBypassToken = SECRETO
    const res = await request(appCon(apiLimiter)).get('/x').set('x-prerender-token', SECRETO + 'x')
    expect(res.status).toBe(200)
    expect(res.headers['ratelimit-limit']).toBe(String(config.rateLimit.publicMax))
  })

  it('sin secreto configurado, mandar el encabezado vacio no salta nada', async () => {
    config.rateLimit.prerenderBypassToken = ''
    const res = await request(appCon(apiLimiter)).get('/x').set('x-prerender-token', '')
    expect(res.headers['ratelimit-limit']).toBe(String(config.rateLimit.publicMax))
  })

  it('el secreto no salta el limite de una escritura (POST), aunque sea correcto', async () => {
    // Si se filtrara, no deberia servir para repetir unirse/salir de una
    // comunidad, que manda un correo en cada vuelta.
    config.rateLimit.prerenderBypassToken = SECRETO
    const res = await request(appCon(apiLimiter)).post('/x').set('x-prerender-token', SECRETO)
    expect(res.headers['ratelimit-limit']).toBe(String(config.rateLimit.publicMax))
  })

  it('el secreto salta SOLO apiLimiter: la busqueda sigue contando', async () => {
    config.rateLimit.prerenderBypassToken = SECRETO
    const res = await request(appCon(searchLimiter)).get('/x').set('x-prerender-token', SECRETO)
    expect(res.headers['ratelimit-limit']).toBe(String(config.rateLimit.searchMax))
  })
})

describe('Rate Limiters', () => {
  it('exports apiLimiter', () => {
    expect(apiLimiter).toBeDefined()
    expect(typeof apiLimiter).toBe('function')
  })

  it('exports expensiveOpLimiter', () => {
    expect(expensiveOpLimiter).toBeDefined()
    expect(typeof expensiveOpLimiter).toBe('function')
  })

  it('exports authLimiter', () => {
    expect(authLimiter).toBeDefined()
    expect(typeof authLimiter).toBe('function')
  })

  it('exports refreshLimiter', () => {
    expect(refreshLimiter).toBeDefined()
    expect(typeof refreshLimiter).toBe('function')
  })
})
