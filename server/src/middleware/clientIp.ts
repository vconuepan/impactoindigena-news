import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { createLogger } from '../lib/logger.js'
import { clientIpFromForwardedFor, describeEntry } from '../lib/clientIp.js'

const log = createLogger('client-ip')

/** Cuantas peticiones por proceso anotan la forma de la cadena. */
const SHAPE_LOG_LIMIT = 10

/**
 * Hace que `req.ip` sea el LECTOR y no la salida del proxy (ver lib/clientIp.ts).
 *
 * Va primero, antes de los limitadores y del log, porque todo lo que cuenta por
 * `req.ip` -los limitadores de express-rate-limit, el hash del feedback- lo lee
 * ya resuelto. Si la cadena no tiene la forma esperada deja a Express como esta:
 * el peor caso es el comportamiento de antes, no un cupo regalado.
 *
 * Las primeras peticiones de cada proceso anotan la FORMA de X-Forwarded-For
 * (cuantas entradas, y si traen puerto), nunca su valor. Es como se mide la
 * topologia real sin escribir la IP de ningun lector: si `RateLimit-Remaining`
 * no baja de a uno para un mismo lector, este log dice cuantas entradas hay.
 */
export function resolveClientIp(fromRight: number): RequestHandler {
  let anotadas = 0

  return (req: Request, _res: Response, next: NextFunction) => {
    const xff = req.headers['x-forwarded-for']

    if (fromRight > 0 && xff !== undefined && anotadas < SHAPE_LOG_LIMIT) {
      anotadas++
      const entradas = (Array.isArray(xff) ? xff.join(',') : xff).split(',').map((e) => e.trim()).filter(Boolean)
      log.info(
        { entries: entradas.length, shape: entradas.map(describeEntry), fromRight },
        'x-forwarded-for shape (sin IPs)',
      )
    }

    const ip = clientIpFromForwardedFor(xff, fromRight)
    if (ip) {
      // `req.ip` es un getter del prototipo de Express: una propiedad propia lo tapa.
      Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true, writable: true })
    }
    next()
  }
}
