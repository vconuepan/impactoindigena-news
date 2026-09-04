import { describe, it, expect } from 'vitest'
import { detectarPais } from './country-detect.js'

/** Un mapa de nombres reducido, suficiente para las pruebas. */
const NOMBRES: Record<string, string> = {
  chile: 'CL', mexico: 'MX', brasil: 'BR', ghana: 'GH', noruega: 'NO',
  canada: 'CA', peru: 'PE', bolivia: 'BO', india: 'IN', australia: 'AU',
}
const d = (texto: string) => detectarPais(texto, NOMBRES)

describe('detectarPais', () => {
  it('reconoce el pais nombrado en el titular', () => {
    expect(d('Comunidades indigenas usan plantas medicinales en Ghana').pais).toBe('GH')
  })

  it('una institucion nacional pesa mas que cualquier otra señal', () => {
    // CONADI solo existe en Chile, asi que decide aunque el texto nombre otro pais.
    const r = d('CONADI financia emprendimientos con apoyo de Canada')
    expect(r.pais).toBe('CL')
    expect(r.senal).toBe('institucion')
  })

  it('reconoce por gentilicio cuando no hay nombre de pais', () => {
    const r = d('Programa chileno apoya autonomia de mujeres rurales indigenas')
    expect(r.pais).toBe('CL')
    expect(r.senal).toBe('gentilicio')
  })

  it('reconoce por lugar cuando no hay nombre ni gentilicio', () => {
    const r = d('Lluvias danaron la agricultura mapuche en La Araucania')
    expect(r.pais).toBe('CL')
    expect(r.senal).toBe('lugar')
  })

  it('un termino mas largo desplaza al que contiene', () => {
    // "Nuevo Mexico" es Estados Unidos, no Mexico. Sin esta regla el detector
    // marcaba MX en "Nuevo Mexico promueve energia geotermica".
    expect(d('Nuevo Mexico promueve energia geotermica en tierras indigenas').pais).toBe('US')
  })

  it('dos paises independientes son ambiguos, no una apuesta', () => {
    const r = d('Mapuche de Chile presentan denuncia en Noruega')
    expect(r.pais).toBeNull()
    expect(r.senal).toBe('ambiguo')
  })

  it('no devuelve pais cuando el articulo es global', () => {
    const r = d('ONU reconoce dia internacional de los pueblos indigenas')
    expect(r.pais).toBeNull()
    expect(r.senal).toBe('ninguna')
  })

  it('no confunde una region con un pais', () => {
    expect(d('Mineria ilegal amenaza territorios indigenas en la Amazonia').pais).toBeNull()
  })

  /**
   * La familia de errores que costo 120 fallos en la primera version: un
   * toponimo que tambien es palabra corriente del español.
   */
  it('no marca Brasil por la preposicion "para"', () => {
    expect(d('Nueva alianza para fortalecer el periodismo indigena').pais).toBeNull()
  })

  it('no marca Brasil por el adjetivo "acre"', () => {
    expect(d('Denuncian el sabor acre del agua contaminada').pais).toBeNull()
  })

  it('no marca Argentina por el verbo "salta"', () => {
    expect(d('La cifra salta a mil comunidades afectadas').pais).toBeNull()
  })

  it('no marca Mexico por el sustantivo "guerrero"', () => {
    expect(d('Un guerrero indigena lidera la defensa del territorio').pais).toBeNull()
  })

  it('ignora tildes y mayusculas', () => {
    expect(d('LA ARAUCANÍA vive una sequía histórica').pais).toBe('CL')
  })

  it('no coincide dentro de otra palabra', () => {
    // "mali" dentro de "malinterpretado", "chile" dentro de "chilena" ya es
    // gentilicio propio. Sin limite de palabra, cualquier texto marcaria pais.
    expect(d('El informe fue malinterpretado por la prensa').pais).toBeNull()
  })
})
