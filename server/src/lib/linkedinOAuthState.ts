import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { config } from '../config.js'

/**
 * Parámetro `state` del flujo OAuth de LinkedIn, firmado y con vencimiento.
 *
 * Existe por una razón concreta: el callback de OAuth llega desde el navegador
 * tras el redirect de LinkedIn, así que NO trae el header `Authorization` que
 * `requireAuth` exige (la sesión del admin es un JWT Bearer, no una cookie). La
 * ruta del callback tiene que ser pública, y sin protección cualquiera podría
 * invocarla con un código propio para que el sitio quedara publicando en la
 * cuenta de LinkedIn del atacante.
 *
 * El `state` es la protección: se emite solo a un admin ya autenticado y va
 * firmado con HMAC sobre el client secret, así que no se puede falsificar. El
 * vencimiento corto acota la ventana en que un state filtrado sirve de algo.
 *
 * No se guarda en base de datos a propósito: un state firmado es verificable
 * por sí mismo. La contrapartida es que no es de un solo uso — dentro de su
 * ventana de vida se puede reutilizar. Aceptable porque la ventana es de
 * minutos y el único efecto de reusarlo es repetir una autorización que el
 * mismo admin acaba de iniciar.
 */

const TTL_MS = 10 * 60 * 1000
const SEPARATOR = '.'

function sign(payload: string): string {
  // El client secret es la única clave compartida que ya existe para esto. Si
  // falta, firmar con cadena vacía daría una firma predecible: mejor fallar.
  const secret = config.linkedin.clientSecret
  if (!secret) throw new Error('LINKEDIN_CLIENT_SECRET is required to sign the OAuth state')
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/** Genera un `state` firmado que vence en 10 minutos. */
export function createOAuthState(): string {
  const payload = `${Date.now() + TTL_MS}${SEPARATOR}${randomBytes(16).toString('base64url')}`
  return `${payload}${SEPARATOR}${sign(payload)}`
}

/**
 * Valida un `state` recibido en el callback.
 * Devuelve false ante firma inválida, formato roto o vencimiento — nunca lanza,
 * para que el callback pueda responder un 400 limpio sin filtrar el motivo.
 */
export function verifyOAuthState(state: string | undefined): boolean {
  if (!state) return false

  const parts = state.split(SEPARATOR)
  if (parts.length !== 3) return false

  const [expiresAt, nonce, signature] = parts
  const payload = `${expiresAt}${SEPARATOR}${nonce}`

  let expected: string
  try {
    expected = sign(payload)
  } catch {
    return false
  }

  // Comparación en tiempo constante. timingSafeEqual exige igual largo, así que
  // un largo distinto se descarta antes (no es secreto: es la forma del state).
  const received = Buffer.from(signature)
  const expectedBuf = Buffer.from(expected)
  if (received.length !== expectedBuf.length) return false
  if (!timingSafeEqual(received, expectedBuf)) return false

  const expiry = Number(expiresAt)
  return Number.isFinite(expiry) && expiry > Date.now()
}
