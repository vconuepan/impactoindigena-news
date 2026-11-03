import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { serializeError, maskEmail, opcionesDelArchivo, retentionDays, diasDeRetencion } from './logger.js'

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
 * automaticamente». Quien lo cumple es la configuracion de pino-roll; el
 * comportamiento real de su limpieza con esta configuracion lo fija
 * `logger-archivo.test.ts`.
 */
describe('retencion de los archivos de log', () => {
  it('pasa removeOtherLogFiles a pino-roll', () => {
    // Sin esto, `removeOldFiles()` solo borra los archivos que creo el proceso
    // actual, y en produccion cada despliegue arranca uno nuevo sobre
    // almacenamiento persistente.
    expect(
      opcionesDelArchivo('/x', 14).limit.removeOtherLogFiles,
      'pino-roll volvio a quedar sin removeOtherLogFiles: los archivos de procesos anteriores dejan de borrarse',
    ).toBe(true)
  })

  it('el limite de archivos sale de los dias de retencion: dias - 1, porque la rotacion real deja uno mas', () => {
    // Medido rotando de verdad (3-nov-2026): la limpieza lista el directorio antes
    // de que exista el archivo nuevo y conserva `count` viejos mas el nuevo.
    expect(opcionesDelArchivo('/x', 14).limit.count).toBe(13)
    expect(opcionesDelArchivo('/x', 7).limit.count).toBe(6)
    expect(opcionesDelArchivo('/x', 1).limit.count).toBe(1)
  })

  it('LOG_RETENTION_DAYS invalido vuelve a 14: con NaN se borraba todo y pino-roll dejaba de borrar', () => {
    expect(diasDeRetencion(undefined)).toBe(14)
    expect(diasDeRetencion('7')).toBe(7)
    expect(diasDeRetencion('catorce')).toBe(14)
    expect(diasDeRetencion('0')).toBe(14)
    expect(diasDeRetencion('-3')).toBe(14)
    expect(diasDeRetencion('1.5')).toBe(14)
    expect(retentionDays).toBe(diasDeRetencion(process.env.LOG_RETENTION_DAYS))
  })

  it('el nombre lleva la fecha: sin ella la limpieza ordena por numero y borra el archivo en uso (A3 y A4)', () => {
    const o = opcionesDelArchivo('/home/LogFiles/app', 14)
    expect(o.dateFormat).toBe('yyyy-MM-dd')
    expect(o.frequency).toBe('daily')
    expect(o.file).toBe('/home/LogFiles/app/server.log')
  })
})
