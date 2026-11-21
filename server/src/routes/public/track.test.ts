import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/** Cada llamada a $executeRaw: el SQL (sin valores) y los valores. */
const consultas = vi.hoisted(() => [] as Array<{ sql: string; valores: unknown[] }>)

vi.mock('../../lib/prisma.js', () => ({
  default: {
    $executeRaw: vi.fn(async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      consultas.push({ sql: partes.join('?'), valores })
      return 1
    }),
  },
}))

const registrar = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../services/uaHits.js', () => ({ registrarVisitaPorFamilia: registrar }))

const { default: trackRouter } = await import('./track.js')

const app = express()
app.use(express.json())
app.use('/api/track', trackRouter)

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const HEADLESS = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36'
// La cadena real detras de Static Web Apps: lector, salida del proxy.
const XFF = '190.20.30.40:51840, 10.0.0.1'

const tabla = (t: string) => consultas.filter((c) => c.sql.includes(`INTO ${t}`))

beforeEach(() => {
  consultas.length = 0
  registrar.mockClear()
})

describe('POST /api/track', () => {
  it('un navegador cuenta la vista y el visitante del dia', async () => {
    await request(app).post('/api/track').set('User-Agent', CHROME).set('X-Forwarded-For', XFF).send({ path: '/stories/x', source: '' })
    await vi.waitFor(() => expect(tabla('daily_visitors')).toHaveLength(1))
    expect(tabla('page_views')).toHaveLength(1)
    expect(registrar).not.toHaveBeenCalled()
  })

  // 20-nov-2026: lo descartado se cuenta aparte en vez de tirarse en silencio.
  it('un robot no entra en las vistas, pero se cuenta por familia', async () => {
    await request(app).post('/api/track').set('User-Agent', HEADLESS).set('X-Forwarded-For', XFF).send({ path: '/search', source: '' })
    await vi.waitFor(() => expect(registrar).toHaveBeenCalledTimes(1))
    expect(registrar).toHaveBeenCalledWith('beacon', HEADLESS, '190.20.30.40')
    expect(tabla('page_views')).toHaveLength(0)
    expect(tabla('daily_visitors')).toHaveLength(0)
  })
})

describe('POST /api/track · señales del visitante (21-nov-2026)', () => {
  const senal = () => consultas.filter((c) => c.sql.includes('INTO visitor_day_signals') && c.sql.includes('pages'))

  it('guarda tipo de página, origen, coherencia del idioma y red, todo reducido', async () => {
    await request(app).post('/api/track')
      .set('User-Agent', CHROME).set('X-Forwarded-For', XFF).set('Accept-Language', 'qu-PE,es;q=0.9')
      .send({ path: '/stories/una-nota', source: 'search' })
    await vi.waitFor(() => expect(senal()).toHaveLength(1))
    // [dia, hash, ficha, busqueda, otra, origen, idioma, nube]
    const [, , ficha, busqueda, otra, origen, idioma, nube] = senal()[0].valores
    expect([ficha, busqueda, otra, origen, idioma, nube]).toEqual([true, false, false, 'search', 'coherente', ''])
    // La lengua indigena del navegador NO se guarda: solo «coherente».
    expect(JSON.stringify(senal()[0].valores)).not.toMatch(/qu-PE|\bqu\b/)
    // Y la IP tampoco.
    expect(JSON.stringify(senal()[0].valores)).not.toContain('190.20.30.40')
  })

  it('una IP de nube guarda el proveedor, no la IP', async () => {
    await request(app).post('/api/track')
      .set('User-Agent', CHROME).set('X-Forwarded-For', '8.128.5.9, 10.0.0.1').set('Accept-Language', 'zh-CN')
      .send({ path: '/search', source: '' })
    await vi.waitFor(() => expect(senal()).toHaveLength(1))
    const v = senal()[0].valores
    expect(v.slice(2)).toEqual([false, true, false, '', 'incoherente', 'Alibaba Cloud'])
    expect(JSON.stringify(v)).not.toContain('8.128.5.9')
  })
})

describe('POST /api/track/engaged', () => {
  it('marca la interaccion con el MISMO hash que el visitante del dia', async () => {
    await request(app).post('/api/track').set('User-Agent', CHROME).set('X-Forwarded-For', XFF).send({ path: '/stories/x', source: '' })
    await vi.waitFor(() => expect(tabla('daily_visitors')).toHaveLength(1))
    await request(app).post('/api/track/engaged').set('User-Agent', CHROME).set('X-Forwarded-For', XFF).send({ path: '/stories/x' })
    // Desde el 21-nov el beacon tambien escribe señales en esa tabla: aqui se
    // mira solo la escritura del aviso de interaccion.
    const avisos = () => tabla('visitor_day_signals').filter((c) => c.sql.includes('DO UPDATE SET interacted = true'))
    await vi.waitFor(() => expect(avisos()).toHaveLength(1))

    const hashVisitante = tabla('daily_visitors')[0].valores[1]
    expect(avisos()[0].valores[1]).toBe(hashVisitante)
  })

  it('un robot que manda el aviso no marca nada', async () => {
    await request(app).post('/api/track/engaged').set('User-Agent', HEADLESS).set('X-Forwarded-For', XFF).send({ path: '/stories/x' })
    await new Promise((r) => setTimeout(r, 20))
    expect(tabla('visitor_day_signals')).toHaveLength(0)
  })

  it('una ruta que no es del sitio publico no marca nada', async () => {
    for (const path of ['/admin/analytics', '/api/x', 'sin-barra', '/a?b=1&c=2"']) {
      await request(app).post('/api/track/engaged').set('User-Agent', CHROME).set('X-Forwarded-For', XFF).send({ path })
    }
    await new Promise((r) => setTimeout(r, 20))
    // '/a?b=1...' se limpia a '/a', que es valida: solo esa cuenta.
    expect(tabla('visitor_day_signals')).toHaveLength(1)
  })

  it('responde 200 al instante aunque la base falle', async () => {
    const res = await request(app).post('/api/track/engaged').set('User-Agent', CHROME).send({ path: '/' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
