import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Dos listas de rutas, un solo sitio: `client/src/routes.ts` alimenta el
 * prerender y `sitemap.ts` alimenta el sitemap. El servidor no resuelve el alias
 * `@shared`, asi que estan duplicadas a proposito —el mismo compromiso que
 * documenta `homepage.ts`— y este test es lo que las mantiene juntas.
 *
 * EL 8-sep-2026 HABIAN DIVERGIDO EN LAS DOS DIRECCIONES, y cada direccion tenia
 * su propio costo:
 *
 * - DIEZ rutas vivian solo en el sitemap y no se prerenderizaban, asi que
 *   devolvian la portada byte a byte (md5 identico, medido en vivo). Son soft
 *   404, y no toleradas: DECLARADAS a Google en el sitemap. Este proyecto ya
 *   pago 229 Soft 404 en Search Console por la misma clase de defecto.
 * - CUATRO vivian solo en el cliente: existian como HTML estatico y Google no
 *   tenia forma de encontrarlas. Dos eran paginas legales, /terminos y /cookies.
 *
 * Ninguna de las dos mitades se nota mirando el sitio: las paginas se ven bien.
 */

const CLIENTE = readFileSync(path.resolve(__dirname, '../../../../client/src/routes.ts'), 'utf8')
const SERVIDOR = readFileSync(path.resolve(__dirname, 'sitemap.ts'), 'utf8')

interface Ruta { priority: string; changefreq: string }

/** Extrae las rutas del array que empieza en `marca`. */
function rutasDe(fuente: string, marca: string): Map<string, Ruta> {
  const i = fuente.indexOf(marca)
  if (i === -1) throw new Error(`no se encontro «${marca}»: el array se renombro o se movio`)
  const bloque = fuente.slice(i, i + fuente.slice(i).indexOf('\n]'))
  const out = new Map<string, Ruta>()
  for (const m of bloque.matchAll(/\{ path: '([^']+)', priority: ([\d.]+), changefreq: '(\w+)' \}/g)) {
    out.set(m[1], { priority: m[2], changefreq: m[3] })
  }
  return out
}

const cliente = rutasDe(CLIENTE, 'export const routes')
const servidor = rutasDe(SERVIDOR, 'const STATIC_ROUTES')

describe('el sitemap y el prerender declaran las mismas rutas', () => {
  it('las dos listas se leyeron y no estan vacias', () => {
    // Si un renombre rompiera la extraccion, los tests de abajo compararian dos
    // conjuntos vacios y pasarian sin comprobar nada.
    expect(cliente.size, 'no se extrajo ninguna ruta del cliente').toBeGreaterThan(20)
    expect(servidor.size, 'no se extrajo ninguna ruta del servidor').toBeGreaterThan(20)
  })

  it('ninguna ruta esta en el sitemap sin prerenderizarse', () => {
    // Esta direccion es la caran: cada una es un soft 404 pedido a Google.
    const soloServidor = [...servidor.keys()].filter((p) => !cliente.has(p))
    expect(
      soloServidor,
      `estas rutas se declaran en el sitemap y NO se prerenderizan, asi que devuelven la portada: ${soloServidor.join(', ')}`,
    ).toEqual([])
  })

  it('ninguna ruta se prerenderiza sin estar en el sitemap', () => {
    const soloCliente = [...cliente.keys()].filter((p) => !servidor.has(p))
    expect(
      soloCliente,
      `estas rutas existen como HTML estatico y el sitemap no las declara: ${soloCliente.join(', ')}`,
    ).toEqual([])
  })

  it('la prioridad y la frecuencia coinciden ruta por ruta', () => {
    const distintas = [...cliente.entries()]
      .filter(([p, c]) => {
        const s = servidor.get(p)
        return s && (s.priority !== c.priority || s.changefreq !== c.changefreq)
      })
      .map(([p, c]) => `${p} (cliente ${c.priority}/${c.changefreq} · servidor ${servidor.get(p)!.priority}/${servidor.get(p)!.changefreq})`)
    expect(distintas, `metadatos divergentes: ${distintas.join(' · ')}`).toEqual([])
  })
})

/**
 * LAS RUTAS DINAMICAS —secciones y comunidades— son la otra mitad, y los tests
 * de arriba NO las ven: solo comparan las dos listas estaticas.
 *
 * Por ese hueco entro el defecto del 10-sep-2026. Aca no hay dos listas que
 * comparar sino dos CONSULTAS: el sitemap hace `prisma.issue.findMany()` sin
 * filtro —34 secciones— y el prerender pide `/api/issues`, que filtra
 * `parentId: null` y anida las subsecciones en `children`. Quedarse con el
 * primer nivel dejaba 18 paginas declaradas a Google sirviendo la portada.
 *
 * Lo que si se puede atar leyendo el fuente es lo que hizo posible la
 * divergencia: los prefijos de URL y el aplanado de las subsecciones.
 */
describe('las rutas dinamicas: el sitemap y el prerender usan los mismos prefijos', () => {
  const PRERENDER = readFileSync(path.resolve(__dirname, '../../../../client/vite.config.ts'), 'utf8')
  const ISSUE_ROUTES = readFileSync(path.resolve(__dirname, '../../../../client/src/lib/issue-routes.ts'), 'utf8')

  /** Los prefijos que el sitemap escribe, de `${baseUrl}/<prefijo>/${...}`. */
  const delSitemap = new Set(
    [...SERVIDOR.matchAll(/\$\{baseUrl\}\/([a-z-]+)\/\$\{/g)].map((m) => m[1]),
  )

  /** Los del cliente: el de secciones es una constante, el de comunidades va en la plantilla. */
  const delCliente = new Set([
    ...[...ISSUE_ROUTES.matchAll(/PREFIJO_SECCION = '\/([a-z-]+)'/g)].map((m) => m[1]),
    ...[...PRERENDER.matchAll(/`\/([a-z-]+)\/\$\{/g)].map((m) => m[1]),
  ])

  it('los dos lados se leyeron y declaran prefijos', () => {
    expect(delSitemap.size, 'no se extrajo ningun prefijo del sitemap').toBeGreaterThan(1)
    expect(delCliente.size, 'no se extrajo ningun prefijo del cliente').toBeGreaterThan(1)
  })

  it('ningun prefijo esta en el sitemap sin prerenderizarse', () => {
    // Las historias se sirven desde el backend a proposito, no se prerenderizan
    // (staticwebapp.config.json → /api/og/story-html), asi que su prefijo no
    // tiene por que estar en el cliente.
    const soloServidor = [...delSitemap].filter((p) => p !== 'stories' && !delCliente.has(p))
    expect(
      soloServidor,
      `el sitemap declara URLs con estos prefijos y el prerender no genera ninguna: /${soloServidor.join(', /')}`,
    ).toEqual([])
  })

  it('ningun prefijo se prerenderiza sin estar en el sitemap', () => {
    const soloCliente = [...delCliente].filter((p) => !delSitemap.has(p))
    expect(
      soloCliente,
      `el prerender genera HTML con estos prefijos y el sitemap no los declara: /${soloCliente.join(', /')}`,
    ).toEqual([])
  })

  it('el prerender aplana las subsecciones en vez de quedarse con el primer nivel', () => {
    // `/api/issues` devuelve 16 madres con 18 hijas ANIDADAS. Un `.map` sobre el
    // primer nivel compila, corre y pierde 18 paginas sin que nada falle.
    //
    // Se exige la LLAMADA, no el nombre: buscar `rutasDeSecciones` a secas pasa
    // con el import puesto y el defecto de vuelta —comprobado por mutacion, la
    // primera version de este test no atrapo nada—.
    expect(
      /rutasDeSecciones\(/.test(PRERENDER),
      'vite.config.ts ya no LLAMA a `rutasDeSecciones`: si vuelve a mapear el primer nivel de /api/issues, las 18 subsecciones quedan declaradas en el sitemap devolviendo la portada',
    ).toBe(true)
  })

  it('el prerender no arma rutas de seccion a mano', () => {
    // La otra mitad de lo mismo: mientras nadie construya `/issues/...` con una
    // plantilla suelta en la config, el unico camino es la funcion que aplana.
    const aMano = [...PRERENDER.matchAll(/`\/issues\/\$\{[^`]*`/g)].map((m) => m[0])
    expect(
      aMano,
      `vite.config.ts vuelve a construir rutas de seccion a mano: ${aMano.join(' · ')}`,
    ).toEqual([])
  })
})

describe('toda ruta declarada existe de verdad en la aplicacion', () => {
  const APP = readFileSync(path.resolve(__dirname, '../../../../client/src/App.tsx'), 'utf8')

  it('las rutas dinamicas tienen su <Route> con parametro', () => {
    // El equivalente dinamico del test de abajo: el sitemap emite
    // `/issues/<slug>` y `/comunidad/<slug>`, y de nada sirve que coincidan los
    // prefijos si el router no tiene donde recibirlos.
    for (const patron of ['path="/issues/:slug"', 'path="/comunidad/:slug"']) {
      expect(APP.includes(patron), `falta ${patron} en App.tsx`).toBe(true)
    }
  })

  it('cada ruta del sitemap tiene su <Route> en App.tsx', () => {
    // Sincronizar las listas no basta: las dos podrian declarar a coro una ruta
    // que no existe. Lo que cierra el circulo es que el router la tenga.
    const sinRuta = [...servidor.keys()].filter((p) => {
      if (p === '/') return false
      return !APP.includes(`path="${p}"`)
    })
    expect(sinRuta, `declaradas en el sitemap y sin <Route> en App.tsx: ${sinRuta.join(', ')}`).toEqual([])
  })
})
