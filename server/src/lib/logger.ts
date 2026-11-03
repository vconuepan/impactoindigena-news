import pino from 'pino'
import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const isProduction = process.env.NODE_ENV === 'production'
export const logDir = process.env.LOG_DIR || 'logs'
/**
 * Dias de retencion: entero >= 1, o 14. Un valor que no es numero hacia que
 * `borrarRegistrosSinFecha` borrara TODO (comparar contra NaN es siempre falso) y
 * que pino-roll dejara de borrar (`files.length > NaN` nunca es verdadero).
 */
export function diasDeRetencion(valor: string | undefined): number {
  const n = Number(valor ?? '14')
  return Number.isInteger(n) && n >= 1 ? n : 14
}
export const retentionDays = diasDeRetencion(process.env.LOG_RETENTION_DAYS)

/**
 * Opciones del archivo rotativo (pino-roll 4.0.0), en `LOG_DIR`.
 *
 * `dateFormat` NO es opcional. Sin fecha en el nombre, pino-roll numera
 * `server.1.log`, `server.2.log`… desde 1 cada dia, y su limpieza
 * (`removeOtherLogFiles`) ordena por numero: conservaba los 14 numeros mas altos
 * —`server.54` a `server.67`, de julio y agosto de 2026, para siempre— y cada dia
 * borraba los recientes, incluido EL ARCHIVO EN USO. Eso causaba dos defectos:
 *
 * - A3: el historial de 14 dias que promete la Politica nunca existia.
 * - A4: en un deploy conviven dos contenedores sobre `/home/LogFiles/app`, que es
 *   almacenamiento compartido. El 3-nov-2026 a las 00:00 el contenedor viejo roto
 *   a `server.9.log` y la limpieza se lo borro estando abierto; a las 00:57 el
 *   nuevo lo vio en el directorio, lo eligio y no pudo abrirlo: `ENOENT` sin
 *   manejar, y el arranque murio con codigo 1 (registro de arranque de Azure,
 *   `2026_11_03_lw1mdlwk0000UX_failure.log`). Misma firma el 19 y el 26-oct.
 *
 * Con fecha (`server.2026-11-03.1.log`), la limpieza ordena por fecha y despues
 * por numero: borra los mas viejos, y el del dia nunca es el borrado.
 *
 * `count` es `dias - 1`, y salio de medir, no del README. En una rotacion real,
 * pino-roll reabre el archivo nuevo y lanza la limpieza en el mismo instante: el
 * `readdir` de la limpieza casi siempre corre antes de que el archivo nuevo exista,
 * asi que quedan `count` viejos MAS el nuevo (medido rotando de verdad por una
 * revision independiente, 3-nov-2026). Si el archivo nuevo ya existe, quedan
 * `count` en total. Con `dias - 1` son 14 dias o, a lo sumo, 13: «hasta 14 dias»,
 * como promete la Politica. Con `count: 14` eran 15.
 *
 * `removeOtherLogFiles` sigue siendo necesario: sin el, la limpieza solo mira los
 * archivos que creo ESTE proceso, y cada deploy arranca uno nuevo.
 */
export function opcionesDelArchivo(dir: string, dias: number) {
  return {
    file: `${dir}/server.log`,
    frequency: 'daily',
    dateFormat: 'yyyy-MM-dd',
    limit: { count: Math.max(1, dias - 1), removeOtherLogFiles: true },
    mkdir: true,
  }
}

/** Formato sin fecha, anterior al 3-nov-2026. La limpieza de pino-roll ya no lo reconoce. */
const SIN_FECHA = /^server\.\d+\.log$/

/**
 * Borra los archivos de registro del formato sin fecha que pasaron el plazo de la
 * Politica. Con la fecha en el nombre, la limpieza de pino-roll ya no los ve: sin
 * esto, `server.54` a `server.67` (julio-agosto) y el ultimo `server.N.log` en
 * uso quedarian para siempre, con correos de lectores dentro aunque `maskEmail`
 * cubra la mayoria de los caminos. Por fecha de modificacion: el ultimo en uso se
 * va en la primera pasada despues de `dias` dias sin escribirse (corre al arrancar
 * y cada hora, `index.ts`). Solo toca archivos regulares llamados `server.<n>.log`.
 * Lanza solo si no puede leer el directorio por algo distinto de que no exista.
 */
export async function borrarRegistrosSinFecha(dir: string, dias: number, ahora: number = Date.now()): Promise<string[]> {
  const borrados: string[] = []
  if (!Number.isInteger(dias) || dias < 1) return borrados
  const limite = ahora - dias * 24 * 60 * 60 * 1000
  let nombres: string[]
  try {
    nombres = await readdir(dir)
  } catch (err) {
    // Sin directorio no hay nada que limpiar. Cualquier otra falla se informa: si
    // no, un permiso o un corte del disco dejaria los archivos para siempre sin senal.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return borrados
    throw err
  }
  for (const nombre of nombres) {
    if (!SIN_FECHA.test(nombre)) continue
    const ruta = join(dir, nombre)
    try {
      const st = await stat(ruta)
      if (!st.isFile() || st.mtimeMs >= limite) continue
      await unlink(ruta)
      borrados.push(nombre)
    } catch {
      // Otro contenedor puede estar borrandolo o usandolo: se reintenta en el proximo arranque.
    }
  }
  return borrados
}

/*
 * La salida estandar y el archivo van por caminos SEPARADOS. Hasta el 3-nov-2026
 * eran dos destinos del mismo transporte: si el archivo fallaba, `thread-stream`
 * destruia el transporte entero y cada linea posterior volvia a emitir el error.
 * Sin manejador, el proceso moria (A4); con un manejador y un solo transporte, el
 * servidor seguiria vivo pero sin ningun registro, ni el que ve Azure.
 *
 * Asi, si el archivo falla, la salida estandar sigue y el servidor tambien.
 */
const salida = isProduction
  ? pino.destination({ dest: 1, sync: false })
  : pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,module',
        messageFormat: '{module} | {msg}',
      },
    })

// `lastId` y `remove` existen en pino 10.3 (`lib/multistream.js`) pero sus tipos
// no los declaran.
const transports = pino.multistream([{ level: 'debug', stream: salida }]) as ReturnType<typeof pino.multistream> & {
  lastId: number
  remove(id: number): unknown
}

/** Cada cuanto se reintenta el archivo despues de una falla, y cuanto debe aguantar para darse por recuperado. */
export const REINTENTO_ARCHIVO_MS = Number(process.env.LOG_FILE_RETRY_MS) > 0 ? Number(process.env.LOG_FILE_RETRY_MS) : 10 * 60 * 1000
const RECUPERADO_TRAS_MS = Math.min(30 * 1000, REINTENTO_ARCHIVO_MS)
let fallasDelArchivo = 0

/**
 * Conecta el archivo rotativo al multistream. Si falla, se QUITA del multistream
 * (si no, cada linea posterior generaba un «the worker has exited» descartado) y
 * se reintenta cada 10 minutos. Se avisa en la primera falla, cada hora mientras
 * dure y al recuperarse, para que un hueco en el historial de 14 dias no pase
 * inadvertido.
 */
function conectarArchivo(): void {
  let archivo: ReturnType<typeof pino.transport>
  try {
    archivo = pino.transport({ target: 'pino-roll', options: opcionesDelArchivo(logDir, retentionDays) })
  } catch (err) {
    alFallarElArchivo(err as Error)
    return
  }
  transports.add({ level: 'debug', stream: archivo })
  const id = transports.lastId
  let caido = false
  archivo.on('error', (err: Error) => {
    if (caido) return
    caido = true
    transports.remove(id)
    alFallarElArchivo(err)
  })
  if (fallasDelArchivo > 0) {
    setTimeout(() => {
      if (caido) return
      logger.info({ logDir, fallas: fallasDelArchivo }, 'el archivo de registro se recupero')
      fallasDelArchivo = 0
    }, RECUPERADO_TRAS_MS).unref()
  }
}

function alFallarElArchivo(err: Error): void {
  fallasDelArchivo++
  if (fallasDelArchivo === 1 || fallasDelArchivo % 6 === 0) {
    logger.error(
      { err, logDir, fallas: fallasDelArchivo },
      'el archivo de registro fallo: el servidor sigue y registra por la salida estandar; se reintenta cada 10 minutos',
    )
  }
  setTimeout(conectarArchivo, REINTENTO_ARCHIVO_MS).unref()
}

/**
 * Custom error serializer that strips bulky axios internals (request, response,
 * config) to prevent OOM from serializing full HTML responses and socket objects.
 */
function redactSecrets(str: string): string {
  return str
    .replace(/sk-[a-zA-Z0-9\-_]{20,}/g, '[REDACTED_SK_KEY]')
    .replace(/Bearer [^\s"]+/g, 'Bearer [REDACTED]')
    .replace(/password["\s:=]+[^\s,"'}]+/gi, 'password=[REDACTED]')
}

/**
 * Enmascara los correos de un texto como `maskEmail`, también cuando vienen
 * codificados en una URL (`%40`). Brevo identifica contactos por correo en la
 * ruta (`/contacts/ana%40x.cl`) y el error de axios trae esa URL: sin esto, un
 * log que enmascaraba el campo `email` publicaba el correo completo al lado.
 */
export function redactarCorreos(str: string): string {
  // El lookbehind obliga a empezar al comienzo de una tira: sin él, cada
  // posición de una tira larga sin `@` volvía a recorrerla y el costo era
  // cuadrático (16 KB, medio segundo síncrono). El dominio termina en letras,
  // para no tomar por correo un `react@18.3.1` de una traza.
  return str.replace(
    /(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@|%40)((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g,
    '$1***$2$3',
  )
}

export function serializeError(err: any) {
  const serialized = pino.stdSerializers.err(err)
  if (serialized) {
    if (serialized.message) serialized.message = redactarCorreos(redactSecrets(serialized.message))
    if (serialized.stack) serialized.stack = redactarCorreos(redactSecrets(serialized.stack))
  }
  if (serialized && err?.isAxiosError) {
    return {
      type: serialized.type,
      message: serialized.message,
      stack: serialized.stack,
      code: err.code,
      status: err.response?.status,
      url: typeof err.config?.url === 'string' ? redactarCorreos(err.config.url) : err.config?.url,
    }
  }
  return serialized
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
    serializers: {
      err: serializeError,
    },
  },
  transports,
)

conectarArchivo()
if (process.env.LOG_RETENTION_DAYS !== undefined && String(retentionDays) !== process.env.LOG_RETENTION_DAYS.trim()) {
  logger.warn({ valor: process.env.LOG_RETENTION_DAYS, usado: retentionDays }, 'LOG_RETENTION_DAYS no es un entero >= 1: se usan 14 dias')
}

/**
 * Create a child logger scoped to a module.
 * Usage: const log = createLogger('scheduler')
 */
export function createLogger(module: string) {
  return logger.child({ module })
}

/**
 * Mask an email for logging: keep the first character of the local part and the
 * full domain, redact the rest (e.g. "v***@fundacionkm.org"). Keeps logs useful
 * for debugging without storing readers' emails in clear text (Ley 21.719,
 * principio de proporcionalidad/minimización).
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '[no-email]'
  const at = email.indexOf('@')
  if (at <= 0) return '[redacted-email]'
  return `${email[0]}***@${email.slice(at + 1)}`
}
