/**
 * Valida que un destino de navegación venido de la URL sea una ruta interna.
 *
 * Existe por el flujo de magic link: `?redirect_to=` llega desde la barra de
 * direcciones y termina en un `<Link to={...}>`. React Router 6/7 arrastra un
 * open redirect por backslash (GHSA-wrjc-x8rr-h8h6), pero el problema de fondo
 * es pasar un valor externo sin filtrar a la navegación: actualizar la librería
 * tapa ese CVE y no el siguiente. Esto lo cierra en el borde.
 *
 * Un open redirect duele más en un flujo de autenticación que en cualquier otro
 * lado: el enlace sale del dominio real, así que la víctima confía antes de
 * aterrizar en la página del atacante.
 *
 * Rechaza lo que el navegador podría leer como destino externo:
 *   //evil.com   → protocol-relative, sale del sitio
 *   /\evil.com   → los navegadores normalizan \ a / (el vector del CVE)
 *   https://…    → absoluto
 *   javascript:  → no es ruta
 */
export function safeInternalPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback

  // Una ruta interna siempre empieza con una sola barra.
  if (!value.startsWith('/')) return fallback

  // Segundo carácter barra o backslash = destino externo disfrazado de ruta.
  const second = value[1]
  if (second === '/' || second === '\\') return fallback

  // Los caracteres de control se cuelan en cabeceras y logs; no pertenecen a una ruta.
  if (/[\r\n\t\0]/.test(value)) return fallback

  return value
}
