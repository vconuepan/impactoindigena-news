import { describe, it, expect, beforeEach, vi } from 'vitest'
import { verificarBuscador, seVerifica, _vaciarCache, type Resolver } from './verifySearchBot.js'

function resolver(inverso: Record<string, string[] | Error>, directo: Record<string, string[]>): Resolver {
  return {
    reverse: vi.fn(async (ip: string) => {
      const r = inverso[ip]
      if (r instanceof Error) throw r
      if (!r) throw Object.assign(new Error('no'), { code: 'ENOTFOUND' })
      return r
    }),
    lookup: vi.fn(async (host: string) => (directo[host] ?? []).map((address) => ({ address }))),
  }
}

beforeEach(() => _vaciarCache())

describe('verificarBuscador', () => {
  it('Googlebot real: inverso en googlebot.com y el directo devuelve la misma IP', async () => {
    // Ejemplo de la documentacion de Google.
    const r = resolver({ '66.249.66.1': ['crawl-66-249-66-1.googlebot.com'] }, { 'crawl-66-249-66-1.googlebot.com': ['66.249.66.1'] })
    expect(await verificarBuscador('Googlebot', '66.249.66.1', r)).toBe('verificado')
  })

  it('Bingbot real: inverso en search.msn.com (comprobado en vivo el 19-nov)', async () => {
    const r = resolver({ '157.55.39.1': ['msnbot-157-55-39-1.search.msn.com.'] }, { 'msnbot-157-55-39-1.search.msn.com.': ['157.55.39.1'] })
    expect(await verificarBuscador('Bingbot', '157.55.39.1', r)).toBe('verificado')
  })

  it('dice ser Googlebot desde una nube: el inverso no es de Google → falso', async () => {
    const r = resolver({ '47.74.1.1': ['ecs-47-74-1-1.compute.example-cloud.com'] }, {})
    expect(await verificarBuscador('Googlebot', '47.74.1.1', r)).toBe('falso')
  })

  it('un inverso falsificado no basta: el directo debe devolver la misma IP', async () => {
    const r = resolver({ '203.0.113.5': ['crawl-1.googlebot.com'] }, { 'crawl-1.googlebot.com': ['66.249.66.1'] })
    expect(await verificarBuscador('Googlebot', '203.0.113.5', r)).toBe('falso')
  })

  it('no se deja engañar por un dominio que solo contiene el nombre', async () => {
    const r = resolver({ '203.0.113.6': ['googlebot.com.atacante.net'] }, { 'googlebot.com.atacante.net': ['203.0.113.6'] })
    expect(await verificarBuscador('Googlebot', '203.0.113.6', r)).toBe('falso')
  })

  it('una IP sin nombre inverso es falsa: un Googlebot real siempre lo tiene', async () => {
    expect(await verificarBuscador('Googlebot', '198.51.100.9', resolver({}, {}))).toBe('falso')
  })

  it('un error de red no acusa a nadie: queda sin verificar y no se guarda', async () => {
    const r = resolver({ '66.249.66.2': Object.assign(new Error('x'), { code: 'ETIMEOUT' }) }, {})
    expect(await verificarBuscador('Googlebot', '66.249.66.2', r)).toBe('sin_verificar')
    expect(await verificarBuscador('Googlebot', '66.249.66.2', r)).toBe('sin_verificar')
    expect(r.reverse).toHaveBeenCalledTimes(2)
  })

  it('el veredicto se guarda un dia por IP y no repite la consulta', async () => {
    const r = resolver({ '66.249.66.1': ['crawl-66-249-66-1.googlebot.com'] }, { 'crawl-66-249-66-1.googlebot.com': ['66.249.66.1'] })
    const t = 1_000_000
    await verificarBuscador('Googlebot', '66.249.66.1', r, t)
    await verificarBuscador('Googlebot', '66.249.66.1', r, t + 60_000)
    expect(r.reverse).toHaveBeenCalledTimes(1)
    await verificarBuscador('Googlebot', '66.249.66.1', r, t + 25 * 60 * 60 * 1000)
    expect(r.reverse).toHaveBeenCalledTimes(2)
  })

  it('solo se verifican Googlebot y Bingbot', () => {
    expect(seVerifica('Googlebot')).toBe(true)
    expect(seVerifica('Bingbot')).toBe(true)
    expect(seVerifica('GPTBot')).toBe(false)
  })
})
