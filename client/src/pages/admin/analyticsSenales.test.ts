import { describe, it, expect } from 'vitest'
import { resumenPorFamilia, agentesPrincipales, cargasSinJs, porcentaje, type Fila } from './analyticsSenales'

const FILAS: Fila[] = [
  { surface: 'ficha_html', family: 'navegador', agent: '', count: 1000 },
  { surface: 'ficha_html', family: 'buscador', agent: 'Googlebot', count: 300 },
  { surface: 'beacon', family: 'buscador', agent: 'Googlebot', count: 40 },
  { surface: 'beacon', family: 'automatizacion', agent: 'HeadlessChrome', count: 500 },
  { surface: 'ficha_html', family: 'otro_robot', agent: 'Googlebot (falso)', count: 80 },
  { surface: 'ficha_html', family: 'vista_previa', agent: 'WhatsApp', count: 12 },
]

describe('resumenPorFamilia', () => {
  it('separa beacons y fichas, deja fuera a los navegadores y ordena buenas noticias primero', () => {
    expect(resumenPorFamilia(FILAS).map((r) => [r.family, r.beacons, r.fichas])).toEqual([
      ['buscador', 40, 300],
      ['vista_previa', 0, 12],
      ['automatizacion', 500, 0],
      ['otro_robot', 0, 80],
    ])
  })
})

describe('agentesPrincipales', () => {
  it('suma las dos superficies por agente y ordena de mayor a menor', () => {
    expect(agentesPrincipales(FILAS, 3)).toEqual([
      { agent: 'HeadlessChrome', family: 'automatizacion', count: 500 },
      { agent: 'Googlebot', family: 'buscador', count: 340 },
      { agent: 'Googlebot (falso)', family: 'otro_robot', count: 80 },
    ])
  })
})

describe('cargasSinJs', () => {
  it('cargas con cara de navegador menos las que mandaron el beacon', () => {
    expect(cargasSinJs(FILAS, 360)).toEqual({ conCaraDeNavegador: 1000, conJs: 360, sinJs: 640, pctSinJs: 64 })
  })

  it('nunca da negativo si la cache sirvio fichas sin pasar por el backend', () => {
    expect(cargasSinJs(FILAS, 1200)).toEqual({ conCaraDeNavegador: 1000, conJs: 1000, sinJs: 0, pctSinJs: 0 })
  })

  it('sin datos, ceros', () => {
    expect(cargasSinJs([], 0)).toEqual({ conCaraDeNavegador: 0, conJs: 0, sinJs: 0, pctSinJs: 0 })
  })
})

describe('porcentaje', () => {
  it('redondea y no divide por cero', () => {
    expect(porcentaje(13, 220)).toBe(6)
    expect(porcentaje(5, 0)).toBe(0)
  })
})
