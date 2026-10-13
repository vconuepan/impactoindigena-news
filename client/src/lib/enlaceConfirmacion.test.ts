import { describe, it, expect } from 'vitest'
import { leerEnlaceConfirmacion } from './enlaceConfirmacion'

const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CORREO = 'lectora@example.com'

const leer = (q: string) => leerEnlaceConfirmacion(new URLSearchParams(q))

describe('leerEnlaceConfirmacion', () => {
  it('sin ninguno de los dos parametros, el enlace esta ausente', () => {
    expect(leer('')).toEqual({ estado: 'ausente' })
    // Otros parametros de la pagina no cuentan.
    expect(leer('confirmed=true&unsubscribe_token=x')).toEqual({ estado: 'ausente' })
  })

  it('un token uuid con un correo bien formado es valido', () => {
    expect(leer(`confirm_token=${TOKEN}&email=${encodeURIComponent(CORREO)}`)).toEqual({
      estado: 'valido',
      token: TOKEN,
      email: CORREO,
    })
  })

  it('acepta el uuid en mayusculas', () => {
    expect(leer(`confirm_token=${TOKEN.toUpperCase()}&email=${CORREO}`).estado).toBe('valido')
  })

  it.each([
    ['solo el token', `confirm_token=${TOKEN}`],
    ['solo el correo', `email=${CORREO}`],
    ['token vacio', `confirm_token=&email=${CORREO}`],
    ['correo vacio', `confirm_token=${TOKEN}&email=`],
    ['token que no es uuid', `confirm_token=no-es-uuid&email=${CORREO}`],
    ['token con html', `confirm_token=${encodeURIComponent('<img src=x onerror=alert(1)>')}&email=${CORREO}`],
    ['correo sin arroba', `confirm_token=${TOKEN}&email=lectora.example.com`],
    ['correo sin dominio', `confirm_token=${TOKEN}&email=lectora@example`],
    ['correo con espacios', `confirm_token=${TOKEN}&email=${encodeURIComponent('lec tora@example.com')}`],
    ['correo de mas de 255 caracteres', `confirm_token=${TOKEN}&email=${'a'.repeat(250)}@example.com`],
  ])('%s es un enlace malformado', (_nombre, query) => {
    expect(leer(query)).toEqual({ estado: 'malformado' })
  })
})
