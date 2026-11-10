import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { QueryClient, focusManager } from '@tanstack/react-query'
import {
  estaPrerenderizando,
  avisarCuandoTermine,
  consultasActivas,
  consultasIncompletas,
  fijarFocoParaElPrerender,
  registroDeFallasApi,
  rutaDeApi,
  ATRIBUTO_INCOMPLETO,
} from './prerender'
import { consultasIncompletasDe } from './verificar-horneado'

describe('el reintento en una pestana oculta del prerender (revision del 10-nov-2026)', () => {
  // Con 4 rutas a la vez, Puppeteer deja visible solo la ultima pestana; en las
  // otras, TanStack PAUSA el reintento y `isFetching()` vuelve a 0.
  let ocultar: ReturnType<typeof vi.spyOn> | null = null
  afterEach(() => {
    ocultar?.mockRestore()
    ocultar = null
    focusManager.setFocused(undefined)
  })

  const fallaUnaVez = () => {
    let llamadas = 0
    return {
      llamadas: () => llamadas,
      queryFn: async () => {
        llamadas++
        if (llamadas === 1) throw new Error('429')
        return 'ok'
      },
    }
  }

  it('sin foco fijo, oculta: el reintento queda en pausa y solo consultasActivas lo sigue viendo', async () => {
    ocultar = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 20 } } })
    const f = fallaUnaVez()
    void qc.fetchQuery({ queryKey: ['oculta'], queryFn: f.queryFn }).catch(() => {})
    await new Promise((r) => setTimeout(r, 80))
    expect(f.llamadas()).toBe(1) // el reintento no corrio
    expect(qc.isFetching()).toBe(0) // por eso el criterio anterior daba la pagina por terminada
    expect(consultasActivas(qc)).toBe(1) // en pausa, pero no en reposo
  })

  it('con fijarFocoParaElPrerender el reintento corre aunque la pestana este oculta', async () => {
    ocultar = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    fijarFocoParaElPrerender(focusManager)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 20 } } })
    const f = fallaUnaVez()
    await expect(qc.fetchQuery({ queryKey: ['oculta-con-foco'], queryFn: f.queryFn })).resolves.toBe('ok')
    expect(f.llamadas()).toBe(2)
    expect(consultasActivas(qc)).toBe(0)
  })
})

describe('las peticiones con fetch directo (segunda revision del 10-nov-2026)', () => {
  it('una falla que no se repuso queda pendiente; un exito posterior a la misma URL la borra', () => {
    const r = registroDeFallasApi()
    r.anotar('/api/stats/daily', '429')
    r.anotar('/api/communities', '502')
    r.anotar('/api/communities', null) // el reintento se repuso
    expect(r.pendientes()).toEqual(['/api/stats/daily (429)'])
  })

  it('rutaDeApi reconoce solo la API del propio sitio, en texto, URL o Request', () => {
    const base = 'http://localhost:8000/comunidad/aymara'
    expect(rutaDeApi('/api/stats/daily', base)).toBe('/api/stats/daily')
    expect(rutaDeApi(new URL('http://localhost:8000/api/x?p=1'), base)).toBe('/api/x?p=1')
    expect(rutaDeApi(new Request('http://localhost:8000/api/y'), base)).toBe('/api/y')
    // El snapshot de la portada en R2 y cualquier otro origen no cuentan.
    expect(rutaDeApi('https://pub-x.r2.dev/homepage.json', base)).toBeNull()
    expect(rutaDeApi('https://otro.org/api/x', base)).toBeNull()
    expect(rutaDeApi('/fonts/a.woff2', base)).toBeNull()
  })
})

describe('consultasIncompletas', () => {
  it('nombra las consultas en error y las que no terminaron; ignora las desactivadas y las listas', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await qc.fetchQuery({ queryKey: ['lista'], queryFn: async () => 1 })
    await qc.fetchQuery({ queryKey: ['rota'], queryFn: async () => { throw new Error('500') } }).catch(() => {})
    // Desactivada: la membresia sin sesion queda `pending` + `idle` y nunca iba a traer nada.
    qc.getQueryCache().build(qc, { queryKey: ['desactivada'] })
    const incompletas = consultasIncompletas(qc)
    expect(incompletas).toEqual(['["rota"] (error)'])
  })

  it('el atributo que escribe main.tsx es el que lee el candado', () => {
    // verificar-horneado.ts no importa lib/prerender.ts (corre en Node, en el
    // build): si alguien cambia el nombre en un solo lado, el candado deja de verlo.
    const html = `<html lang="es" ${ATRIBUTO_INCOMPLETO}="[&quot;rota&quot;] (error)"><head></head></html>`
    expect(consultasIncompletasDe(html)).toBe('["rota"] (error)')
  })
})

describe('avisarCuandoTermine (B23)', () => {
  afterEach(() => { vi.useRealTimers() })

  it('termina tras dos revisiones seguidas en calma', () => {
    vi.useFakeTimers()
    const alTerminar = vi.fn()
    avisarCuandoTermine({ fetchesEnVuelo: () => 0, consultasEnCurso: () => 0, alTerminar })
    vi.advanceTimersByTime(500)
    expect(alTerminar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(alTerminar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(alTerminar).toHaveBeenCalledTimes(1)
  })

  it('NO termina mientras una consulta espera su reintento, aunque no haya fetch abierto', () => {
    vi.useFakeTimers()
    let consultando = 1
    const alTerminar = vi.fn()
    avisarCuandoTermine({ fetchesEnVuelo: () => 0, consultasEnCurso: () => consultando, alTerminar })
    vi.advanceTimersByTime(3000)
    expect(alTerminar).not.toHaveBeenCalled()
    consultando = 0
    vi.advanceTimersByTime(600)
    expect(alTerminar).toHaveBeenCalledTimes(1)
  })

  it('una peticion colgada no frena el build: corta en el tope', () => {
    vi.useFakeTimers()
    const alTerminar = vi.fn()
    avisarCuandoTermine({ fetchesEnVuelo: () => 1, consultasEnCurso: () => 1, alTerminar, topeMs: 15000 })
    vi.advanceTimersByTime(14000)
    expect(alTerminar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1500)
    expect(alTerminar).toHaveBeenCalledTimes(1)
  })

  it('TanStack cuenta la espera del reintento en isFetching(): de eso depende lo de arriba', async () => {
    // Si una version futura dejara de contarla, el prerender volveria a
    // hornear esqueletos tras un 429 y ningun otro test lo notaria.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 80 } } })
    let llamadas = 0
    const consulta = qc.fetchQuery({
      queryKey: ['b23'],
      queryFn: async () => {
        llamadas++
        if (llamadas === 1) throw new Error('429')
        return 'ok'
      },
    })
    await new Promise((r) => setTimeout(r, 30)) // primer intento ya fallo; esperando el reintento
    expect(llamadas).toBe(1)
    expect(qc.isFetching()).toBe(1)
    await expect(consulta).resolves.toBe('ok')
    expect(qc.isFetching()).toBe(0)
  })
})

describe('estaPrerenderizando', () => {
  afterEach(() => {
    delete (window as unknown as { __PRERENDER_INJECTED?: unknown }).__PRERENDER_INJECTED
  })

  it('en un navegador normal es false', () => {
    expect(estaPrerenderizando()).toBe(false)
  })

  it('con la marca que inyecta el prerender es true', () => {
    ;(window as unknown as { __PRERENDER_INJECTED?: unknown }).__PRERENDER_INJECTED = { prerender: true }
    expect(estaPrerenderizando()).toBe(true)
  })

  it('el build de verdad inyecta la marca: sin `inject` en vite.config esto nunca seria true', () => {
    // La funcion lee una propiedad que solo existe si el prerender la define.
    // Si alguien quita `inject` de rendererOptions, el respaldo por 404 vuelve
    // a hornearse en el HTML sin que ningun test de componente lo note.
    const vite = readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8')
    expect(vite).toMatch(/inject:\s*\{\s*prerender:\s*true\s*\}/)
  })
})
