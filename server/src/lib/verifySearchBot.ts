import dns from 'node:dns/promises'

/**
 * ¿El que dice ser Googlebot o Bingbot lo es de verdad?
 *
 * El User-Agent se falsifica en una linea, y «soy Googlebot» es el disfraz
 * favorito porque casi nadie se atreve a bloquearlo. Google y Bing documentan la
 * misma prueba de dos pasos (verificada el 19-nov-2026 en sus paginas):
 *
 *   1. DNS inverso de la IP: el nombre debe terminar en un dominio suyo.
 *   2. DNS directo de ese nombre: debe devolver la MISMA IP. Sin este paso,
 *      cualquiera que controle el DNS inverso de su IP puede poner
 *      «crawl-1.googlebot.com».
 *
 * La IP se usa solo en memoria y en el momento, como ya hace la analitica para
 * el pais (Politica de Privacidad): no se escribe en la base ni en el log. El
 * cache guarda el veredicto por IP durante un dia para no repetir la consulta
 * en cada peticion de un mismo rastreador; vive en memoria y se pierde con cada
 * reinicio.
 */

export type Veredicto = 'verificado' | 'falso' | 'sin_verificar'

/** Dominios validos por agente, segun la documentacion de cada buscador. */
export const DOMINIOS: Record<string, string[]> = {
  Googlebot: ['googlebot.com', 'google.com', 'googleusercontent.com'],
  Bingbot: ['search.msn.com'],
}

export interface Resolver {
  reverse(ip: string): Promise<string[]>
  lookup(host: string): Promise<Array<{ address: string }>>
}

const resolverReal: Resolver = {
  reverse: (ip) => dns.reverse(ip),
  lookup: (host) => dns.lookup(host, { all: true }),
}

const TIMEOUT_MS = 2000
const TTL_MS = 24 * 60 * 60 * 1000
const MAX_CACHE = 5000

const cache = new Map<string, { veredicto: Veredicto; vence: number }>()

function terminaEn(host: string, dominio: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  return h === dominio || h.endsWith('.' + dominio)
}

function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), ms).unref?.()),
  ])
}

/** True si el agente tiene verificacion definida (hoy: Googlebot y Bingbot). */
export function seVerifica(agent: string): boolean {
  return agent in DOMINIOS
}

/**
 * Veredicto para `agent` desde `ip`. 'sin_verificar' si el DNS no respondio a
 * tiempo o fallo por la red: no se acusa de falso a quien no se pudo comprobar.
 * 'falso' si el DNS respondio y el nombre o la IP no calzan.
 */
export async function verificarBuscador(
  agent: string,
  ip: string,
  resolver: Resolver = resolverReal,
  ahora: number = Date.now(),
): Promise<Veredicto> {
  const dominios = DOMINIOS[agent]
  if (!dominios) return 'sin_verificar'

  const clave = `${agent}|${ip}`
  const enCache = cache.get(clave)
  if (enCache && enCache.vence > ahora) return enCache.veredicto

  let veredicto: Veredicto
  try {
    const nombres = await conTimeout(resolver.reverse(ip), TIMEOUT_MS)
    const suyo = nombres.find((n) => dominios.some((d) => terminaEn(n, d)))
    if (!suyo) {
      veredicto = 'falso'
    } else {
      const direcciones = await conTimeout(resolver.lookup(suyo), TIMEOUT_MS)
      veredicto = direcciones.some((d) => d.address === ip) ? 'verificado' : 'falso'
    }
  } catch (err) {
    // ENOTFOUND en el inverso = la IP no tiene nombre: un Googlebot real siempre
    // lo tiene, asi que es falso. Timeout u otro error de red = no se sabe.
    const code = (err as { code?: string }).code
    veredicto = code === 'ENOTFOUND' || code === 'ENODATA' ? 'falso' : 'sin_verificar'
  }

  if (veredicto !== 'sin_verificar') {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
    cache.set(clave, { veredicto, vence: ahora + TTL_MS })
  }
  return veredicto
}

/** Solo para pruebas. */
export function _vaciarCache(): void {
  cache.clear()
}
