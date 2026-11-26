import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'

// El logo se baja del sitio: en los tests no hay red, y la lámina sale sin él.
vi.mock('@napi-rs/canvas', async (importOriginal) => {
  const real = await importOriginal<typeof import('@napi-rs/canvas')>()
  return { ...real, loadImage: vi.fn().mockRejectedValue(new Error('sin red en los tests')) }
})

// Las fotos se bajan por la guardia SSRF; acá se simula la descarga.
const mockFoto = vi.hoisted(() => vi.fn())
vi.mock('./loadRemoteImage.js', () => ({ loadRemoteImage: mockFoto }))

const { renderStoryCarousel } = await import('./storyCarouselRender.js')

function fotoDe(ancho: number, alto: number) {
  const c = createCanvas(ancho, alto)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#336699'
  ctx.fillRect(0, 0, ancho, alto)
  return c
}

const ATRIBUCION = {
  medio: 'BioBío Chile',
  autor: null,
  fecha: '21 de octubre de 2026',
  tituloOriginal: 'Comunidad de Curarrehue presenta plan para su bosque',
  dominio: 'biobiochile.cl',
}

// Desarrollo del formato del prompt: 25 a 40 palabras.
const CORTA = { titulo: 'Qué abarca', texto: 'El plan cubre 320 hectáreas y prioriza la recolección de piñones, la protección de las vertientes y la restauración de las laderas quemadas, según informó la comunidad a las autoridades regionales.' }
// Diez líneas justas (medido el 29-oct-2026 con la fuente real): el máximo que cabe, y no deja sitio para el marco.
const LARGA = { titulo: 'Qué viene ahora para el plan', texto: ('La Corporación Nacional Forestal revisará el documento durante noviembre y su aprobación permitiría postular a fondos de restauración del bosque nativo. ').repeat(2) + 'Las comunidades de Curarrehue venían planteando esta demanda desde hace varios años ante el ministerio.' }
const PORTADA = { titulo: 'La comunidad Txokin Pehuen presenta su plan para el bosque nativo', texto: 'En Curarrehue, la comunidad llevó su plan de manejo a la Corporación Nacional Forestal.' }
const CIERRE = { titulo: 'Qué viene', texto: 'La Corporación Nacional Forestal revisará el documento durante noviembre.' }

const FOTOS = [1, 2, 3].map((n) => ({ url: `https://pub.r2.dev/social/ogfoto-story-1-0${n}.jpg`, credito: 'BioBío Chile' }))

describe('las fotos del artículo en las láminas de desarrollo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFoto.mockImplementation(async () => fotoDe(1600, 900))
  })

  it('una foto de menos de 480 px de ancho no se dibuja, ni en la portada ni en el desarrollo', async () => {
    mockFoto.mockImplementation(async () => fotoDe(320, 240))

    const r = await renderStoryCarousel({
      laminas: [PORTADA, CORTA, CIERRE],
      lectura: null,
      atribucion: ATRIBUCION,
      categoria: '',
      foto: { url: 'https://www.biobiochile.cl/static/icono.jpg', credito: 'BioBío Chile' },
      fotosDesarrollo: FOTOS.slice(0, 1),
    })

    expect(r.imagenes).toHaveLength(3)
    expect(r.avisos).toEqual([])
    expect(r.fotosDibujadas).toBe(0)
  })

  it('una foto por lámina de desarrollo, en orden, con el texto del formato', async () => {
    const r = await renderStoryCarousel({
      laminas: [PORTADA, CORTA, CORTA, CORTA, CIERRE],
      lectura: null,
      atribucion: ATRIBUCION,
      categoria: '',
      fotosDesarrollo: FOTOS,
    })

    expect(r.imagenes).toHaveLength(5)
    expect(r.avisos).toEqual([])
    expect(r.fotosDibujadas).toBe(3)
    expect(mockFoto.mock.calls.map((c) => c[0])).toEqual(FOTOS.map((f) => f.url))
  })

  it('solo se bajan las fotos que tienen lámina', async () => {
    const r = await renderStoryCarousel({
      laminas: [PORTADA, CORTA, CIERRE],
      lectura: null,
      atribucion: ATRIBUCION,
      categoria: '',
      fotosDesarrollo: FOTOS,
    })

    expect(mockFoto).toHaveBeenCalledTimes(1)
    expect(r.fotosDibujadas).toBe(1)
  })

  it('un texto que llena la lámina sale sin foto, y sin aviso nuevo: la foto nunca le quita espacio', async () => {
    const sinFotos = await renderStoryCarousel({
      laminas: [PORTADA, LARGA, CIERRE], lectura: null, atribucion: ATRIBUCION, categoria: '',
    })
    const conFotos = await renderStoryCarousel({
      laminas: [PORTADA, LARGA, CIERRE], lectura: null, atribucion: ATRIBUCION, categoria: '', fotosDesarrollo: FOTOS,
    })

    expect(sinFotos.avisos).toEqual([])
    expect(conFotos.avisos).toEqual(sinFotos.avisos)
    expect(conFotos.fotosDibujadas).toBe(0)
  })

  it('un texto que no cabe da el mismo aviso con y sin foto', async () => {
    const DESBORDA = { ...LARGA, texto: LARGA.texto + ' ' + LARGA.texto }
    const sinFotos = await renderStoryCarousel({
      laminas: [PORTADA, DESBORDA, CIERRE], lectura: null, atribucion: ATRIBUCION, categoria: '',
    })
    const conFotos = await renderStoryCarousel({
      laminas: [PORTADA, DESBORDA, CIERRE], lectura: null, atribucion: ATRIBUCION, categoria: '', fotosDesarrollo: FOTOS,
    })

    expect(sinFotos.avisos.map((a) => a.tipo)).toEqual(['espacio'])
    expect(conFotos.avisos).toEqual(sinFotos.avisos)
  })

  it('si una foto no se puede bajar, esa lámina sale sin foto y el carrusel sale igual', async () => {
    mockFoto
      .mockImplementationOnce(async () => fotoDe(1600, 900))
      .mockRejectedValueOnce(new Error('No se pudo descargar la imagen'))
      .mockImplementationOnce(async () => fotoDe(1600, 900))

    const r = await renderStoryCarousel({
      laminas: [PORTADA, CORTA, CORTA, CORTA, CIERRE],
      lectura: null,
      atribucion: ATRIBUCION,
      categoria: '',
      fotosDesarrollo: FOTOS,
    })

    expect(r.imagenes).toHaveLength(5)
    expect(r.avisos).toEqual([])
    expect(r.fotosDibujadas).toBe(2)
  })

  it('sin fotos del artículo nada cambia', async () => {
    const r = await renderStoryCarousel({
      laminas: [PORTADA, CORTA, CIERRE], lectura: null, atribucion: ATRIBUCION, categoria: '',
    })

    expect(mockFoto).not.toHaveBeenCalled()
    expect(r.fotosDibujadas).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Regla 2: el aviso de independencia en la lámina de cierre (director, 25-nov-2026)
// ---------------------------------------------------------------------------

describe('el aviso de independencia en el cierre', () => {
  const FRASE = 'Esta nota menciona a organizaciones que son o fueron clientes de impactoindigena.ai y de impactoindigena.legal.'
  // El cierre con su texto al máximo: seis líneas.
  const CIERRE_LLENO = { titulo: 'Qué viene ahora para el plan del bosque', texto: ('La Corporación Nacional Forestal revisará el documento durante noviembre y su aprobación permitiría postular a fondos. ').repeat(2) }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFoto.mockImplementation(async () => fotoDe(1600, 900))
  })

  it('va en el hueco fijo del cierre: con el texto al máximo no aparece ningún aviso de espacio nuevo', async () => {
    const base = { laminas: [PORTADA, CORTA, CIERRE_LLENO], lectura: null, atribucion: ATRIBUCION, categoria: '' }
    const sin = await renderStoryCarousel(base)
    const con = await renderStoryCarousel({ ...base, avisoIndependencia: FRASE })

    expect(con.avisos).toEqual(sin.avisos)
    expect(con.imagenes[2].equals(sin.imagenes[2])).toBe(false)
    expect(con.imagenes[0].equals(sin.imagenes[0])).toBe(true)
  })

  it('una frase que no cabe en sus tres líneas da un aviso de espacio, nunca se recorta en silencio', async () => {
    const r = await renderStoryCarousel({
      laminas: [PORTADA, CORTA, CIERRE], lectura: null, atribucion: ATRIBUCION, categoria: '',
      avisoIndependencia: FRASE.repeat(4),
    })
    expect(r.avisos).toEqual([expect.objectContaining({ lamina: 2, tipo: 'espacio', mensaje: expect.stringContaining('aviso de independencia') })])
  })

  it('sin aviso, el cierre no cambia', async () => {
    const base = { laminas: [PORTADA, CORTA, CIERRE], lectura: null, atribucion: ATRIBUCION, categoria: '' }
    const a = await renderStoryCarousel(base)
    const b = await renderStoryCarousel({ ...base, avisoIndependencia: null })
    expect(a.imagenes[2].equals(b.imagenes[2])).toBe(true)
  })
})
