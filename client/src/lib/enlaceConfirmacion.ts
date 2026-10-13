/**
 * El enlace de confirmacion que llega del correo: `?confirm_token=...&email=...`.
 *
 * Lo leen /alertas y /subscribed. El servidor siempre manda los dos parametros
 * juntos y bien formados (el token lo genera `randomUUID`), asi que cualquier
 * otra cosa es un enlace recortado o escrito a mano. Se distingue de un enlace
 * ausente para no reflejar en pantalla texto que nadie genero y para no
 * celebrar una confirmacion que nunca ocurrio.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Misma idea que el servidor (`z.string().email().max(255)`): lo justo para no
// mostrar basura, sin pretender validar direcciones.
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type EnlaceConfirmacion =
  | { estado: 'ausente' }
  | { estado: 'valido'; token: string; email: string }
  | { estado: 'malformado' }

export function leerEnlaceConfirmacion(params: URLSearchParams): EnlaceConfirmacion {
  const token = params.get('confirm_token')
  const email = params.get('email')

  if (token === null && email === null) return { estado: 'ausente' }
  if (token && email && UUID.test(token) && email.length <= 255 && CORREO.test(email)) {
    return { estado: 'valido', token, email }
  }
  return { estado: 'malformado' }
}
