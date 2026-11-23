import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { exigirSecretoDeOrigen, esOrigenAutorizado, ENCABEZADO_ORIGEN, LARGO_MINIMO } from './originSecret.js'

const SECRETO = 'a'.repeat(LARGO_MINIMO) + '-secreto-de-prueba'

function app(secreto: string | undefined) {
  const a = express()
  a.use(exigirSecretoDeOrigen(secreto))
  a.get('/health', (_req, res) => res.json({ ok: true }))
  a.get('/api/health', (_req, res) => res.json({ ok: true }))
  a.post('/api/subscribe', (_req, res) => res.json({ ok: true }))
  return a
}

describe('candado de origen (X-Origin-Secret)', () => {
  it('sin secreto configurado no hace nada: se puede desplegar antes del corte', async () => {
    await request(app(undefined)).get('/api/health').expect(200)
    await request(app('')).get('/api/health').expect(200)
  })

  it('un secreto más corto que el mínimo se ignora, no deja la API cerrada a medias', async () => {
    await request(app('corto')).get('/api/health').expect(200)
  })

  it('con secreto, rechaza lo que no trae la cabecera', async () => {
    const res = await request(app(SECRETO)).get('/api/health').expect(403)
    expect(res.body).toEqual({ error: 'forbidden' })
  })

  it('con secreto, rechaza una cabecera equivocada, también en escrituras', async () => {
    await request(app(SECRETO)).get('/api/health').set(ENCABEZADO_ORIGEN, 'otro').expect(403)
    await request(app(SECRETO)).post('/api/subscribe').set(ENCABEZADO_ORIGEN, SECRETO + 'x').expect(403)
  })

  it('con el secreto correcto pasa, en lecturas y escrituras', async () => {
    await request(app(SECRETO)).get('/api/health').set(ENCABEZADO_ORIGEN, SECRETO).expect(200)
    await request(app(SECRETO)).post('/api/subscribe').set(ENCABEZADO_ORIGEN, SECRETO).expect(200)
  })

  it('/health de la raíz queda abierta para las sondas del App Service', async () => {
    await request(app(SECRETO)).get('/health').expect(200)
  })

  it('una cabecera repetida (arreglo) no cuenta', () => {
    expect(esOrigenAutorizado([SECRETO, SECRETO], SECRETO)).toBe(false)
    expect(esOrigenAutorizado(undefined, SECRETO)).toBe(false)
  })
})
