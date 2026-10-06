import { describe, it, expect, vi } from 'vitest'
import { datosDePortadaAntesDeMontar, CLAVE_DATOS_PORTADA } from './arranque-portada'

const SNAPSHOT = { issues: [], storiesByIssue: { x: { uplifting: [], calm: [], negative: [] } }, activeCases: [] }

function rootPrerenderizado(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = '<div class="layout"><main><h1>Portada</h1></main></div>'
  return root
}

function cliente() {
  return { setQueryData: vi.fn() }
}

describe('datosDePortadaAntesDeMontar', () => {
  it('en la portada prerenderizada siembra el snapshot en la cache y devuelve true', async () => {
    const qc = cliente()
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => SNAPSHOT })) as unknown as typeof fetch
    const ok = await datosDePortadaAntesDeMontar({ pathname: '/', root: rootPrerenderizado(), snapshotUrl: 'https://r2/homepage.json', queryClient: qc, fetchFn })
    expect(ok).toBe(true)
    expect(fetchFn).toHaveBeenCalledWith('https://r2/homepage.json')
    expect(qc.setQueryData).toHaveBeenCalledWith(CLAVE_DATOS_PORTADA, SNAPSHOT)
  })

  it('reutiliza la promesa que dejo preload-hero.js en vez de pedir de nuevo', async () => {
    const qc = cliente()
    const fetchFn = vi.fn() as unknown as typeof fetch
    const ok = await datosDePortadaAntesDeMontar({ pathname: '/', root: rootPrerenderizado(), snapshotUrl: 'https://r2/homepage.json', queryClient: qc, snapshotPendiente: Promise.resolve(SNAPSHOT), fetchFn })
    expect(ok).toBe(true)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(qc.setQueryData).toHaveBeenCalledWith(CLAVE_DATOS_PORTADA, SNAPSHOT)
  })

  it('fuera de la portada no espera nada', async () => {
    const qc = cliente()
    const fetchFn = vi.fn() as unknown as typeof fetch
    expect(await datosDePortadaAntesDeMontar({ pathname: '/stories/x', root: rootPrerenderizado(), snapshotUrl: 'https://r2/homepage.json', queryClient: qc, fetchFn })).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('con el root vacio (prerender, fichas del backend, desarrollo) no espera nada', async () => {
    // Si no hay HTML prerenderizado no hay pintado que conservar: esperar solo
    // retrasaria el esqueleto. Y en el prerender mismo bloquearia el build.
    const qc = cliente()
    const fetchFn = vi.fn() as unknown as typeof fetch
    expect(await datosDePortadaAntesDeMontar({ pathname: '/', root: document.createElement('div'), snapshotUrl: 'https://r2/homepage.json', queryClient: qc, fetchFn })).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('sin URL de snapshot configurada no espera nada', async () => {
    const qc = cliente()
    expect(await datosDePortadaAntesDeMontar({ pathname: '/', root: rootPrerenderizado(), snapshotUrl: '', queryClient: qc })).toBe(false)
  })

  it('si el snapshot tarda mas que el tope, monta igual sin datos', async () => {
    const qc = cliente()
    const fetchFn = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch // nunca responde
    const ok = await datosDePortadaAntesDeMontar({ pathname: '/', root: rootPrerenderizado(), snapshotUrl: 'https://r2/homepage.json', queryClient: qc, fetchFn, topeMs: 20 })
    expect(ok).toBe(false)
    expect(qc.setQueryData).not.toHaveBeenCalled()
  })

  it('si el snapshot falla o viene roto, monta igual sin datos', async () => {
    const qc = cliente()
    const caido = vi.fn(async () => { throw new Error('sin red') }) as unknown as typeof fetch
    expect(await datosDePortadaAntesDeMontar({ pathname: '/', root: rootPrerenderizado(), snapshotUrl: 'https://r2/homepage.json', queryClient: qc, fetchFn: caido })).toBe(false)
    const roto = vi.fn(async () => ({ ok: true, json: async () => ({ nada: true }) })) as unknown as typeof fetch
    expect(await datosDePortadaAntesDeMontar({ pathname: '/', root: rootPrerenderizado(), snapshotUrl: 'https://r2/homepage.json', queryClient: qc, fetchFn: roto })).toBe(false)
    const error500 = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
    expect(await datosDePortadaAntesDeMontar({ pathname: '/', root: rootPrerenderizado(), snapshotUrl: 'https://r2/homepage.json', queryClient: qc, fetchFn: error500 })).toBe(false)
    expect(qc.setQueryData).not.toHaveBeenCalled()
  })

  it('la clave es la misma que usa useHomepageData, o la siembra no serviria', () => {
    expect([...CLAVE_DATOS_PORTADA]).toEqual(['homepage-data'])
  })
})
