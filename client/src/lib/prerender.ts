/**
 * ¿Esta pagina se esta PRERENDERIZANDO (Puppeteer, en el build) o la ve un lector?
 *
 * `@prerenderer/renderer-puppeteer` define `window.__PRERENDER_INJECTED` antes
 * de que corra cualquier script, con lo que `vite.config.ts` le pase en
 * `rendererOptions.inject`. En un navegador real no existe.
 *
 * EL DEFECTO QUE ESTO CORRIGE (6-oct-2026): el hero de la portada declara
 * `srcset` con las variantes de 800 y 1200 px y, si la variante responde 404,
 * quita el `srcset` y carga el original. El build de CI corrio ANTES de que
 * las variantes existieran en R2: en Puppeteer la variante dio 404, el
 * respaldo se activo y el prerender serializo el DOM en ese estado. El HTML
 * de produccion salio con el hero SIN `srcset`, asi que cada visita bajaba el
 * original (318 KB) por el HTML y ademas la variante (65 KB) por React.
 * PageSpeed lo mostro como dos filas del mismo elemento.
 *
 * Un fallo de carga durante el prerender no es informacion sobre el lector:
 * describe el bucket en el minuto del build. Por eso los respaldos por error
 * de imagen se saltan cuando esto devuelve true y el HTML horneado conserva
 * siempre el `srcset`; el navegador del lector decide con su propia red.
 */
export function estaPrerenderizando(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as { __PRERENDER_INJECTED?: unknown }).__PRERENDER_INJECTED)
}

/**
 * En el prerender, TanStack Query no debe pausar los reintentos por estar la
 * pestana oculta.
 *
 * EL DEFECTO (revision del 10-nov-2026, medido con Puppeteer y 4 paginas como en
 * `maxConcurrentRoutes: 4`): solo la ultima pestana abierta esta `visible`; las
 * otras tres, `hidden`. TanStack espera el retraso del reintento y, si la
 * pestana no tiene el foco (`focusManager.isFocused()` mira
 * `document.visibilityState`), PAUSA el reintento hasta que vuelva al frente.
 * Una consulta pausada deja de contar en `isFetching()`, la pagina se daba por
 * terminada y se horneaba a medio cargar: el mismo B23, por otro camino. Con el
 * foco fijo, el reintento corre en todas las pestanas. Recibe el focusManager
 * para poder probarlo.
 */
export function fijarFocoParaElPrerender(focusManager: { setFocused(focused?: boolean): void }): void {
  focusManager.setFocused(true)
}

/** El atributo de `<html>` con que una pagina avisa que se horneo sin todos sus datos. */
export const ATRIBUTO_INCOMPLETO = 'data-prerender-incompleto'

/** Lo minimo de QueryClient que se usa aca, para no atar las pruebas a la clase. */
interface ConsultasDelCliente {
  getQueryCache(): {
    findAll(): Array<{ queryHash: string; state: { status: string; fetchStatus: string } }>
  }
}

/**
 * Consultas que NO estan en reposo: pidiendo datos o en pausa. Incluye las que
 * esperan un reintento, que es lo que `isFetching()` deja de contar cuando
 * TanStack las pausa (ver `fijarFocoParaElPrerender`).
 */
export function consultasActivas(qc: ConsultasDelCliente): number {
  return qc.getQueryCache().findAll().filter((q) => q.state.fetchStatus !== 'idle').length
}

/**
 * Consultas que dejarian la pagina incompleta si se hornea ahora: con error, o
 * todavia sin datos y sin haber terminado. Una consulta desactivada (`enabled:
 * false`, por ejemplo la membresia sin sesion) queda `pending` + `idle` y no
 * cuenta: nunca iba a traer nada.
 *
 * Existe porque el candado del og:url no ve las rutas FIJAS que piden datos
 * (/fuentes, /casos, /comunidades…): su og:url no depende de la API, asi que
 * una de ellas horneada en su estado de error pasaba en verde (hallazgo de la
 * revision del 10-nov-2026). Con esto la pagina deja escrito en `<html>` que le
 * falto algo, y `verificar-horneado.ts` lo lee en todas las rutas.
 */
export function consultasIncompletas(qc: ConsultasDelCliente): string[] {
  return qc
    .getQueryCache()
    .findAll()
    .filter((q) => q.state.status === 'error' || (q.state.status === 'pending' && q.state.fetchStatus !== 'idle'))
    .map((q) => `${q.queryHash} (${q.state.status === 'error' ? 'error' : q.state.fetchStatus})`)
}

/**
 * Las peticiones a /api que fallaron y no se repusieron, para las que la pagina
 * hace con `fetch` directo, fuera de TanStack Query (la barra de cifras de
 * `CurationStatsBar` en todas las rutas, el mapa de `MapWidget`): sus fallas las
 * absorbe un `.catch` y `consultasIncompletas` no las ve (segunda revision del
 * 10-nov-2026). Se anota por URL y un exito posterior a la misma URL la borra,
 * asi que un reintento que se repuso no detiene el build.
 */
export function registroDeFallasApi() {
  const fallas = new Map<string, string>()
  return {
    /** `estado` null = respondio bien. */
    anotar(url: string, estado: string | null): void {
      if (estado === null) fallas.delete(url)
      else fallas.set(url, estado)
    },
    pendientes(): string[] {
      return [...fallas].map(([url, estado]) => `${url} (${estado})`)
    },
  }
}

/** La ruta de una peticion si va a la API del sitio (`/api/...`); null si no. */
export function rutaDeApi(entrada: RequestInfo | URL, base: string): string | null {
  try {
    const texto = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    const url = new URL(texto, base)
    if (url.origin !== new URL(base).origin || !url.pathname.startsWith('/api/')) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

export interface OpcionesFinDelRender {
  /** Peticiones `fetch` en curso, contadas por el envoltorio de main.tsx. */
  fetchesEnVuelo: () => number
  /**
   * Consultas de TanStack Query que no estan en reposo (`consultasActivas`):
   * CUENTA las que esperan un reintento aunque no haya ningun fetch abierto.
   */
  consultasEnCurso: () => number
  /** Se llama una sola vez, cuando la pagina termino o se cumplio el tope. */
  alTerminar: () => void
  /** Reloj y temporizador, inyectables para las pruebas. */
  ahora?: () => number
  programar?: (fn: () => void, ms: number) => unknown
  /** Tope para que una peticion colgada no frene el build. */
  topeMs?: number
}

/**
 * Avisa cuando la pagina termino de pedir sus datos, para que el prerender la
 * guarde. Revisa cada 300 ms y termina tras dos revisiones seguidas en calma.
 *
 * EL DEFECTO (B23, 10-nov-2026). Hasta ese dia «en calma» era «ningun fetch en
 * curso». Cuando la API respondia 429, TanStack Query esperaba un segundo para
 * reintentar, y en esa espera no hay fetch abierto: dos revisiones en calma, la
 * pagina se daba por terminada y se horneaba en su esqueleto de carga. Ahora
 * tambien cuenta `consultasEnCurso`, que no vuelve a cero mientras una consulta
 * espera o hace su reintento. Si al final la pagina quedo con una consulta en
 * error o sin terminar, main.tsx lo escribe en `<html>` (`ATRIBUTO_INCOMPLETO`)
 * y el candado del build (`verificar-horneado.ts`) la detiene.
 */
export function avisarCuandoTermine(o: OpcionesFinDelRender): void {
  const ahora = o.ahora ?? Date.now
  const programar = o.programar ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const tope = o.topeMs ?? 15000
  const inicio = ahora()
  let enCalma = 0
  const revisar = () => {
    if (o.fetchesEnVuelo() === 0 && o.consultasEnCurso() === 0) enCalma++
    else enCalma = 0
    if (enCalma >= 2 || ahora() - inicio > tope) {
      o.alTerminar()
      return
    }
    programar(revisar, 300)
  }
  programar(revisar, 500)
}
