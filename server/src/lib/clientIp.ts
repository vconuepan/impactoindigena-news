import { isIP } from 'node:net'
import { expandIpv6 } from '../utils/urlValidation.js'

/**
 * La IP del lector detras de Static Web Apps, para quien necesita contar por
 * lector (los limitadores de tasa).
 *
 * EL PROBLEMA. El backend esta detras del proxy de Static Web Apps. Con
 * `trust proxy: 1`, `req.ip` es la ULTIMA entrada de X-Forwarded-For, que es la
 * salida del proxy y no el lector. Medido en produccion el 11-oct-2026 sobre
 * /api/health, con la misma conexion y la misma instancia: el contador de
 * `RateLimit-Remaining` iba 97, 98, 98, 97, 99. Un contador que sube y baja
 * dentro de un mismo proceso significa que la clave cambia de una peticion a
 * otra: los cupos eran de un conjunto de direcciones del proxy y no de nadie en
 * particular. Un lector que agotaba el suyo no se distinguia de otro, y un
 * atacante repartia sus intentos entre cupos distintos.
 *
 * LA CADENA. X-Forwarded-For llega como `lector[:puerto], salida-del-proxy`: el
 * borde de Static Web Apps agrega al lector y el App Service agrega la salida de
 * Static Web Apps. Lo que escribe el cliente queda A LA IZQUIERDA, asi que se
 * cuenta DESDE LA DERECHA: la entrada que pusieron nuestros propios saltos no se
 * puede falsificar, y un prefijo inventado solo desplaza posiciones que no
 * miramos. Por eso no sirve la primera entrada, que es la que escribe el cliente
 * cuando el proxy agrega en vez de reemplazar.
 *
 * El numero de saltos desde la derecha vive en `CLIENT_IP_FROM_RIGHT` (por
 * defecto 2: el lector es la penultima entrada). Si la cadena real fuera mas
 * larga, se sube sin tocar codigo; con 0 se apaga y vuelve el comportamiento de
 * Express.
 */

/** "1.2.3.4:5678" -> "1.2.3.4"; "[2001:db8::1]:443" -> "2001:db8::1". */
export function stripPort(entry: string): string {
  const e = entry.trim()
  const corchetes = e.match(/^\[([^\]]+)\](?::\d+)?$/)
  if (corchetes) return corchetes[1]
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(e)) return e.slice(0, e.lastIndexOf(':'))
  return e
}

/**
 * La FORMA de una entrada, sin su valor. Sirve para anotar en el log como llega
 * la cadena sin escribir la IP de nadie: una IP de lector es un dato personal.
 */
export function describeEntry(entry: string): 'v4' | 'v4:port' | 'v6' | 'v6:port' | 'other' {
  const e = entry.trim()
  const conPuerto = stripPort(e) !== e
  const ip = stripPort(e)
  const tipo = isIP(ip)
  if (tipo === 4) return conPuerto ? 'v4:port' : 'v4'
  if (tipo === 6) return conPuerto ? 'v6:port' : 'v6'
  return 'other'
}

const hex = (n: number) => n.toString(16)

/**
 * La clave con la que se cuenta a un lector, o null si no es una IP.
 *  - IPv4: ella misma.
 *  - IPv4 mapeada en IPv6 (::ffff:a.b.c.d): la IPv4.
 *  - IPv6: el /64, devuelto como la direccion de red (`2001:db8:aaaa:1::`). Un
 *    lector con IPv6 recibe un /64 entero, y sin agrupar le bastaria cambiar de
 *    direccion dentro de su bloque para tener un cupo nuevo en cada peticion. La
 *    salida sigue siendo una IPv6 valida: express-rate-limit valida `req.ip`.
 */
export function canonicalLimitIp(ip: string): string | null {
  const tipo = isIP(ip)
  if (tipo === 4) return ip
  if (tipo !== 6) return null
  const g = expandIpv6(ip)
  if (!g) return null
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`
  }
  return `${hex(g[0])}:${hex(g[1])}:${hex(g[2])}:${hex(g[3])}::`
}

/**
 * El lector segun X-Forwarded-For, contando `fromRight` entradas desde la
 * derecha (1 = la ultima). null si no hay suficientes entradas, si la elegida no
 * es una IP o si `fromRight` es menor que 1: quien llama usa entonces la
 * direccion que Express ya calculo.
 */
export function clientIpFromForwardedFor(
  header: string | string[] | undefined,
  fromRight: number,
): string | null {
  if (!Number.isInteger(fromRight) || fromRight < 1) return null
  const crudo = Array.isArray(header) ? header.join(',') : (header ?? '')
  const entradas = crudo.split(',').map((e) => e.trim()).filter(Boolean)
  if (entradas.length < fromRight) return null
  return canonicalLimitIp(stripPort(entradas[entradas.length - fromRight]))
}
