import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * La portada NUNCA puede depender de que el snapshot de R2 exista.
 *
 * El snapshot es una optimizacion: evita el viaje a Virginia que impone el
 * proxy del Static Web App. Si falta, si R2 esta caido o si el JSON viene roto,
 * el endpoint de siempre tiene que seguir sirviendo la portada — y sin ese
 * respaldo, un fallo de R2 dejaria el sitio en blanco.
 */
const SNAPSHOT = 'https://r2.example/homepage.json'

vi.mock('../config', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  HOMEPAGE_SNAPSHOT_URL: SNAPSHOT,
}))

const DEL_SNAPSHOT = { issues: [{ slug: 'del-snapshot' }], storiesByIssue: {}, activeCases: [] }
const DEL_ENDPOINT = { issues: [{ slug: 'del-endpoint' }], storiesByIssue: {}, activeCases: [] }

function respuesta(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response
}

describe('la portada y el snapshot de R2', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('usa el snapshot cuando responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) =>
      u === SNAPSHOT ? respuesta(DEL_SNAPSHOT) : respuesta(DEL_ENDPOINT),
    ))
    const { publicApi } = await import('./api')
    expect((await publicApi.homepage()).issues[0].slug).toBe('del-snapshot')
  })

  it('cae al endpoint cuando el snapshot no existe todavia', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) =>
      u === SNAPSHOT ? respuesta(null, false) : respuesta(DEL_ENDPOINT),
    ))
    const { publicApi } = await import('./api')
    expect((await publicApi.homepage()).issues[0].slug).toBe('del-endpoint')
  })

  it('cae al endpoint cuando R2 no responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (u === SNAPSHOT) throw new TypeError('Failed to fetch')
      return respuesta(DEL_ENDPOINT)
    }))
    const { publicApi } = await import('./api')
    expect((await publicApi.homepage()).issues[0].slug).toBe('del-endpoint')
  })

  it('cae al endpoint cuando el snapshot trae un JSON roto', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      // `as unknown as Response` y no `as Response`: el objeto no solapa con
      // Response y TypeScript lo rechaza. Es un doble de prueba, no una
      // respuesta real.
      if (u === SNAPSHOT) {
        return { ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') } } as unknown as Response
      }
      return respuesta(DEL_ENDPOINT)
    }))
    const { publicApi } = await import('./api')
    expect((await publicApi.homepage()).issues[0].slug).toBe('del-endpoint')
  })
})
