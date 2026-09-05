import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ISSUE_LINKS, VERTICAL_LINKS, FOOTER_NAV } from './PublicLayout'

/**
 * Cada enlace de la navegacion tiene que caer en una ruta declarada.
 *
 * El 4-sep-2026 la vertical de Wallmapu apuntaba a `/comunidades/mapuche` y
 * daba 404: la ruta de una comunidad es `/comunidad/:slug`, en singular, y
 * `/comunidades` es el directorio, que no acepta slug. El enlace era plausible
 * a la vista y estuvo roto en produccion. Nadie lo habria notado leyendo el
 * archivo, porque el error esta en la relacion entre dos archivos.
 */
function rutasDeclaradas(): string[] {
  const app = readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8')
  return [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1])
}

/** Una ruta con parametros (`/comunidad/:slug`) casa con cualquier valor. */
function existeRuta(href: string, rutas: string[]): boolean {
  const partes = href.split('?')[0].split('#')[0].split('/').filter(Boolean)
  return rutas.some((r) => {
    if (r === '*') return false
    const rp = r.split('/').filter(Boolean)
    if (rp.length !== partes.length) return false
    return rp.every((seg, i) => seg.startsWith(':') || seg === partes[i])
  })
}

describe('navegacion publica', () => {
  const rutas = rutasDeclaradas()

  it('App.tsx declara rutas que se pueden leer', () => {
    expect(rutas.length).toBeGreaterThan(10)
  })

  for (const [nombre, enlaces] of [
    ['categorias', ISSUE_LINKS],
    ['verticales', VERTICAL_LINKS],
    ['pie', FOOTER_NAV],
  ] as const) {
    it(`cada enlace de ${nombre} cae en una ruta declarada`, () => {
      for (const l of enlaces) {
        const href = 'href' in l ? l.href : ''
        expect(existeRuta(href, rutas), `${href} no corresponde a ninguna ruta`).toBe(true)
      }
    })
  }

  it('son ocho categorias tematicas', () => {
    expect(ISSUE_LINKS).toHaveLength(8)
  })

  it('ninguna categoria tematica es una seccion geografica', () => {
    // Chile y Abya Yala viven en la barra de verticales, no entre los temas.
    const slugs = ISSUE_LINKS.map((l) => l.slug)
    expect(slugs).not.toContain('chile-indigena')
    expect(slugs).not.toContain('latinoamerica')
  })
})
