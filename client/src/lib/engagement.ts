/**
 * Avisa, una sola vez, que en la pagina hubo interaccion humana.
 *
 * POR QUE (20-nov-2026): el panel no distingue a un lector de un robot que
 * ejecuta JavaScript y se disfraza de navegador. Una señal que un robot que solo
 * carga la pagina no da: que alguien hizo scroll, toco, presiono una tecla o
 * movio el mouse, Y que la pestaña estuvo visible al menos 5 segundos. Se cuenta
 * el teclado y el foco para no dejar fuera a quien usa lector de pantalla.
 * Diagnostico en docs/propuesta-analytics-bots.md (fase 3, A).
 *
 * Sin cookies ni almacenamiento del navegador: solo un aviso al servidor, que
 * marca «hubo interaccion» para el visitante del dia (server/.../track.ts).
 * No mide cuanto ni donde: solo si o no.
 */

const EVENTOS = ['scroll', 'wheel', 'pointerdown', 'pointermove', 'touchstart', 'keydown', 'focusin'] as const

export interface OpcionesVigilancia {
  alInteractuar: () => void
  /** Tiempo minimo con la pestaña visible. */
  minVisibleMs?: number
  /** Cada cuanto se suma tiempo visible. */
  pasoMs?: number
  doc?: Document
  win?: Window
}

/** Empieza a vigilar. Devuelve la funcion que deja de hacerlo. */
export function vigilarInteraccion({
  alInteractuar,
  minVisibleMs = 5000,
  pasoMs = 1000,
  doc = document,
  win = window,
}: OpcionesVigilancia): () => void {
  let interactuo = false
  let visibleMs = 0
  let terminado = false

  const limpiar = () => {
    if (terminado) return
    terminado = true
    win.clearInterval(reloj)
    for (const e of EVENTOS) win.removeEventListener(e, marcar, true)
  }

  const comprobar = () => {
    if (!terminado && interactuo && visibleMs >= minVisibleMs) {
      limpiar()
      alInteractuar()
    }
  }

  function marcar() {
    interactuo = true
    comprobar()
  }

  const reloj = win.setInterval(() => {
    if (doc.visibilityState === 'visible') visibleMs += pasoMs
    comprobar()
  }, pasoMs)

  // En captura: un scroll dentro de un contenedor no burbujea hasta window.
  for (const e of EVENTOS) win.addEventListener(e, marcar, { passive: true, capture: true })

  return limpiar
}
