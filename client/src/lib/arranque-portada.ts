import type { QueryClient } from '@tanstack/react-query'

/**
 * La portada prerenderizada se queda en pantalla hasta que React tiene datos.
 *
 * EL DEFECTO QUE ESTO CORRIGE, medido en la traza de Lighthouse el 6-oct-2026:
 * el HTML de la portada ya trae el hero, y el navegador pide su imagen desde
 * el primer byte (preload scanner). Pero `createRoot().render()` corre en
 * cuanto llega el bundle, DESCARTA ese DOM y pinta el esqueleto; la imagen
 * del hero terminaba de bajar justo cuando React la borraba, asi que nunca
 * llegaba a pintarse. El hero volvia a aparecer solo cuando llegaba
 * `homepage.json` y React lo volvia a montar: ese segundo pintado era el LCP.
 * Por eso el LCP movil dependia de JS + datos + render (6-8 s simulados) y no
 * de la imagen (que estaba lista a los ~1,5 s). En la traza: un solo candidato
 * de imagen, a 1.757 ms, con la descarga terminada a 1.540.
 *
 * LA CORRECCION: en la portada prerenderizada, antes de montar React se espera
 * el snapshot (que ya viene precargado y que `public/preload-hero.js` dejo
 * pidiendo en `window.__snapshotPortada`) y se siembra en la cache de React
 * Query. El primer render de React ya trae el hero con la imagen en cache: no
 * hay esqueleto intermedio y el pintado prerenderizado sobrevive como LCP.
 *
 * Tiene tope: si el snapshot tarda mas de `topeMs`, React se monta igual y el
 * hook pide los datos como siempre. Fuera de la portada, o sin HTML
 * prerenderizado (el prerender mismo, las fichas que sirve el backend con el
 * root vacio, el desarrollo), no hace nada.
 */
export const CLAVE_DATOS_PORTADA = ['homepage-data'] as const

export const TOPE_SNAPSHOT_MS = 4000

interface Entorno {
  pathname: string
  root: HTMLElement | null
  snapshotUrl: string
  queryClient: Pick<QueryClient, 'setQueryData'>
  /** La promesa que dejo `preload-hero.js`, si corrio antes. */
  snapshotPendiente?: Promise<unknown> | undefined
  topeMs?: number
  fetchFn?: typeof fetch
}

/** Devuelve true si sembro los datos; false si se monta sin ellos. */
export async function datosDePortadaAntesDeMontar(e: Entorno): Promise<boolean> {
  if (e.pathname !== '/' || !e.snapshotUrl) return false
  if (!e.root || e.root.childElementCount === 0) return false

  const tope = e.topeMs ?? TOPE_SNAPSHOT_MS
  const fetchFn = e.fetchFn ?? fetch
  let temporizador: ReturnType<typeof setTimeout> | undefined

  const datos = (async () => {
    if (e.snapshotPendiente) return e.snapshotPendiente
    const r = await fetchFn(e.snapshotUrl)
    if (!r.ok) throw new Error(`snapshot ${r.status}`)
    return r.json()
  })()
  const vencimiento = new Promise<null>((resolver) => {
    temporizador = setTimeout(() => resolver(null), tope)
  })

  try {
    const j = await Promise.race([datos, vencimiento])
    if (!j || typeof j !== 'object' || !('storiesByIssue' in j)) return false
    e.queryClient.setQueryData(CLAVE_DATOS_PORTADA, j)
    return true
  } catch {
    return false
  } finally {
    if (temporizador) clearTimeout(temporizador)
  }
}
