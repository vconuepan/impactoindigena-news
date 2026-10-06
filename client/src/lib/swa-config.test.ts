import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Cabeceras de Azure Static Web Apps para el widget por iframe.
 *
 * /embed es la unica pagina que otros sitios pueden enmarcar (decision del
 * director, 4-oct-2026): es contenido publico de solo lectura, sin formularios
 * ni sesion. Tres trampas que este test vigila:
 *
 * 1. Las reglas de ruta NO se aplican a lo que sirve `navigationFallback`. Una
 *    regla con solo cabeceras no tendria efecto: necesita `rewrite` explicito.
 * 2. La CSP de /embed es una COPIA de la global con un solo cambio. Si alguien
 *    endurece la global y olvida la copia, /embed quedaria con la vieja.
 * 3. La ruta es exacta, no `/embed*`, que tambien capturaria /embed-widget.
 */
const config = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../public/staticwebapp.config.json'), 'utf8'),
) as {
  routes: Array<{ route: string; rewrite?: string; headers?: Record<string, string> }>
  navigationFallback: { rewrite: string; exclude: string[] }
  globalHeaders: Record<string, string>
}

const globalCsp = config.globalHeaders['Content-Security-Policy']
const embed = config.routes.find((r) => r.route === '/embed')

describe('staticwebapp.config.json: /embed enmarcable desde otros sitios', () => {
  it('existe una regla exacta para /embed con rewrite explicito', () => {
    expect(embed).toBeDefined()
    expect(embed!.rewrite).toBe('/index.html')
    expect(config.routes.some((r) => r.route.startsWith('/embed') && r.route !== '/embed')).toBe(false)
  })

  it('quita X-Frame-Options y permite enmarcarla desde cualquier origen', () => {
    expect(embed!.headers!['X-Frame-Options']).toBe('')
    expect(embed!.headers!['Content-Security-Policy']).toContain('frame-ancestors *')
  })

  it('su CSP es la global con frame-ancestors como unica diferencia', () => {
    expect(embed!.headers!['Content-Security-Policy']).toBe(
      globalCsp.replace("frame-ancestors 'self'", 'frame-ancestors *'),
    )
  })

  it('el resto del sitio sigue sin poder enmarcarse desde afuera', () => {
    expect(globalCsp).toContain("frame-ancestors 'self'")
    expect(config.globalHeaders['X-Frame-Options']).toBe('SAMEORIGIN')
  })

  it("la CSP global deja enmarcar el propio sitio: la vista previa de /widgets usa /embed", () => {
    // Con frame-src 'none' la vista previa del generador salia vacia.
    expect(globalCsp).toContain("frame-src 'self'")
    expect(globalCsp).not.toContain("frame-src 'none'")
  })
})

/**
 * Lo que NO es una pagina de la aplicacion tiene que responder 404, no el HTML
 * del SPA con 200. `/health` ya enseñó la trampa (un monitor diria «sano» con
 * el backend muerto), y PageSpeed la repitio el 6-oct-2026 por otro camino:
 * Lighthouse pide `/.well-known/ai-catalog.json`, recibia la portada entera y
 * fallaba el esquema con «Unexpected token '<'». Si la ruta responde 404, la
 * auditoria pasa a «no aplicable», que es la verdad: no publicamos ese catalogo.
 */
describe('staticwebapp.config.json: lo que no es pagina responde 404, no el SPA', () => {
  const exclude = config.navigationFallback.exclude

  it('ningun archivo .json ni nada bajo /.well-known/ cae en el index.html', () => {
    expect(exclude).toContain('/*.json')
    expect(exclude).toContain('/.well-known/*')
  })

  it('las exclusiones anteriores siguen: un cambio aca no las puede pisar', () => {
    for (const p of ['/assets/*', '/images/*', '/*.png', '/*.ico', '/*.xml', '/*.txt']) {
      expect(exclude).toContain(p)
    }
  })
})

describe('staticwebapp.config.json: aislamiento de origen', () => {
  it('COOP same-origin, igual que helmet en las fichas que sirve el backend', () => {
    // helmet lo pone por defecto en /stories/*; el sitio estatico no lo tenia y
    // Lighthouse lo listaba con gravedad alta. Nada del sitio abre ventanas
    // con `window.open` ni depende de `opener` (comprobado por grep, 6-oct-2026).
    expect(config.globalHeaders['Cross-Origin-Opener-Policy']).toBe('same-origin')
  })
})
