import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { routePaths } from '../routes'

/**
 * Cada página pone su propia tarjeta para compartir, y el HTML base no trae una.
 *
 * EL DEFECTO (medido en vivo el 8-nov-2026). `index.html` traía un juego fijo
 * de Open Graph y Twitter con el título de la portada y `og:url` a «/», y Helmet
 * agregaba el de cada página DESPUÉS. Treinta de las 35 rutas prerenderizadas
 * llevaban dos juegos con el de la portada primero, y LinkedIn toma la primera
 * aparición (lo dice `server/src/routes/og.ts`). Las otras cinco —/alertas,
 * /archivo, /casos, /fuentes y /saved— no ponían ninguno y solo tenían el de la
 * portada. Compartir casi cualquier página del sitio mostraba la portada.
 *
 * Este test mira el fuente, no el HTML horneado: el prerender corre en el build
 * y no en los tests. La medición del HTML vivo está en la memoria del proyecto.
 */

const raiz = (...p: string[]) => path.resolve(__dirname, '..', ...p)
const leer = (p: string) => readFileSync(p, 'utf8')

describe('el HTML base no trae tarjeta para compartir', () => {
  const html = leer(path.resolve(__dirname, '../../index.html')).replace(/<!--[\s\S]*?-->/g, '')

  for (const etiqueta of [
    'og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name',
    'twitter:card', 'twitter:image', 'twitter:title', 'twitter:description',
  ]) {
    it(`sin ${etiqueta} fijo`, () => {
      expect(html, `index.html volvió a traer ${etiqueta}: se duplica en cada página y gana el de la portada`)
        .not.toMatch(new RegExp(`(property|name)="${etiqueta}"`))
    })
  }
})

/** Ruta pública → archivo de la página, leyendo App.tsx. */
function archivoDeCadaRuta(): Map<string, string> {
  const app = leer(raiz('App.tsx'))
  const componentes = new Map<string, string>()
  for (const m of app.matchAll(/const (\w+) = lazy\(\(\) => import\('\.\/pages\/([\w/]+)'\)\)/g)) {
    componentes.set(m[1], m[2])
  }
  for (const m of app.matchAll(/^import (\w+) from '\.\/pages\/([\w/]+)'/gm)) {
    componentes.set(m[1], m[2])
  }
  const rutas = new Map<string, string>()
  for (const m of app.matchAll(/<Route path="(\/[^"]*)" element=\{(?:<LazyPage>)?<(\w+)/g)) {
    const archivo = componentes.get(m[2])
    if (archivo) rutas.set(m[1], raiz('pages', `${archivo}.tsx`))
  }
  return rutas
}

describe('cada ruta prerenderizada pone su propia tarjeta', () => {
  const rutas = archivoDeCadaRuta()

  it('App.tsx se puede leer: toda ruta prerenderizada tiene su página', () => {
    const sinPagina = routePaths.filter((r) => !rutas.has(r) || !existsSync(rutas.get(r)!))
    expect(sinPagina, 'no encontré la página de estas rutas en App.tsx').toEqual([])
  })

  for (const ruta of routePaths) {
    it(`${ruta}: título, descripción, url, canónica e imagen propios`, () => {
      const fuente = leer(rutas.get(ruta)!)
      const juegoCompleto = fuente.includes('etiquetasDePagina(')
      const faltan = juegoCompleto
        ? []
        : ['og:title', 'og:description', 'og:url'].filter((e) => !fuente.includes(`"${e}"`))
      if (!juegoCompleto && !fuente.includes('CommonOgTags(')) faltan.push('og:image (CommonOgTags)')
      // /widgets y /news-fatigue no tenían canónica hasta el 8-nov-2026.
      if (!juegoCompleto && !fuente.includes('rel="canonical"')) faltan.push('canonical')
      expect(faltan, `${path.basename(rutas.get(ruta)!)} no pone: ${faltan.join(', ')}`).toEqual([])
    })
  }
})
