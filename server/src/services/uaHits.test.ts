import { describe, it, expect, vi, beforeEach } from 'vitest'

const consultas = vi.hoisted(() => [] as Array<{ sql: string; valores: unknown[] }>)
const fallar = vi.hoisted(() => ({ si: false }))

vi.mock('../lib/prisma.js', () => ({
  default: {
    $executeRaw: vi.fn(async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      if (fallar.si) throw new Error('relation "ua_hits_daily" does not exist')
      consultas.push({ sql: partes.join('?'), valores })
      return 1
    }),
  },
}))

const veredicto = vi.hoisted(() => ({ v: 'verificado' as 'verificado' | 'falso' | 'sin_verificar' }))
vi.mock('../lib/verifySearchBot.js', () => ({
  seVerifica: (a: string) => a === 'Googlebot' || a === 'Bingbot',
  verificarBuscador: vi.fn(async () => veredicto.v),
}))

const { registrarVisitaPorFamilia, clasificarConVerificacion, _reiniciarAviso } = await import('./uaHits.js')

const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const DIA = new Date('2026-11-20T15:30:00Z')

beforeEach(() => {
  consultas.length = 0
  fallar.si = false
  veredicto.v = 'verificado'
  _reiniciarAviso()
})

describe('registrarVisitaPorFamilia', () => {
  it('guarda dia, superficie, familia y agente, sin IP ni User-Agent', async () => {
    await registrarVisitaPorFamilia('ficha_html', 'curl/8.4.0', '190.20.30.40', DIA)
    expect(consultas).toHaveLength(1)
    const [, superficie, familia, agente] = consultas[0].valores
    expect([superficie, familia, agente]).toEqual(['ficha_html', 'automatizacion', 'curl'])
    expect((consultas[0].valores[0] as Date).toISOString()).toBe('2026-11-20T00:00:00.000Z')
    // Ningun valor guardado contiene la IP ni el User-Agent.
    expect(JSON.stringify(consultas[0].valores)).not.toContain('190.20.30.40')
    expect(JSON.stringify(consultas[0].valores)).not.toContain('curl/8.4.0')
  })

  it('en la ficha cuenta tambien a los navegadores; en el beacon no (ya estan en page_views)', async () => {
    await registrarVisitaPorFamilia('ficha_html', CHROME, '190.20.30.40', DIA)
    await registrarVisitaPorFamilia('beacon', CHROME, '190.20.30.40', DIA)
    expect(consultas).toHaveLength(1)
    expect(consultas[0].valores[2]).toBe('navegador')
  })

  it('nunca lanza aunque la tabla no exista (despliegue antes del SQL)', async () => {
    fallar.si = true
    await expect(registrarVisitaPorFamilia('ficha_html', CHROME, '1.1.1.1', DIA)).resolves.toBeUndefined()
  })
})

describe('clasificarConVerificacion', () => {
  it('Googlebot verificado queda como buscador', async () => {
    expect(await clasificarConVerificacion(GOOGLEBOT, '66.249.66.1')).toEqual({ family: 'buscador', agent: 'Googlebot' })
  })

  it('Googlebot falso pasa a otro_robot y se nombra como falso', async () => {
    veredicto.v = 'falso'
    expect(await clasificarConVerificacion(GOOGLEBOT, '47.74.1.1')).toEqual({ family: 'otro_robot', agent: 'Googlebot (falso)' })
  })

  it('si el DNS no respondio, queda como buscador sin verificar', async () => {
    veredicto.v = 'sin_verificar'
    expect(await clasificarConVerificacion(GOOGLEBOT, '66.249.66.2')).toEqual({ family: 'buscador', agent: 'Googlebot (sin verificar)' })
  })

  it('los que no se verifican pasan tal cual', async () => {
    expect(await clasificarConVerificacion('WhatsApp/2.23.20.0', '1.1.1.1')).toEqual({ family: 'vista_previa', agent: 'WhatsApp' })
  })
})
