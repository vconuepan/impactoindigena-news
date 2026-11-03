/**
 * Supresión por correo: borrar a una persona de todo lo que guarda su
 * dirección, en esta base y en Brevo.
 *
 * POR QUÉ UN SOLO SERVICIO. Hasta el 3-nov-2026 había cuatro caminos de borrado
 * y cada uno limpiaba algo distinto: el autoservicio ARCO borraba todo; el
 * borrado de usuario del panel, solo la fila del usuario; el de suscriptor, solo
 * la fila local, y la persona seguía recibiendo el boletín porque la campaña se
 * envía a la lista de Brevo; y las alertas no tenían herramienta, así que una
 * baja pedida por correo obligaba a entrar a la base a mano. Todos llaman ahora
 * a estas funciones.
 *
 * EL CORREO SE COMPARA SIN MAYÚSCULAS, Y EXACTO. Las tablas guardan el correo
 * como se escribió, así que «Ana@x.cl» y «ana@x.cl» son la misma persona en
 * filas distintas. Prisma resuelve `mode: 'insensitive'` con ILIKE, donde `_` y
 * `%` son comodines: buscar «a_b@x.cl» también traería «axb@x.cl», el dato de
 * otra persona. Por eso la búsqueda trae candidatas y cada una se vuelve a
 * comparar exacta antes de borrar nada.
 *
 * BREVO VA PRIMERO, Y SI FALLA NO SE BORRA NADA LOCAL. Los ids de contacto
 * viven en las filas locales. Si se borraban las filas con Brevo caído, la
 * persona seguía en la lista, la campaña le llegaba, y ya no quedaba ningún
 * registro con su correo para reintentar (la revisión del 3-nov-2026 lo
 * encontró en el borrado de cuenta, que entonces seguía de largo). Ahora todos
 * los caminos se detienen y quien llamó responde un error para reintentar. Se
 * borra por cada id y además por el correo, que cubre a quien volvió tras una
 * baja (su alta no guardó id).
 */
import prisma from '../lib/prisma.js'
import { createLogger, maskEmail } from '../lib/logger.js'
import * as brevo from './brevo.js'

const log = createLogger('supresion')

/** Qué pasó con el contacto en Brevo. Un fallo no se devuelve: se lanza. */
export type EstadoBrevo = 'borrado' | 'no-estaba'

export interface ResultadoBoletin {
  suscripciones: number
  brevo: EstadoBrevo
}

export interface ResultadoSupresion extends ResultadoBoletin {
  cuentas: number
  alertas: number
  enlaces: number
  comentarios: number
}

export interface VistaPrevia {
  cuentas: number
  suscripciones: number
  alertas: number
  enlaces: number
  comentarios: number
  /** `desconocido`: Brevo no respondió, y no se sabe si guarda el correo. */
  brevo: 'esta' | 'no-esta' | 'desconocido'
}

/**
 * Brevo no respondió: no se borró nada en la base. Brevo puede haber borrado
 * parte (un id sí, el correo no); reintentar es seguro porque un 404 no cuenta
 * como fallo.
 */
export class BrevoNoRespondeError extends Error {
  constructor() {
    super('Brevo did not respond; nothing was deleted in the database')
    this.name = 'BrevoNoRespondeError'
  }
}

/** El correo es el de la cuenta de quien opera: no se suprime a sí mismo. */
export class SupresionPropiaError extends Error {
  constructor() {
    super('The email belongs to the operator’s own account')
    this.name = 'SupresionPropiaError'
  }
}

const CERO: ResultadoSupresion = { cuentas: 0, suscripciones: 0, alertas: 0, enlaces: 0, comentarios: 0, brevo: 'no-estaba' }

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase()
}

function estadoHttp(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

/** Filtro de candidatas para Prisma: trae de más (ILIKE), nunca de menos. */
export const candidatas = (objetivo: string) => ({ email: { equals: objetivo, mode: 'insensitive' as const } })
/** La comparación exacta que descarta lo que ILIKE trajo de más. */
export const esDe = (objetivo: string) => (fila: { email: string | null }) => fila.email?.toLowerCase() === objetivo

/** Lo que la base guarda de un correo, ya filtrado a coincidencia exacta. */
async function hallar(objetivo: string) {
  const [suscripciones, cuentas, alertas, enlaces, comentarios] = await Promise.all([
    prisma.pendingSubscription.findMany({
      where: candidatas(objetivo),
      select: { id: true, email: true, plunkContactId: true },
    }),
    prisma.user.findMany({ where: candidatas(objetivo), select: { id: true, email: true } }),
    prisma.alertSubscription.findMany({ where: candidatas(objetivo), select: { id: true, email: true } }),
    prisma.magicLink.findMany({ where: candidatas(objetivo), select: { id: true, email: true } }),
    prisma.feedback.findMany({ where: candidatas(objetivo), select: { id: true, email: true } }),
  ])
  const exacto = esDe(objetivo)
  return {
    suscripciones: suscripciones.filter(exacto),
    cuentas: cuentas.filter(exacto),
    alertas: alertas.filter(exacto),
    enlaces: enlaces.filter(exacto),
    comentarios: comentarios.filter(exacto),
  }
}

/**
 * Borra el contacto en Brevo por cada identificador. Un 404 solo dice que no
 * había nada; cualquier otro error es `fallo`, y gana sobre `borrado`.
 */
async function borrarEnBrevo(identificadores: string[], objetivo: string): Promise<EstadoBrevo | 'fallo'> {
  let borrado = false
  let fallo = false
  for (const id of identificadores) {
    try {
      await brevo.deleteContact(id)
      borrado = true
    } catch (err) {
      if (estadoHttp(err) === 404) continue
      fallo = true
      log.warn({ err, email: maskEmail(objetivo) }, 'brevo contact deletion failed')
    }
  }
  return fallo ? 'fallo' : borrado ? 'borrado' : 'no-estaba'
}

/**
 * Segundo borrado en Brevo, DESPUÉS de borrar las filas. Cierra la carrera con
 * una confirmación simultánea del mismo correo: si esa confirmación vio el 404
 * de nuestro primer borrado y recreó el contacto, y además marcó su fila antes
 * de nuestro deleteMany, nadie lo deshacía (cuarta revisión del 3-nov-2026).
 * El orden inverso lo cierra `confirmSubscription`: si la fila ya no está al
 * marcarla, borra el contacto que recreó. Las filas ya se fueron, así que un
 * fallo aquí solo se registra.
 */
async function barridoFinal(objetivo: string): Promise<void> {
  try {
    await brevo.deleteContact(objetivo)
  } catch (err) {
    if (estadoHttp(err) !== 404) log.warn({ err, email: maskEmail(objetivo) }, 'brevo final sweep failed')
  }
}

function identificadoresBrevo(filas: { plunkContactId: string | null }[], objetivo: string): string[] {
  const ids = filas.map((f) => f.plunkContactId).filter((id): id is string => !!id)
  return [...new Set([...ids, objetivo])]
}

/**
 * Saca a una persona del boletín: el contacto en Brevo y todas sus filas de
 * suscripción, confirmadas o no. No toca su cuenta ni sus alertas.
 */
export async function borrarDelBoletin(correo: string): Promise<ResultadoBoletin> {
  const objetivo = normalizarCorreo(correo)
  const { suscripciones } = await hallar(objetivo)
  const estado = await borrarEnBrevo(identificadoresBrevo(suscripciones, objetivo), objetivo)
  if (estado === 'fallo') throw new BrevoNoRespondeError()

  if (suscripciones.length === 0) return { suscripciones: 0, brevo: estado }
  const { count } = await prisma.pendingSubscription.deleteMany({ where: { id: { in: suscripciones.map((s) => s.id) } } })
  await barridoFinal(objetivo)
  return { suscripciones: count, brevo: estado }
}

/**
 * Supresión completa: cuenta (con sus cascadas: membresías, exclusiones del
 * digest, publicaciones, sesiones), boletín y contacto en Brevo, alertas,
 * enlaces mágicos y comentarios.
 *
 * CON `userId` LA CUENTA SE IDENTIFICA SOLO POR SU ID, y los datos por el
 * correo que la cuenta tiene HOY en la base, no por el que se pasa. El correo
 * del token de sesión puede ser viejo (dura 30 días y un admin puede cambiar
 * el correo de una cuenta), y ese correo viejo puede ser ya de otra persona
 * con su propia cuenta: buscar cuentas por él borraba la de ella. Sin `userId`
 * (la herramienta del panel) se borra toda cuenta con ese correo.
 *
 * Si la cuenta de `userId` ya no existe no se borra nada: el correo recibido
 * vendría de un token huérfano (segunda revisión del 3-nov-2026).
 *
 * `protegerUserId` aborta antes de borrar nada si alcanzaría esa cuenta.
 */
export async function suprimirPorCorreo(opts: {
  correo: string
  userId?: string
  protegerUserId?: string
}): Promise<ResultadoSupresion> {
  let objetivo = normalizarCorreo(opts.correo)
  const idsCuenta = new Set<string>()
  if (opts.userId) {
    const cuenta = await prisma.user.findUnique({ where: { id: opts.userId }, select: { email: true } })
    // Cuenta ya borrada: el correo recibido sale de un token que sobrevivió a
    // su cuenta y puede ser hoy de otra persona. No se borra nada por él.
    if (!cuenta) return { ...CERO }
    idsCuenta.add(opts.userId)
    objetivo = normalizarCorreo(cuenta.email)
  }

  const h = await hallar(objetivo)
  if (!opts.userId) for (const c of h.cuentas) idsCuenta.add(c.id)
  if (opts.protegerUserId && idsCuenta.has(opts.protegerUserId)) throw new SupresionPropiaError()

  const estado = await borrarEnBrevo(identificadoresBrevo(h.suscripciones, objetivo), objetivo)
  if (estado === 'fallo') throw new BrevoNoRespondeError()

  const ids = (filas: { id: string }[]) => ({ where: { id: { in: filas.map((f) => f.id) } } })
  const [cuentas, suscripciones, alertas, enlaces, comentarios] = await Promise.all([
    prisma.user.deleteMany({ where: { id: { in: [...idsCuenta] } } }),
    prisma.pendingSubscription.deleteMany(ids(h.suscripciones)),
    prisma.alertSubscription.deleteMany(ids(h.alertas)),
    prisma.magicLink.deleteMany(ids(h.enlaces)),
    prisma.feedback.deleteMany(ids(h.comentarios)),
  ])
  if (h.suscripciones.length > 0) await barridoFinal(objetivo)

  return {
    cuentas: cuentas.count,
    suscripciones: suscripciones.count,
    alertas: alertas.count,
    enlaces: enlaces.count,
    comentarios: comentarios.count,
    brevo: estado,
  }
}

/**
 * El correo que la cuenta tiene hoy en la base, o null si ya no existe. Null
 * no se reemplaza por el correo del token: ese token sobrevivió a su cuenta y
 * el correo puede ser ya de otra persona.
 */
export async function correoDeLaCuenta(userId: string): Promise<string | null> {
  const cuenta = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  return cuenta?.email ?? null
}

/**
 * Las suscripciones CONFIRMADAS de un correo, sin mayúsculas y exacto. El alta
 * guarda el correo como se escribió y el enlace mágico lo baja a minúsculas, así
 * que «Ana@x.cl» suscrita y «ana@x.cl» con sesión son la misma persona.
 */
export async function suscripcionesConfirmadas(correo: string) {
  const objetivo = normalizarCorreo(correo)
  const filas = await prisma.pendingSubscription.findMany({
    where: { ...candidatas(objetivo), confirmedAt: { not: null } },
    select: { id: true, email: true, confirmedAt: true },
  })
  return filas.filter(esDe(objetivo))
}

/** Lo que `suprimirPorCorreo` borraría, sin borrar nada. */
export async function vistaPreviaSupresion(correo: string): Promise<VistaPrevia> {
  const objetivo = normalizarCorreo(correo)
  const h = await hallar(objetivo)
  let enBrevo: VistaPrevia['brevo']
  try {
    await brevo.getContact(objetivo)
    enBrevo = 'esta'
  } catch (err) {
    enBrevo = estadoHttp(err) === 404 ? 'no-esta' : 'desconocido'
    if (enBrevo === 'desconocido') log.warn({ err, email: maskEmail(objetivo) }, 'brevo contact lookup failed')
  }
  return {
    cuentas: h.cuentas.length,
    suscripciones: h.suscripciones.length,
    alertas: h.alertas.length,
    enlaces: h.enlaces.length,
    comentarios: h.comentarios.length,
    brevo: enBrevo,
  }
}
