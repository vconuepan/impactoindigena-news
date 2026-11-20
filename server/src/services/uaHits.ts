import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { classifyUserAgent, type UaFamily } from '../lib/uaFamily.js'
import { seVerifica, verificarBuscador } from '../lib/verifySearchBot.js'

const log = createLogger('ua-hits')

/**
 * Cuenta, por dia, quien pide las paginas: navegadores y cada familia de robot.
 *
 * POR QUE (20-nov-2026): el filtro de robots descartaba el 51 % de los beacons
 * sin contarlos, y el 64 % de las cargas de fichas venia de clientes que no
 * ejecutan JavaScript y por eso nunca llegaban al panel. Esta tabla cuenta las
 * dos cosas, agregadas: no guarda IP, ni User-Agent completo, ni nada por
 * visitante. Una fila por (dia, superficie, familia, agente) con un contador.
 *
 * Dos superficies:
 *   'beacon'      los POST /api/track de robots (los de navegador ya cuentan en
 *                 page_views; aqui solo va lo que antes se tiraba).
 *   'ficha_html'  cada GET de /stories/* que sirve el backend, de cualquier
 *                 familia, navegador incluido. Comparar sus «navegador» con las
 *                 vistas de fichas de page_views dice cuantas cargas con cara de
 *                 navegador nunca ejecutaron JavaScript.
 *
 * Googlebot y Bingbot se verifican por DNS (lib/verifySearchBot.ts): el falso se
 * cuenta como `otro_robot` con agente «Googlebot (falso)».
 *
 * Tolera que la tabla no exista (despliegue antes del SQL): falla en silencio y
 * avisa una sola vez por proceso.
 */

export type Superficie = 'beacon' | 'ficha_html'

let avisado = false

export async function clasificarConVerificacion(
  ua: string | undefined | null,
  ip: string | undefined,
): Promise<{ family: UaFamily; agent: string }> {
  const c = classifyUserAgent(ua)
  if (c.family !== 'buscador' || !seVerifica(c.agent)) return c
  if (!ip) return { family: c.family, agent: `${c.agent} (sin verificar)` }
  const v = await verificarBuscador(c.agent, ip)
  if (v === 'verificado') return c
  if (v === 'falso') return { family: 'otro_robot', agent: `${c.agent} (falso)` }
  return { family: c.family, agent: `${c.agent} (sin verificar)` }
}

/** Suma 1 al contador del dia. Nunca lanza. */
export async function registrarVisitaPorFamilia(
  superficie: Superficie,
  ua: string | undefined | null,
  ip: string | undefined,
  ahora: Date = new Date(),
): Promise<void> {
  try {
    const { family, agent } = await clasificarConVerificacion(ua, ip)
    if (superficie === 'beacon' && family === 'navegador') return
    const dia = new Date(ahora)
    dia.setUTCHours(0, 0, 0, 0)
    await prisma.$executeRaw`
      INSERT INTO ua_hits_daily (id, date, surface, family, agent, count)
      VALUES (gen_random_uuid(), ${dia}, ${superficie}, ${family}, ${agent.slice(0, 64)}, 1)
      ON CONFLICT (date, surface, family, agent) DO UPDATE SET count = ua_hits_daily.count + 1
    `
  } catch (err) {
    if (!avisado) {
      avisado = true
      log.warn({ err }, 'no se pudo contar la visita por familia (¿falta aplicar el SQL de ua_hits_daily?)')
    }
  }
}

/** Solo para pruebas. */
export function _reiniciarAviso(): void {
  avisado = false
}
