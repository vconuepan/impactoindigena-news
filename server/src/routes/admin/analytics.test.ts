import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryRaw = vi.hoisted(() => vi.fn())
vi.mock('../../lib/prisma.js', () => ({ default: { $queryRaw: queryRaw } }))

const { robotsDelPeriodo, interaccionDelPeriodo } = await import('./analytics.js')

const SINCE = new Date('2026-10-22T00:00:00Z')

beforeEach(() => queryRaw.mockReset())

describe('robotsDelPeriodo', () => {
  it('cuenta desde el primer dato, no desde el inicio del periodo', async () => {
    queryRaw
      .mockResolvedValueOnce([{ d: new Date('2026-11-21T00:00:00Z') }])
      .mockResolvedValueOnce([
        { surface: 'ficha_html', family: 'navegador', agent: '', total: 900n },
        { surface: 'beacon', family: 'automatizacion', agent: 'HeadlessChrome', total: 120n },
      ])
      .mockResolvedValueOnce([{ total: 300n }])
    const r = await robotsDelPeriodo(SINCE)
    expect(r.desde).toBe('2026-11-21')
    expect(r.filas).toEqual([
      { surface: 'ficha_html', family: 'navegador', agent: '', count: 900 },
      { surface: 'beacon', family: 'automatizacion', agent: 'HeadlessChrome', count: 120 },
    ])
    expect(r.fichasConJs).toBe(300)
    // Las dos consultas de datos usan la fecha del primer dato.
    expect((queryRaw.mock.calls[1][1] as Date).toISOString()).toBe('2026-11-21T00:00:00.000Z')
    expect((queryRaw.mock.calls[2][1] as Date).toISOString()).toBe('2026-11-21T00:00:00.000Z')
  })

  it('sin datos devuelve vacio y desde null', async () => {
    queryRaw.mockResolvedValueOnce([{ d: null }])
    expect(await robotsDelPeriodo(SINCE)).toEqual({ desde: null, filas: [], fichasConJs: 0 })
  })

  it('si la tabla aun no existe (SQL sin aplicar), no rompe el panel', async () => {
    queryRaw.mockRejectedValueOnce(new Error('relation "ua_hits_daily" does not exist'))
    expect(await robotsDelPeriodo(SINCE)).toEqual({ desde: null, filas: [], fichasConJs: 0 })
  })
})

describe('interaccionDelPeriodo', () => {
  it('suma visitantes e interacciones por pais', async () => {
    queryRaw
      .mockResolvedValueOnce([{ d: new Date('2026-11-21T00:00:00Z') }])
      .mockResolvedValueOnce([
        { country: 'CN', visitantes: 200n, interactuaron: 1n },
        { country: 'CL', visitantes: 20n, interactuaron: 12n },
      ])
    const r = await interaccionDelPeriodo(SINCE)
    expect(r).toEqual({
      desde: '2026-11-21',
      visitantes: 220,
      interactuaron: 13,
      porPais: [
        { country: 'CN', visitantes: 200, interactuaron: 1 },
        { country: 'CL', visitantes: 20, interactuaron: 12 },
      ],
    })
  })

  it('si la tabla aun no existe, no rompe el panel', async () => {
    queryRaw.mockRejectedValueOnce(new Error('relation "visitor_day_signals" does not exist'))
    expect(await interaccionDelPeriodo(SINCE)).toEqual({ desde: null, visitantes: 0, interactuaron: 0, porPais: [] })
  })
})
