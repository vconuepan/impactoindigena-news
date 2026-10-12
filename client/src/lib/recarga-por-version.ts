/**
 * Una pestaña abierta antes de un despliegue no se rompe al navegar.
 *
 * Cada despliegue del Static Web App reemplaza TODOS los assets: los chunks de
 * la version anterior pasan a 404 (medido el 6-oct-2026, cuatro despliegues en
 * tres horas). Una pestaña abierta antes conserva el JS viejo y, al navegar a
 * una pagina lazy, pide un chunk que ya no existe. Hasta ahora eso terminaba en
 * la pantalla «Failed to load page» y habia que recargar a mano.
 *
 * Ahora, si falla la carga de un chunk, la pagina se recarga sola UNA vez: el
 * index.html vigente (cache de 30 s con must-revalidate, y la recarga lo
 * revalida) trae los chunks nuevos. Si vuelve a fallar dentro de la ventana, no
 * se insiste: queda la pantalla con el boton, para no entrar en un bucle.
 */

const CLAVE = 'recarga-por-version'
/** Ventana en la que una segunda falla ya no recarga sola. */
export const VENTANA_MS = 60_000

/** Mensajes con que Chrome, Firefox, Safari y el precargador de Vite reportan un chunk que no llego. */
const FALLA_DE_CHUNK = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /Loading (?:CSS )?chunk [\w-]+ failed/i,
]

export function esFallaDeChunk(err: unknown): boolean {
  const mensaje = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return FALLA_DE_CHUNK.some((re) => re.test(mensaje))
}

interface Entorno {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  recargar: () => void
  ahora: number
  /** Sin red, un import dinamico tambien falla; recargar ahi cambia el boton por la pagina de error del navegador. */
  enLinea: boolean
}

function entornoReal(): Entorno {
  let storage: Entorno['storage'] = null
  try {
    storage = window.sessionStorage
  } catch {
    // Almacenamiento bloqueado: sin memoria de la ultima recarga no se recarga sola.
  }
  return { storage, recargar: () => window.location.reload(), ahora: Date.now(), enLinea: navigator.onLine }
}

/**
 * Recarga la pagina si hay red y no se recargo por este motivo en la ventana.
 * Devuelve true si recargo. Sin sessionStorage no recarga: no habria como cortar un bucle.
 */
export function recargarUnaVez(entorno: Entorno = entornoReal()): boolean {
  const { storage, recargar, ahora, enLinea } = entorno
  if (!enLinea || !storage) return false
  try {
    const ultima = Number(storage.getItem(CLAVE) ?? 0)
    if (ahora - ultima < VENTANA_MS) return false
    storage.setItem(CLAVE, String(ahora))
  } catch {
    return false
  }
  recargar()
  return true
}

/**
 * Vite emite `vite:preloadError` cuando falla la precarga de un import dinamico.
 * Si recarga, se cancela el error: la pagina ya se va.
 */
export function instalarRecargaPorVersion(): void {
  // El prerender (Chrome sin cabeza) no recarga: un chunk faltante ahi es un error del build.
  if (navigator.webdriver) return
  window.addEventListener('vite:preloadError', (event) => {
    if (recargarUnaVez()) event.preventDefault()
  })
}
