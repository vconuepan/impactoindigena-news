import { describe, it, expect } from 'vitest'
import { esPrerenderAutorizado, LARGO_MINIMO } from './prerenderBypass.js'

const SECRETO = 'a'.repeat(LARGO_MINIMO) + 'b9'

describe('esPrerenderAutorizado', () => {
  it('acepta el secreto exacto', () => {
    expect(esPrerenderAutorizado(SECRETO, SECRETO)).toBe(true)
  })

  it('rechaza otro valor, aunque se le parezca', () => {
    expect(esPrerenderAutorizado(SECRETO.slice(0, -1), SECRETO)).toBe(false)
    expect(esPrerenderAutorizado(SECRETO + 'x', SECRETO)).toBe(false)
    expect(esPrerenderAutorizado(SECRETO.toUpperCase(), SECRETO)).toBe(false)
  })

  it('sin secreto configurado nadie se salta el limite, ni mandando vacio', () => {
    expect(esPrerenderAutorizado('', '')).toBe(false)
    expect(esPrerenderAutorizado('cualquiera', '')).toBe(false)
  })

  it(`un secreto de menos de ${LARGO_MINIMO} caracteres se ignora, aunque coincida`, () => {
    const corto = 'x'.repeat(LARGO_MINIMO - 1)
    expect(esPrerenderAutorizado(corto, corto)).toBe(false)
  })

  it('un encabezado repetido (arreglo), ausente o que no es texto no autoriza', () => {
    expect(esPrerenderAutorizado([SECRETO, SECRETO], SECRETO)).toBe(false)
    expect(esPrerenderAutorizado(undefined, SECRETO)).toBe(false)
    expect(esPrerenderAutorizado(null, SECRETO)).toBe(false)
    expect(esPrerenderAutorizado(123, SECRETO)).toBe(false)
  })
})
