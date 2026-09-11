import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { serializeError, maskEmail } from './logger.js'

describe('serializeError', () => {
  it('strips axios response body, request, and config from serialized output', () => {
    const err = new Error('Request failed with status code 404') as any
    err.isAxiosError = true
    err.code = 'ERR_BAD_REQUEST'
    err.response = {
      status: 404,
      data: '<html>' + 'x'.repeat(100_000) + '</html>', // huge HTML body
      headers: { 'content-type': 'text/html' },
    }
    err.config = {
      url: 'https://example.com/feed/',
      headers: { Authorization: 'Bearer secret' },
      timeout: 10000,
    }
    err.request = { socket: {}, _header: 'GET /feed/ HTTP/1.1' }

    const result = serializeError(err)

    // Keeps essential fields
    expect(result.type).toBe('Error')
    expect(result.message).toBe('Request failed with status code 404')
    expect(result.stack).toBeDefined()
    expect(result.code).toBe('ERR_BAD_REQUEST')
    expect(result.status).toBe(404)
    expect(result.url).toBe('https://example.com/feed/')

    // Does NOT include bulky internals
    expect(result.response).toBeUndefined()
    expect(result.request).toBeUndefined()
    expect(result.config).toBeUndefined()
    expect(result.data).toBeUndefined()

    // Serialized result should be small
    const jsonSize = JSON.stringify(result).length
    expect(jsonSize).toBeLessThan(2000)
  })

  it('passes through non-axios errors unchanged', () => {
    const err = new Error('regular error')
    const result = serializeError(err)

    expect(result.type).toBe('Error')
    expect(result.message).toBe('regular error')
    expect(result.stack).toBeDefined()
  })

  it('handles axios error without response', () => {
    const err = new Error('connect ECONNREFUSED') as any
    err.isAxiosError = true
    err.code = 'ECONNREFUSED'
    err.config = { url: 'https://example.com/api' }

    const result = serializeError(err)

    expect(result.code).toBe('ECONNREFUSED')
    expect(result.status).toBeUndefined()
    expect(result.url).toBe('https://example.com/api')
  })
})

describe('maskEmail', () => {
  it('keeps the first char of the local part and the full domain', () => {
    expect(maskEmail('venancio@fundacionkm.org')).toBe('v***@fundacionkm.org')
  })

  it('does not leak the local part for short addresses', () => {
    expect(maskEmail('a@b.com')).toBe('a***@b.com')
  })

  it('handles missing or malformed emails without throwing', () => {
    expect(maskEmail(undefined)).toBe('[no-email]')
    expect(maskEmail('')).toBe('[no-email]')
    expect(maskEmail('not-an-email')).toBe('[redacted-email]')
    expect(maskEmail('@nolocal.com')).toBe('[redacted-email]')
  })
})

/**
 * La Politica promete «Registros del servidor: hasta 14 dias, luego se eliminan
 * automaticamente». Quien lo cumple es una opcion de pino-roll, no codigo
 * propio, asi que el test lee la configuracion del fuente: no hay forma de
 * inspeccionar el transport ya construido sin levantarlo.
 */
describe('retencion de los archivos de log', () => {
  const FUENTE = readFileSync(path.resolve(__dirname, 'logger.ts'), 'utf8')

  it('pasa removeOtherLogFiles a pino-roll', () => {
    // Sin esto, `removeOldFiles()` solo borra los archivos que creo el proceso
    // actual —los rastrea en un array en memoria— y los de procesos anteriores
    // se acumulan para siempre. En produccion eso es todo el tiempo: cada
    // despliegue arranca un proceso nuevo y LOG_DIR=/home/LogFiles/app es
    // almacenamiento persistente. Verificado en el fuente de pino-roll 4.0.0.
    expect(
      /removeOtherLogFiles:\s*true/.test(FUENTE),
      'pino-roll volvio a quedar sin removeOtherLogFiles: los archivos de log de procesos anteriores dejan de borrarse y la Politica pasa a prometer una retencion de 14 dias que nada cumple',
    ).toBe(true)
  })

  it('el limite de archivos sale de LOG_RETENTION_DAYS y no de un numero escrito a mano', () => {
    // Si el conteo se fija en el codigo, cambiar la Politica y la variable de
    // entorno deja de tener efecto, y la divergencia no se ve en ninguna parte.
    expect(
      /limit:\s*\{\s*count:\s*retentionDays/.test(FUENTE),
      'el limite de archivos de log ya no se deriva de LOG_RETENTION_DAYS',
    ).toBe(true)
  })
})
