import { describe, it, expect } from 'vitest'
import { extraerFotosDelCuerpo, depurarFotos, MAX_FOTOS_POR_ARTICULO } from './fotosDelArticulo.js'

const BASE = 'https://www.ejemplo.cl/noticias/2026/10/29/plan-bosque.html'

describe('extraerFotosDelCuerpo (las <img> del cuerpo del artículo)', () => {
  it('devuelve las fotos en el orden del artículo, resueltas contra la URL de la nota', () => {
    const html = `
      <p>Texto</p>
      <figure><img src="/media/2026/10/foto-1.jpg" alt="La reunión"></figure>
      <p>Más texto</p>
      <img src="https://cdn.ejemplo.cl/img/foto-2.jpg?w=1200">
      <img src="../fotos/foto-3.webp">`
    expect(extraerFotosDelCuerpo(html, BASE)).toEqual([
      'https://www.ejemplo.cl/media/2026/10/foto-1.jpg',
      'https://cdn.ejemplo.cl/img/foto-2.jpg?w=1200',
      'https://www.ejemplo.cl/noticias/2026/10/fotos/foto-3.webp',
    ])
  })

  it('deja fuera la og:image, que ya va en la portada, aunque venga en otro tamaño', () => {
    const html = `<img src="https://cdn.ejemplo.cl/img/portada.jpg?w=800"><img src="https://cdn.ejemplo.cl/img/otra.jpg">`
    expect(extraerFotosDelCuerpo(html, BASE, ['https://cdn.ejemplo.cl/img/portada.jpg?w=1200'])).toEqual([
      'https://cdn.ejemplo.cl/img/otra.jpg',
    ])
  })

  it('descarta íconos, avatares, logos, píxeles de rastreo y publicidad', () => {
    const html = `
      <img src="https://www.ejemplo.cl/static/logo-medio.png">
      <img src="https://secure.gravatar.com/avatar/abc?s=96">
      <img src="https://www.facebook.com/tr?id=1&ev=PageView" width="1" height="1">
      <img src="https://www.ejemplo.cl/wp-content/plugins/share/icons/twitter.png">
      <img src="https://ads.doubleclick.net/pixel.jpg">
      <img src="https://www.ejemplo.cl/img/emoji-smile.png">
      <img src="https://www.ejemplo.cl/img/banner-suscribete.jpg">
      <img src="https://www.ejemplo.cl/media/reportaje.jpg">`
    expect(extraerFotosDelCuerpo(html, BASE)).toEqual(['https://www.ejemplo.cl/media/reportaje.jpg'])
  })

  it('descarta SVG, GIF e ICO: logos, animaciones y píxeles, no fotografías', () => {
    const html = `
      <img src="https://www.ejemplo.cl/media/mapa.svg">
      <img src="https://www.ejemplo.cl/media/spacer.gif">
      <img src="https://www.ejemplo.cl/media/animacion.GIF?x=1">
      <img src="https://www.ejemplo.cl/media/retrato.jpeg">`
    expect(extraerFotosDelCuerpo(html, BASE)).toEqual(['https://www.ejemplo.cl/media/retrato.jpeg'])
  })

  it('descarta las que declaran un tamaño chico y conserva las que no declaran nada', () => {
    const html = `
      <img src="https://www.ejemplo.cl/media/chica.jpg" width="120" height="80">
      <img src="https://www.ejemplo.cl/media/baja.jpg" width="800" height="150">
      <img src="https://www.ejemplo.cl/media/porcentaje.jpg" width="100%">
      <img src="https://www.ejemplo.cl/media/sin-tamano.jpg">
      <img src="https://www.ejemplo.cl/media/grande.jpg" width="1200px" height="800">`
    expect(extraerFotosDelCuerpo(html, BASE)).toEqual([
      'https://www.ejemplo.cl/media/porcentaje.jpg',
      'https://www.ejemplo.cl/media/sin-tamano.jpg',
      'https://www.ejemplo.cl/media/grande.jpg',
    ])
  })

  it('no repite la misma foto en otro tamaño ni la misma dirección dos veces', () => {
    const html = `
      <img src="https://cdn.ejemplo.cl/img/foto.jpg?w=400">
      <img src="https://cdn.ejemplo.cl/img/foto.jpg?w=1200">
      <img src="https://cdn.ejemplo.cl/img/FOTO.jpg">
      <img src="https://cdn.ejemplo.cl/img/foto.jpg">`
    expect(extraerFotosDelCuerpo(html, BASE)).toEqual(['https://cdn.ejemplo.cl/img/foto.jpg?w=400'])
  })

  it('con carga perezosa toma data-src o el candidato más grande del srcset', () => {
    const html = `
      <img src="data:image/gif;base64,R0lGOD" data-src="https://www.ejemplo.cl/media/perezosa.jpg">
      <img srcset="https://www.ejemplo.cl/media/set-400.jpg 400w, https://www.ejemplo.cl/media/set-1600.jpg 1600w, https://www.ejemplo.cl/media/set-800.jpg 800w">
      <img data-lazy-src="https://www.ejemplo.cl/media/lazy.jpg">`
    expect(extraerFotosDelCuerpo(html, BASE)).toEqual([
      'https://www.ejemplo.cl/media/perezosa.jpg',
      'https://www.ejemplo.cl/media/set-1600.jpg',
      'https://www.ejemplo.cl/media/lazy.jpg',
    ])
  })

  it('ignora data:, blob:, javascript: y lo que no sea http(s)', () => {
    const html = `
      <img src="data:image/png;base64,iVBORw0KGgo=">
      <img src="blob:https://www.ejemplo.cl/abc">
      <img src="javascript:alert(1)">
      <img src="ftp://files.ejemplo.cl/foto.jpg">
      <img src="https://www.ejemplo.cl/media/ok.jpg">`
    expect(extraerFotosDelCuerpo(html, BASE)).toEqual(['https://www.ejemplo.cl/media/ok.jpg'])
  })

  it(`se queda con las primeras ${MAX_FOTOS_POR_ARTICULO}`, () => {
    const html = Array.from({ length: 10 }, (_, i) => `<img src="https://www.ejemplo.cl/media/f${i}.jpg">`).join('')
    const fotos = extraerFotosDelCuerpo(html, BASE)
    expect(fotos).toHaveLength(MAX_FOTOS_POR_ARTICULO)
    expect(fotos[0]).toBe('https://www.ejemplo.cl/media/f0.jpg')
  })

  it('sin HTML o sin imágenes devuelve vacío', () => {
    expect(extraerFotosDelCuerpo('', BASE)).toEqual([])
    expect(extraerFotosDelCuerpo('<p>Solo texto</p>', BASE)).toEqual([])
  })
})

describe('depurarFotos (direcciones ya resueltas, como las de Diffbot)', () => {
  it('aplica los mismos descartes y la exclusión', () => {
    expect(depurarFotos([
      'https://www.ejemplo.cl/media/a.jpg',
      'https://www.ejemplo.cl/media/logo.png',
      'https://www.ejemplo.cl/media/a.jpg?w=2',
      'no es una url',
      'https://www.ejemplo.cl/media/b.png',
    ], ['https://www.ejemplo.cl/media/b.png'])).toEqual(['https://www.ejemplo.cl/media/a.jpg'])
  })
})
