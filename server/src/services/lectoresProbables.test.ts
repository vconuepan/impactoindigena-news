import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryRaw = vi.hoisted(() => vi.fn())
vi.mock('../lib/prisma.js', () => ({ default: { $queryRaw: queryRaw } }))
const flag = vi.hoisted(() => ({ on: true }))
vi.mock('../config.js', () => ({ config: { analytics: { get botScoring() { return flag.on } } } }))

const { agregar, lectoresProbables } = await import('./lectoresProbables.js')

const fila = (o: Record<string, unknown>) => ({
  country: 'CL', device: 'desktop', interacted: false, pages: 1, saw_story: false, saw_search: false,
  saw_other: false, source_first: '', lang: 'sin_dato', net: '', ...o,
})

const LECTOR_CL = fila({ device: 'mobile', interacted: true, pages: 2, saw_story: true, lang: 'coherente' })
const BOT_CN = fila({ country: 'CN', net: 'Alibaba Cloud', lang: 'incoherente', saw_search: true })
const DUDOSO_US = fila({ country: 'US', net: 'Amazon AWS', lang: 'coherente', saw_story: true })

beforeEach(() => {
  queryRaw.mockReset()
  flag.on = true
})

describe('agregar', () => {
  it('cuenta cada visitante en su categoría, en total y por país', () => {
    const r = agregar([LECTOR_CL, BOT_CN, BOT_CN, DUDOSO_US])
    expect(r.total).toEqual({ bruto: 4, lector: 1, dudoso: 1, bot: 2 })
    expect(r.porPais[0]).toEqual({ clave: 'CN', bruto: 2, lector: 0, dudoso: 0, bot: 2 })
    expect(r.porPais.find((p) => p.clave === 'CL')).toEqual({ clave: 'CL', bruto: 1, lector: 1, dudoso: 0, bot: 0 })
  })

  it('agrupa por red con el nombre del proveedor y «Red que no es de nube»', () => {
    const r = agregar([LECTOR_CL, BOT_CN, DUDOSO_US])
    expect(r.porRed.map((x) => x.clave).sort()).toEqual(['Alibaba Cloud', 'Amazon AWS', 'Red que no es de nube'])
  })

  it('el origen vacío se muestra como «direct», como en el resto del panel', () => {
    expect(agregar([LECTOR_CL]).porOrigen[0].clave).toBe('direct')
  })

  it('los motivos en contra agrupan la red de nube sin el proveedor', () => {
    const r = agregar([BOT_CN, DUDOSO_US])
    const nube = r.motivosEnContra.find((m) => m.motivo.includes('red de nube'))
    expect(nube).toEqual({ motivo: '−15 red de nube', veces: 2 })
    // Los lectores no aportan motivos en contra.
    expect(agregar([LECTOR_CL]).motivosEnContra).toEqual([])
  })
})

describe('lectoresProbables', () => {
  it('con el interruptor apagado no consulta nada y dice inactivo', async () => {
    flag.on = false
    const r = await lectoresProbables(new Date('2026-10-22'))
    expect(r.activo).toBe(false)
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('sin el SQL de las columnas nuevas, no rompe: activo y sin datos', async () => {
    queryRaw.mockRejectedValueOnce(new Error('column "pages" does not exist'))
    const r = await lectoresProbables(new Date('2026-10-22'))
    expect(r).toMatchObject({ activo: true, desde: null, conSenales: 0 })
  })

  it('cuenta desde el primer día con señales y reporta los visitantes sin señales', async () => {
    queryRaw
      .mockResolvedValueOnce([{ d: new Date('2026-11-22T00:00:00Z') }])
      .mockResolvedValueOnce([LECTOR_CL, BOT_CN])
      .mockResolvedValueOnce([{ n: 5n }])
    const r = await lectoresProbables(new Date('2026-10-22T00:00:00Z'))
    expect(r.desde).toBe('2026-11-22')
    expect(r.visitantes).toBe(5)
    expect(r.conSenales).toBe(2)
    expect(r.total).toEqual({ bruto: 2, lector: 1, dudoso: 0, bot: 1 })
  })
})
