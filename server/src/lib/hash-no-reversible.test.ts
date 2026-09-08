import { describe, it, expect, beforeEach } from 'vitest'
import { hashNoReversible, diaUtc, _olvidarSales } from './hash-no-reversible.js'

/**
 * Lo que se prueba aqui es una PROMESA PUBLICA: la Politica de Privacidad dice
 * que de la IP «solo guardamos un hash no reversible». Antes era un sha256
 * crudo, que de una IPv4 se revierte por fuerza bruta.
 *
 * Un test no puede demostrar que algo es irreversible. Lo que si puede fijar son
 * las tres propiedades de las que depende esa afirmacion: que hay sal, que la
 * sal rota, y que no se puede cruzar entre superficies. Si alguna cae, la
 * promesa vuelve a ser falsa.
 */

beforeEach(() => _olvidarSales())

describe('hashNoReversible', () => {
  it('el mismo valor en el mismo dia da el mismo hash', () => {
    const a = hashNoReversible('feedback', '1.2.3.4', '2026-09-08')
    const b = hashNoReversible('feedback', '1.2.3.4', '2026-09-08')
    expect(a).toBe(b)
  })

  it('valores distintos dan hashes distintos', () => {
    const a = hashNoReversible('feedback', '1.2.3.4', '2026-09-08')
    const b = hashNoReversible('feedback', '1.2.3.5', '2026-09-08')
    expect(a).not.toBe(b)
  })

  it('NO es un sha256 crudo del valor: ahi esta todo el arreglo', () => {
    // Si alguien quitara la sal, este test lo delata. Es el defecto original
    // reproducido: sha256('1.2.3.4') es una constante publica y precomputable.
    const crudo = '6694f83c9f476da31f5df6bcc520034e7e57d421d247b9d34f49edbfc84a764c'
    expect(hashNoReversible('feedback', '1.2.3.4', '2026-09-08')).not.toBe(crudo)
  })

  it('al cambiar el dia el hash cambia: no se puede seguir a nadie entre dias', () => {
    const hoy = hashNoReversible('feedback', '1.2.3.4', '2026-09-08')
    const manana = hashNoReversible('feedback', '1.2.3.4', '2026-09-09')
    expect(hoy).not.toBe(manana)
  })

  it('dos ambitos no se pueden cruzar aunque sea el mismo dia y la misma IP', () => {
    // Si compartieran sal, un hash de feedback se podria emparejar con uno de
    // analitica y reconstruir un rastro que ninguna de las dos superficies
    // declara.
    const a = hashNoReversible('feedback', '1.2.3.4', '2026-09-08')
    const b = hashNoReversible('analitica', '1.2.3.4', '2026-09-08')
    expect(a).not.toBe(b)
  })

  it('devuelve hexadecimal de 64 caracteres, que es lo que la columna espera', () => {
    expect(hashNoReversible('feedback', '1.2.3.4', '2026-09-08')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('la sal no se persiste: olvidarla cambia el hash del mismo dia', () => {
    // Es la contrapartida deliberada — un reinicio pierde la correlacion — y a
    // la vez la razon por la que el hash es irreversible: no hay secreto
    // guardado que robar junto a la tabla.
    const antes = hashNoReversible('feedback', '1.2.3.4', '2026-09-08')
    _olvidarSales()
    expect(hashNoReversible('feedback', '1.2.3.4', '2026-09-08')).not.toBe(antes)
  })

  it('diaUtc da el dia en UTC, no en la zona del proceso', () => {
    // A las 02:00 UTC en Chile es el dia anterior; la sal tiene que rotar por
    // el reloj UTC del servidor y no por el local de nadie.
    expect(diaUtc(new Date('2026-09-08T02:00:00Z'))).toBe('2026-09-08')
    expect(diaUtc(new Date('2026-09-08T23:59:59Z'))).toBe('2026-09-08')
    expect(diaUtc(new Date('2026-09-09T00:00:01Z'))).toBe('2026-09-09')
  })
})
