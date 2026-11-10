import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * ¿Esta peticion la hace el build del frontend, con el secreto que lo autoriza
 * a saltarse el limitador publico?
 *
 * EL DEFECTO (B23, medido el 10-nov-2026). El prerender hornea 85 paginas en
 * unos dos minutos y cada una pide sus datos a la API publica, que admite 100
 * consultas cada 15 minutos por IP (`apiLimiter`). Una compilacion local hizo
 * 204 consultas: desde la 101 todas recibieron 429, la pagina quedaba esperando
 * el reintento y el prerender la guardaba en su esqueleto de carga, con el
 * titulo de la portada y sin tarjeta para compartir. En produccion pasaba de a
 * ratos: el 7-nov salieron asi nueve de las 16 comunidades; el 9-nov, ninguna.
 *
 * LA SALIDA. El build manda `x-prerender-token` con un secreto que tambien
 * conoce el App Service (`PRERENDER_BYPASS_TOKEN`). Solo salta `apiLimiter`, y
 * solo en lecturas (GET/HEAD, ver middleware/rateLimit.ts): los limitadores de
 * busqueda, acceso y suscripcion siguen contando igual.
 *
 * Por que no otra cosa:
 *  - subir el limite por defecto le da el cupo extra a cualquier IP, no al build;
 *  - reconocer al build por el User-Agent o por la IP de GitHub no autentica
 *    nada: los dos se falsifican o se comparten.
 *
 * Sin secreto configurado, o con uno de menos de LARGO_MINIMO caracteres, nadie
 * se salta nada. La comparacion es de tiempo constante: se comparan los hashes,
 * que miden lo mismo, para que el largo del secreto tampoco se filtre.
 */

export const ENCABEZADO_PRERENDER = 'x-prerender-token'

/** Un secreto mas corto se ignora: no protege nada y suele ser un error de copia. */
export const LARGO_MINIMO = 32

const huella = (s: string) => createHash('sha256').update(s, 'utf8').digest()

export function esPrerenderAutorizado(recibido: unknown, esperado: string): boolean {
  if (typeof esperado !== 'string' || esperado.length < LARGO_MINIMO) return false
  // Un encabezado repetido llega como arreglo: no es el build, que manda uno.
  if (typeof recibido !== 'string' || recibido.length === 0) return false
  return timingSafeEqual(huella(recibido), huella(esperado))
}
