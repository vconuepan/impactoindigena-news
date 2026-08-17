/**
 * robots.ts — respeto de robots.txt antes de extraer el contenido de un articulo.
 *
 * POR QUE EXISTE. El crawler parte del RSS que el medio publica, pero despues
 * descarga el HTML del articulo para extraerle el texto. Eso es scraping, y
 * hasta el 17-ago-2026 se hacia sin mirar robots.txt: cero referencias al
 * archivo en todo el servidor. Un medio que aspira a que otros medios lo
 * respeten deberia respetar la senal que esos medios publican.
 *
 * QUE COSTO TIENE. Ninguno, medido antes de implementarlo: se consultaron los
 * robots.txt de los 80 dominios con mas articulos (1.432 de los 2.000
 * publicados), probando la URL REAL de un articulo de cada uno. **Cero
 * bloquean a este crawler.** Dato aparte que vale conocer: 20 de esos 80 —The
 * Guardian, Al Jazeera, La Jornada, The Hindu, RNZ— bloquean explicitamente a
 * GPTBot y CCBot, los bots de entrenamiento de modelos. A nosotros no, y la
 * diferencia importa: este sitio no entrena modelos con lo que crawlea.
 *
 * FAIL-OPEN, a proposito. Si robots.txt no existe, no responde o esta
 * corrupto, se permite. Es el estandar del protocolo: la ausencia de reglas es
 * permiso, no prohibicion. Solo se bloquea ante una regla explicita que nos
 * excluya, porque un fallo de red del lado del medio no debe silenciar su
 * cobertura.
 *
 * NO implementa `Crawl-delay`. El ritmo ya lo limitan la concurrencia del
 * crawler y el `ApiThrottle`; sumar una tercera fuente de espera pediria
 * medirla antes. Queda anotado como lo siguiente si algun medio lo pide.
 */
import axios from 'axios'
import { createLogger } from './logger.js'

// `robots-parser` trae un `.d.ts` que abre con `declare module 'robots-parser';`
// sin cuerpo, y eso hace que TypeScript trate al modulo entero como `any` e
// ignore el `export default` que viene mas abajo en el mismo archivo. De ahi
// que el tipo se declare aca: es el contrato minimo que usamos, y el import
// default funciona en runtime porque `esModuleInterop` esta activo.
interface Robot {
  isAllowed(url: string, userAgent?: string): boolean | undefined
}
import robotsParserRaw from 'robots-parser'
const robotsParser = robotsParserRaw as unknown as (url: string, contents: string) => Robot

const log = createLogger('robots')

/**
 * El token con el que nos identificamos ante robots.txt.
 *
 * Es el mismo nombre que va dentro del User-Agent del extractor. Ese
 * User-Agent empieza con "Mozilla/5.0 (compatible; ...)" porque varios sitios
 * institucionales devuelven 403 a cualquier cosa que no parezca un navegador,
 * pero la identificacion real —nombre del bot y URL de contacto— viaja igual,
 * y es la que un robots.txt puede nombrar para permitirnos o excluirnos.
 */
export const ROBOTS_USER_AGENT = 'ImpactoIndigenaCrawler'

const CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 h: robots.txt cambia poco
const FETCH_TIMEOUT_MS = 8_000
const MAX_ROBOTS_BYTES = 512 * 1024

interface CacheEntry {
  robot: Robot | null // null = sin robots.txt utilizable ⇒ todo permitido
  expiry: number
}

const cache = new Map<string, CacheEntry>()

/** Vacia la cache. Solo para tests. */
export function clearRobotsCache(): void {
  cache.clear()
}

async function loadRobots(origin: string): Promise<Robot | null> {
  const cached = cache.get(origin)
  if (cached && cached.expiry > Date.now()) return cached.robot

  const robotsUrl = `${origin}/robots.txt`
  let robot: Robot | null = null

  try {
    const res = await axios.get(robotsUrl, {
      timeout: FETCH_TIMEOUT_MS,
      maxContentLength: MAX_ROBOTS_BYTES,
      responseType: 'text',
      // Un 404 es la respuesta mas comun y significa "sin reglas": no es un
      // error que merezca ruido en los logs.
      validateStatus: () => true,
      headers: { 'User-Agent': ROBOTS_USER_AGENT },
    })
    if (res.status === 200 && typeof res.data === 'string') {
      robot = robotsParser(robotsUrl, res.data)
    }
  } catch (err) {
    log.debug({ origin, err: (err as Error).message }, 'robots.txt no disponible, se permite')
  }

  cache.set(origin, { robot, expiry: Date.now() + CACHE_TTL_MS })
  return robot
}

/**
 * Devuelve true si robots.txt permite que extraigamos esta URL.
 *
 * Fail-open: cualquier duda —URL invalida, sin robots.txt, red caida— devuelve
 * true. Solo una regla explicita que nos excluya devuelve false.
 */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return true // URL que no parsea: que falle mas adelante, no aca
  }

  const robot = await loadRobots(origin)
  if (!robot) return true

  const allowed = robot.isAllowed(url, ROBOTS_USER_AGENT)
  // `isAllowed` devuelve undefined cuando no hay regla aplicable ⇒ permitido.
  return allowed !== false
}
