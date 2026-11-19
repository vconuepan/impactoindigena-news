import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { crearDomTolerante, sinHojasDeEstilo } from './domTolerante.js'

// La regla es la que publica elinformadordigital.cl (medido el 19-nov-2026, B24).
const CSS_QUE_JSDOM_NO_ENTIENDE = '.td-drop-down-search{height:calc(~100% + 1px);overflow-y:scroll}'
const CUERPO = 'El rescate de la cocina ancestral y la protección de un humedal fueron los temas del congreso escolar. '.repeat(6)
const PAGINA = `<!doctype html><html><head><title>Nota</title><style>${CSS_QUE_JSDOM_NO_ENTIENDE}</style></head>
<body><header>Menú</header><article><h1>Estudiantes de La Araucanía</h1><p>${CUERPO}</p></article></body></html>`
const URL = 'https://elinformadordigital.cl/educacion/nota/'

describe('crearDomTolerante', () => {
  it('reproduce el fallo: jsdom lanza al construir con ese CSS (si deja de lanzar, el reintento sobra)', () => {
    expect(() => new JSDOM(PAGINA, { url: URL })).toThrow()
  })

  it('con ese CSS reintenta sin las hojas de estilo y Readability saca el cuerpo entero', () => {
    const { dom, sinEstilos } = crearDomTolerante(PAGINA, URL)
    expect(sinEstilos).toBe(true)
    const articulo = new Readability(dom.window.document).parse()
    expect(articulo?.textContent).toContain('cocina ancestral')
    expect(articulo!.textContent!.trim().length).toBeGreaterThan(300)
    dom.window.close()
  })

  it('una página sana no pasa por el reintento y conserva sus estilos', () => {
    const sana = PAGINA.replace(CSS_QUE_JSDOM_NO_ENTIENDE, 'p{color:#333}')
    const { dom, sinEstilos } = crearDomTolerante(sana, URL)
    expect(sinEstilos).toBe(false)
    expect(dom.window.document.querySelectorAll('style')).toHaveLength(1)
    dom.window.close()
  })

  it('el reintento respeta lo oculto en línea: Readability sigue sin tomarlo', () => {
    const conOculto = PAGINA.replace('</article>', '<div style="display:none">TEXTO OCULTO DEL MENÚ</div></article>')
    const { dom } = crearDomTolerante(conOculto, URL)
    expect(new Readability(dom.window.document).parse()?.textContent).not.toContain('TEXTO OCULTO')
    dom.window.close()
  })
})

describe('sinHojasDeEstilo', () => {
  it('quita cada bloque <style>, con atributos y en mayúsculas, y deja el resto', () => {
    const html = '<head><STYLE media="all">a{}</STYLE><style>\nb{}\n</style ></head><body><p style="color:red">x</p></body>'
    expect(sinHojasDeEstilo(html)).toBe('<head></head><body><p style="color:red">x</p></body>')
  })
})
