import { ApiError } from './api'

/**
 * ¿La página de verdad no existe? Solo dos casos: la API respondió 404, o
 * respondió sin datos. Un error de red o un 5xx NO cuenta.
 *
 * La distinción importa por el `noindex` (`components/NoIndex.tsx`): una página
 * que no existe se le marca a Google para que no la indexe; una que existe y
 * que justo falló cuando Googlebot pasó, no, o saldría del índice por una
 * caída de minutos.
 *
 * El defecto que esto corrige (2-nov-2026): la ficha de noticia calculaba
 * `!story || (error es 404)`, que da verdadero también con un 500 porque en
 * ese caso tampoco hay noticia. El mensaje «El servicio está temporalmente no
 * disponible» nunca aparecía.
 */
export function esNoEncontrado(error: unknown, data: unknown): boolean {
  if (error) return error instanceof ApiError && error.status === 404
  return data == null
}
