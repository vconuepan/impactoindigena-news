import { randomUUID } from 'crypto'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import * as brevo from './brevo.js'
import { createLogger, maskEmail } from '../lib/logger.js'

const log = createLogger('subscribe')

const CLIENT_URL = process.env.CLIENT_URL || 'https://vocesindigenas.org'
const API_URL = process.env.API_URL || 'https://vocesindigenas.org'

export class EmailValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailValidationError'
  }
}

/**
 * No se pudo entregar el correo de confirmacion.
 *
 * Existe para que la ruta pueda DISTINGUIRLO del resto de los errores. Todo lo
 * demas responde «revisa tu correo» aunque haya fallado, y con razon: decir si
 * una direccion ya estaba suscrita filtraria quien lo esta. Pero un fallo de
 * ENTREGA no revela nada de la direccion —el mismo fallo le ocurre a cualquiera
 * cuando el proveedor esta caido—, y callarlo deja a la persona esperando un
 * correo que no va a llegar, sin nada que indique que hay que reintentar.
 *
 * Hasta el 11-sep-2026 ese caso era invisible para todos: el visitante veia
 * «revisa tu correo» y el panel no mostraba nada. Con un embudo de ocho
 * contactos, una caida de dias no se habria notado.
 */
export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailDeliveryError'
  }
}

interface SubscribeParams {
  email: string
  firstName?: string
  language?: 'es' | 'en'
}

export async function subscribe({ email, firstName, language = 'es' }: SubscribeParams) {
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + config.subscribe.confirmTokenExpiryHours * 60 * 60 * 1000)

  // Check if already confirmed
  const existing = await prisma.pendingSubscription.findFirst({
    where: { email, confirmedAt: { not: null } },
  })
  if (existing) {
    log.info({ email: maskEmail(email) }, 'already subscribed, returning success without action')
    return
  }

  // Verify email via Brevo (graceful degradation — skip if API fails)
  try {
    const result = await brevo.verifyEmail(email)
    if (!result.valid) {
      throw new EmailValidationError('Please enter a valid email address.')
    }
    if (!result.domainExists) {
      throw new EmailValidationError('Please enter a valid email address.')
    }
    if (result.isDisposable) {
      throw new EmailValidationError('Disposable email addresses are not allowed. Please use a permanent email.')
    }
  } catch (err) {
    if (err instanceof EmailValidationError) throw err
    log.warn({ err, email: maskEmail(email) }, 'email verification failed, skipping check')
  }

  // Delete any existing unconfirmed pending subscriptions for this email.
  // This handles the re-subscribe case: user gets a fresh token and a new
  // confirmation email instead of accumulating stale entries.
  await prisma.pendingSubscription.deleteMany({
    where: { email, confirmedAt: null },
  })

  // Create contact in Brevo (subscribed: false until confirmed)
  let plunkContactId: string | null = null
  try {
    const contact = await brevo.createContact({
      email,
      subscribed: false,
      data: { ...(firstName ? { NOMBRE: firstName } : {}) },
    })
    plunkContactId = contact.id
  } catch (err) {
    log.warn({ err, email: maskEmail(email) }, 'failed to create Brevo contact, proceeding with subscription')
  }

  // Store pending subscription
  await prisma.pendingSubscription.create({
    data: {
      email,
      token,
      plunkContactId,
      expiresAt,
    },
  })

  // Send confirmation email
  const confirmUrl = `${API_URL}/api/subscribe/confirm?token=${token}&email=${encodeURIComponent(email)}`
  const safeFirstName = firstName
    ? firstName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    : undefined

  const isEn = language === 'en'
  const subject = isEn
    ? 'Confirm your subscription to Voces Indígenas'
    : 'Confirma tu suscripción a Voces Indígenas'
  const greeting = isEn
    ? (safeFirstName ? `Hi ${safeFirstName},` : 'Hi,')
    : (safeFirstName ? `Hola ${safeFirstName},` : 'Hola,')
  const headingText = isEn ? 'Confirm your subscription' : 'Confirma tu suscripción'
  const bodyText = isEn
    ? `${greeting} Click the button below and, on the page that opens, confirm your subscription.`
    : `${greeting} Haz clic en el botón y, en la página que se abre, confirma tu suscripción.`
  const tagline = isEn
    ? 'News that matters to indigenous peoples. Weekly to your inbox. Curated with care by AI.'
    : 'Noticias que importan a los pueblos indígenas. Semanal en tu correo. Curado con cuidado por IA.'
  const buttonText = isEn ? 'Confirm Subscription' : 'Confirmar suscripción'
  const expiryText = isEn
    ? `This link expires in ${config.subscribe.confirmTokenExpiryHours} hours. If you didn't request this, you can safely ignore this email.`
    : `Este enlace expira en ${config.subscribe.confirmTokenExpiryHours} horas. Si no solicitaste esto, puedes ignorar este correo.`

  const html = `<!DOCTYPE html>
<html lang="${language ?? 'es'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fdf2f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:3px solid #ec268f;">
              <h1 style="margin:0;font-size:22px;font-weight:800;color:#171717;">Voces Indígenas</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;font-size:20px;color:#171717;">${headingText}</h2>
              <p style="margin:0 0 8px;font-size:15px;color:#525252;line-height:1.6;">${bodyText}</p>
              <p style="margin:0 0 24px;font-size:14px;color:#737373;line-height:1.5;font-style:italic;">${tagline}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:6px;background-color:#d41f7f;">
                    <a href="${confirmUrl}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">${buttonText}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#a3a3a3;">${expiryText}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  try {
    await brevo.sendTransactional({
      to: email,
      subject,
      body: html,
    })
    log.info({ email: maskEmail(email) }, 'confirmation email sent')
  } catch (err) {
    log.error({ err, email: maskEmail(email) }, 'failed to send confirmation email')
    throw new EmailDeliveryError('Failed to send confirmation email')
  }
}

export async function confirmSubscription(token: string, email: string) {
  const pending = await prisma.pendingSubscription.findFirst({
    where: { token, email },
  })

  if (!pending) {
    throw new Error('Invalid confirmation link')
  }

  if (pending.confirmedAt) {
    return // Already confirmed
  }

  if (new Date() > pending.expiresAt) {
    throw new Error('Confirmation link has expired')
  }

  // Update Brevo contact to subscribed.
  //
  // Se cae al correo como identificador cuando no hay id, que es justo el caso
  // de quien vuelve tras darse de baja: su contacto YA existe en Brevo, asi que
  // el `createContact` del alta fallo por duplicado y dejo `plunkContactId` en
  // null. Sin esto, esa persona confirmaba su re-alta y no volvia a recibir
  // nada — y el job de reconciliacion le borraba la fila al dia siguiente,
  // dejandola en un ciclo silencioso.
  const identificador = pending.plunkContactId || email
  let recreado = false
  try {
    await brevo.updateContact(identificador, {
      subscribed: true,
    })
  } catch (err) {
    // Un 404 es que el contacto ya no está: la limpieza de altas abandonadas
    // pudo borrarlo justo mientras esta persona volvía a suscribirse (revisión
    // del 3-nov-2026). Sin crearlo, la fila quedaba confirmada y nadie en la
    // lista: «suscrito» en el perfil y ningún boletín.
    const status = (err as { response?: { status?: number } })?.response?.status
    // Antes de crearlo se relee la fila: si un borrado (ARCO, baja, panel)
    // corrió mientras tanto, el 404 es ese borrado, y recrearlo volvería a
    // meter en la lista a quien acaba de pedir salir. La relectura no cierra
    // la ventana entera: un borrado que ya borró en Brevo y aún no las filas
    // pasa. Si la fila desaparece antes de marcarla, el final de esta función
    // borra el contacto recreado; si desaparece después, lo borra el segundo
    // barrido de la supresión (`barridoFinal`, services/supresion.ts).
    const sigue = status === 404 && (await prisma.pendingSubscription.findUnique({ where: { id: pending.id }, select: { id: true } }))
    if (status === 404 && !sigue) {
      log.warn({ email: maskEmail(email) }, 'subscription deleted while confirming, Brevo contact not recreated')
      throw new Error('Invalid confirmation link')
    }
    if (status === 404) {
      try {
        await brevo.createContact({ email, subscribed: true, data: {} })
        recreado = true
      } catch (errCrear) {
        log.warn({ err: errCrear, email: maskEmail(email) }, 'failed to recreate Brevo contact, marking as confirmed anyway')
      }
    } else {
      log.warn({ err, email: maskEmail(email) }, 'failed to update Brevo contact, marking as confirmed anyway')
    }
  }

  // Mark as confirmed
  try {
    await prisma.pendingSubscription.update({
      where: { id: pending.id },
      data: { confirmedAt: new Date() },
    })
  } catch (err) {
    if ((err as { code?: string })?.code !== 'P2025') throw err
    // La fila se borró mientras confirmaba: hubo un borrado en curso. Si este
    // alta recreó el contacto, se deshace, o quien pidió salir quedaría en la
    // lista sin ninguna fila para encontrarlo.
    if (recreado) {
      try {
        await brevo.deleteContact(email)
      } catch (errBorrar) {
        log.warn({ err: errBorrar, email: maskEmail(email) }, 'failed to undo recreated Brevo contact')
      }
    }
    throw new Error('Invalid confirmation link')
  }

  log.info({ email: maskEmail(email) }, 'subscription confirmed')
}

/**
 * Pasado este plazo desde que venció, la fila se borra aunque Brevo siga sin
 * responder: reintentar a diario no puede volverse guardar el correo sin plazo.
 */
const ABANDONO_TOPE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Remove abandoned double opt-in records: unconfirmed pending subscriptions
 * whose confirmation token has already expired. These can never be confirmed
 * (confirmSubscription rejects expired tokens) and serve no further purpose,
 * yet they retain the visitor's email. Confirmed subscriptions are kept — they
 * back the "already subscribed" idempotency check in subscribe(). Supports the
 * storage-limitation principle of Ley 21.719 (conservación limitada).
 *
 * EL CONTACTO EN BREVO TAMBIÉN. El alta crea el contacto antes de que la
 * persona confirme (`subscribe()`), así que hasta el 3-nov-2026 quien nunca
 * confirmaba perdía la fila acá y su correo quedaba en Brevo para siempre. Se
 * borra solo si es residuo puro: ninguna otra fila del mismo correo (una
 * suscripción confirmada, o un alta nueva en curso, comparten el contacto), en
 * ninguna lista y no en la lista de supresión de Brevo (esa baja es memoria que
 * sirve). Si Brevo falla, la fila se queda y se reintenta al día siguiente.
 */
export async function cleanupExpiredPendingSubscriptions(): Promise<number> {
  const ahora = Date.now()
  const vencidas = await prisma.pendingSubscription.findMany({
    where: { confirmedAt: null, expiresAt: { lt: new Date(ahora) } },
    select: { id: true, email: true, expiresAt: true },
  })
  if (vencidas.length === 0) return 0

  const idsVencidas = new Set(vencidas.map((v) => v.id))
  const porCorreo = new Map<string, typeof vencidas>()
  for (const v of vencidas) {
    const correo = v.email.toLowerCase()
    porCorreo.set(correo, [...(porCorreo.get(correo) ?? []), v])
  }

  const aBorrar: string[] = []
  for (const [correo, filas] of porCorreo) {
    if (await soltarContactoAbandonado(correo, idsVencidas)) {
      aBorrar.push(...filas.map((f) => f.id))
    } else {
      aBorrar.push(...filas.filter((f) => ahora - f.expiresAt.getTime() > ABANDONO_TOPE_MS).map((f) => f.id))
    }
  }
  if (aBorrar.length === 0) return 0

  const result = await prisma.pendingSubscription.deleteMany({ where: { id: { in: aBorrar } } })
  return result.count
}

/**
 * Deja Brevo sin el contacto de un alta abandonada, si era residuo puro.
 * `true`: no queda nada que hacer allá y la fila local puede irse. `false`:
 * Brevo falló y conviene conservar la fila para reintentar.
 */
async function soltarContactoAbandonado(correo: string, idsVencidas: Set<string>): Promise<boolean> {
  // ILIKE trata `_` y `%` como comodines: se vuelve a comparar exacto.
  const hermanas = (
    await prisma.pendingSubscription.findMany({
      where: { email: { equals: correo, mode: 'insensitive' } },
      select: { id: true, email: true },
    })
  ).filter((f) => f.email.toLowerCase() === correo && !idsVencidas.has(f.id))
  if (hermanas.length > 0) return true

  const estado = (err: unknown) => (err as { response?: { status?: number } })?.response?.status
  let contacto: brevo.ContactDetail
  try {
    contacto = await brevo.getContact(correo)
  } catch (err) {
    if (estado(err) === 404) return true
    log.warn({ err, email: maskEmail(correo) }, 'abandoned signup: brevo lookup failed, row kept for retry')
    return false
  }
  if (contacto.listIds.length > 0 || !contacto.subscribed) return true

  try {
    await brevo.deleteContact(contacto.id)
    log.info({ email: maskEmail(correo) }, 'abandoned signup: brevo contact deleted')
    return true
  } catch (err) {
    if (estado(err) === 404) return true
    log.warn({ err, email: maskEmail(correo) }, 'abandoned signup: brevo deletion failed, row kept for retry')
    return false
  }
}

/**
 * Borra las suscripciones confirmadas de quienes ya se dieron de baja en Brevo.
 *
 * EL HUECO QUE ESTO CIERRA. La Política declara «Suscriptores del boletín o
 * alertas: mientras la suscripción esté activa; se eliminan o anonimizan tras
 * la baja», y señala como mecanismo el enlace del pie de cada correo. Ese
 * enlace es el merge tag de Brevo: da de baja allá y no toca esta base. El
 * único job de purga que existía borra solo las NO confirmadas, así que quien
 * se daba de baja dejaba de recibir correos y su dirección se quedaba aquí de
 * forma indefinida, sin plazo ni proceso que la alcanzara.
 *
 * POR QUÉ RECONCILIAR Y NO UN ENLACE PROPIO. El boletín se envía como campaña
 * (`createCampaign` + `sendCampaign`), no como transaccional: el HTML es el
 * mismo para todos los destinatarios y no se le puede incrustar un token
 * distinto por persona desde acá, que es como sí funcionan las alertas
 * (`alerts.ts`). La alternativa era un webhook, que obliga a abrir una ruta
 * pública que borra filas. Esto no abre nada.
 *
 * BORRAR NO PIERDE LA MEMORIA DE LA BAJA: esa memoria vive en la lista de
 * supresión de Brevo (`emailBlacklisted`), que es quien envía. Aquí la fila solo
 * respalda el chequeo de idempotencia de `subscribe()`, y que desaparezca es lo
 * correcto — si esa persona vuelve a suscribirse, debe poder.
 */
export async function reconcileUnsubscribedFromBrevo(): Promise<{
  borrados: number
  revisados: number
  omitidoPorSalvaguarda: boolean
}> {
  const dadosDeBaja: string[] = []
  let revisados = 0
  let recorridoCompleto = false

  try {
    let cursor: string | undefined
    // El tope existe para que un `hasMore` que nunca baje no deje el job
    // girando: a 50 por página cubre 50.000 contactos, muy por encima de la
    // lista real. Si se alcanza, el recorrido NO cuenta como completo.
    for (let pagina = 0; pagina < 1000; pagina++) {
      const { items, nextCursor, hasMore } = await brevo.listContacts(cursor)
      revisados += items.length
      for (const c of items) {
        if (!c.subscribed && c.email) dadosDeBaja.push(c.email.toLowerCase())
      }
      if (!hasMore || !nextCursor) {
        recorridoCompleto = true
        break
      }
      cursor = nextCursor
    }
  } catch (err) {
    // Media lista leída es peor que ninguna: se aborta sin borrar nada. El job
    // corre a diario, así que el siguiente intento lo recupera.
    log.warn({ err, revisados }, 'brevo reconcile: listing failed, nothing deleted')
    return { borrados: 0, revisados, omitidoPorSalvaguarda: true }
  }

  if (!recorridoCompleto) {
    log.warn({ revisados }, 'brevo reconcile: listing did not finish, nothing deleted')
    return { borrados: 0, revisados, omitidoPorSalvaguarda: true }
  }

  if (dadosDeBaja.length === 0) return { borrados: 0, revisados, omitidoPorSalvaguarda: false }

  const { count } = await prisma.pendingSubscription.deleteMany({
    where: { email: { in: dadosDeBaja }, confirmedAt: { not: null } },
  })

  if (count > 0) {
    log.info(
      { borrados: count, dadosDeBajaEnBrevo: dadosDeBaja.length, revisados },
      'brevo reconcile: deleted local rows for contacts unsubscribed upstream',
    )
  }
  return { borrados: count, revisados, omitidoPorSalvaguarda: false }
}
