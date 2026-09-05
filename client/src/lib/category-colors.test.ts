import { describe, it, expect } from 'vitest'
import { getCategoryColor } from './category-colors'

describe('subcategorias', () => {
  it('cada subcategoria hereda el color de su madre', () => {
    // Los slugs se nombraron `<madre>-<eje>` para esto. Sin la herencia caian
    // al verde de marca: las tres hijas de una categoria se veian identicas
    // entre si y distintas de su madre.
    const pares: [string, string][] = [
      ['territorio-despojo', 'territorio-y-tierras'],
      ['territorio-gobierno', 'territorio-y-tierras'],
      ['clima-bosques', 'cambio-climatico'],
      ['consulta-fallos', 'consulta-y-consentimiento'],
      ['derechos-salud', 'derechos-indigenas'],
      ['defensores-violencia', 'defensores-y-proteccion'],
      ['cultura-lenguas', 'cultura-y-conocimientos-ancestrales'],
    ]
    for (const [hija, madre] of pares) {
      expect(getCategoryColor(hija).hex, hija).toBe(getCategoryColor(madre).hex)
    }
  })

  it('una madre no se confunde consigo misma por su prefijo', () => {
    // "derechos-indigenas" empieza por "derechos": tiene color propio y debe
    // ganar antes de que se mire el prefijo.
    expect(getCategoryColor('derechos-indigenas').hex).toBe('#B84236')
    expect(getCategoryColor('territorio-y-tierras').hex).toBe('#5F7328')
  })

  it('un slug desconocido sigue cayendo al color por defecto', () => {
    expect(getCategoryColor('inventado-cualquiera').hex).toBe(getCategoryColor('general-news').hex)
  })
})

