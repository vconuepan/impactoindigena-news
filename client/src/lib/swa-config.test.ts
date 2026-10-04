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
