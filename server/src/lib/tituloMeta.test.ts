import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { tituloConEtiqueta, recortarEnPalabra } from './tituloMeta.js'

describe('tituloConEtiqueta', () => {
  it('pone la etiqueta en mayúscula inicial delante del titular', () => {
    // El caso medido en vivo el 8-nov-2026.
    expect(tituloConEtiqueta('artesanía indígena', 'Ley 21.788 impulsa reconocimiento de artesanía indígena en Chile'))
      .toBe('Artesanía indígena: Ley 21.788 impulsa reconocimiento de artesanía indígena en Chile')
  })

  it('no toca el resto de la etiqueta: los nombres propios quedan como vienen', () => {
    expect(tituloConEtiqueta('desplazamiento adivasi', 'X')).toBe('Desplazamiento adivasi: X')
    expect(tituloConEtiqueta('EU AI Act', 'X')).toBe('EU AI Act: X')
  })

  it('una etiqueta que empieza con tilde o eñe también sube', () => {
    expect(tituloConEtiqueta('ñuke mapu', 'X')).toBe('Ñuke mapu: X')
    expect(tituloConEtiqueta('éxodo rural', 'X')).toBe('Éxodo rural: X')
  })

  it('sin etiqueta, o con una vacía, devuelve el titular solo', () => {
    expect(tituloConEtiqueta(null, 'Titular')).toBe('Titular')
    expect(tituloConEtiqueta(undefined, 'Titular')).toBe('Titular')
    expect(tituloConEtiqueta('   ', 'Titular')).toBe('Titular')
  })
})

describe('recortarEnPalabra', () => {
  // El resumen real que se cortaba en «estas trad» el 8-nov-2026.
  const RESUMEN =
    'El Ministerio de las Culturas celebró el Día Nacional de la Artesanía con actividades que incluyeron artesanas y comunidades indígenas, resaltando la nueva Ley 21.788 que protege y promueve estas tradiciones.'

  it('no corta a mitad de palabra y cierra con «…»', () => {
    const r = recortarEnPalabra(RESUMEN, 200)
    expect(r.endsWith('estas…')).toBe(true)
    expect(r).not.toContain('trad')
    expect(r.length).toBeLessThanOrEqual(200)
  })

  it('nunca pasa del máximo, contando el «…»', () => {
    for (const max of [40, 120, 160, 200]) {
      expect(recortarEnPalabra(RESUMEN, max).length).toBeLessThanOrEqual(max)
    }
  })

  it('no deja una coma ni un punto pegados al «…»', () => {
    expect(recortarEnPalabra('uno dos, tres cuatro cinco seis', 10)).toBe('uno dos…')
  })

  it('un texto que cabe sale entero, sin «…», con los espacios normalizados', () => {
    expect(recortarEnPalabra('  corto   y\nclaro ', 200)).toBe('corto y claro')
  })

  it('una sola palabra larguísima se corta en el máximo', () => {
    const r = recortarEnPalabra('a'.repeat(300), 50)
    expect(r).toHaveLength(50)
    expect(r.endsWith('…')).toBe(true)
  })
})

describe('las dos copias del ayudante', () => {
  // Gemelo de shared/utils/tituloMeta.ts, que usa el cliente (la ficha en
  // React). Si divergen, la pestaña y la tarjeta de una misma noticia dicen
  // cosas distintas según quién sirvió la página.
  const MARCA = '// --- código gemelo'
  const codigo = (ruta: string) => {
    const fuente = readFileSync(ruta, 'utf8')
    const i = fuente.indexOf(MARCA)
    expect(i, `${ruta} perdió la marca del código gemelo`).toBeGreaterThan(-1)
    return fuente.slice(i)
  }

  it('son idénticas desde la marca', () => {
    const servidor = codigo(path.resolve(__dirname, 'tituloMeta.ts'))
    const compartida = codigo(path.resolve(__dirname, '../../../shared/utils/tituloMeta.ts'))
    expect(compartida).toBe(servidor)
  })
})
