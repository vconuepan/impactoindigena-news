import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { HOMEPAGE_ISSUE_SLUGS } from './homepage.js'

/**
 * El servidor y el cliente enumeran las mismas ocho categorias, y no pueden
 * compartir el archivo porque el server no resuelve el alias `@shared`. Este
 * test lee el del cliente como texto y compara.
 *
 * El 5-sep-2026 se desincronizaron: el server se quedo con cinco slugs y con el
 * legado de Economias, asi que la portada pedia historias para cinco secciones
 * y las cuatro nuevas llegaban vacias al navegador aunque tuvieran 1.180
 * historias entre ellas. Nada fallaba: simplemente no se veian.
 */
function slugsDelCliente(): string[] {
  const archivo = path.resolve(__dirname, '../../../../client/src/lib/issue-order.ts')
  const src = readFileSync(archivo, 'utf8')
  const bloque = src.slice(src.indexOf('ISSUE_ORDER'), src.indexOf('GEOGRAPHIC_SLUGS'))
  return [...bloque.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
}

describe('las categorias de la portada', () => {
  it('son las mismas en el servidor y en el cliente, y en el mismo orden', () => {
    expect(HOMEPAGE_ISSUE_SLUGS).toEqual(slugsDelCliente())
  })

  it('son ocho', () => {
    expect(HOMEPAGE_ISSUE_SLUGS).toHaveLength(8)
  })

  it('ninguna es una seccion geografica', () => {
    // Una seccion geografica se llena por pais, no por asunto: pedirle
    // historias a la portada como si fuera un tema devuelve el mismo material
    // dos veces.
    for (const geo of ['chile-indigena', 'latinoamerica', 'africa', 'asia', 'oceania']) {
      expect(HOMEPAGE_ISSUE_SLUGS).not.toContain(geo)
    }
  })

  it('usa el slug canonico de Economias, no el legado', () => {
    expect(HOMEPAGE_ISSUE_SLUGS).toContain('economias-indigenas')
    expect(HOMEPAGE_ISSUE_SLUGS).not.toContain('desarrollo-sostenible-y-autodeterminado')
  })
})
