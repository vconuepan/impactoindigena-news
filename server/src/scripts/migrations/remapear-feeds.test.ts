import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalIssueSlug } from '../../lib/issue-slug.js'
import { HOMEPAGE_ISSUE_SLUGS } from '../../routes/public/homepage.js'

/**
 * El mapa de feeds monotematicos nombra categorias por slug, a mano. Cuando una
 * categoria se renombra, esas cadenas quedan apuntando a algo que ya no existe
 * y el script **aborta con exit(1) antes de tocar un solo feed**.
 *
 * Eso ya paso, y en silencio: cinco entradas decian
 * `desarrollo-sostenible-y-autodeterminado` desde que la categoria pasó a
 * llamarse `economias-indigenas`. El remapeo figuraba como pendiente sin que
 * nadie supiera que no era que faltara correrlo — es que no podia correr.
 *
 * Este test lee el mapa del script real y comprueba que cada destino existe.
 * Es barato y ataja la clase entera de defecto.
 */

/** Extrae los slugs destino del mapa, del archivo tal cual está. */
function destinosDelMapa(): { clave: string; slug: string }[] {
  const src = readFileSync(path.resolve(__dirname, 'remapear-feeds.ts'), 'utf8')
  const ini = src.indexOf('const MONOTEMATICOS')
  const fin = src.indexOf('\n}', ini)
  if (ini < 0 || fin < 0) throw new Error('no se encontro MONOTEMATICOS en remapear-feeds.ts')
  const cuerpo = src.slice(ini, fin)
  return [...cuerpo.matchAll(/^\s*(?:'([^']+)'|([\w-]+))\s*:\s*'([^']+)'/gm)].map((m) => ({
    clave: m[1] ?? m[2],
    slug: m[3],
  }))
}

describe('el mapa de feeds monotematicos apunta a categorias que existen', () => {
  const entradas = destinosDelMapa()

  it('el mapa no esta vacio', () => {
    // Si el regex dejara de calzar, los demas tests pasarian sin comprobar nada.
    expect(entradas.length).toBeGreaterThan(20)
  })

  it('cada destino es una de las ocho categorias tematicas', () => {
    for (const { clave, slug } of entradas) {
      const canonico = canonicalIssueSlug(slug)
      expect(
        HOMEPAGE_ISSUE_SLUGS,
        `«${clave}» apunta a "${slug}"${canonico !== slug ? ` (alias de "${canonico}")` : ''}, que no es una categoria tematica`,
      ).toContain(canonico)
    }
  })

  it('ninguna entrada usa un slug que solo sobrevive por alias', () => {
    // Un alias mantiene el script vivo, pero el mapa deberia decir la verdad:
    // el slug de hoy, no el de la taxonomia anterior.
    const conAlias = entradas.filter((e) => canonicalIssueSlug(e.slug) !== e.slug)
    expect(
      conAlias.map((e) => `${e.clave} → ${e.slug}`),
      'hay entradas con el slug viejo; actualizarlas al canonico',
    ).toEqual([])
  })

  it('el destino por defecto tambien es una categoria tematica', () => {
    const src = readFileSync(path.resolve(__dirname, 'remapear-feeds.ts'), 'utf8')
    const m = src.match(/const GENERAL = '([^']+)'/)
    expect(m, 'no se encontro la constante GENERAL').not.toBeNull()
    expect(HOMEPAGE_ISSUE_SLUGS).toContain(canonicalIssueSlug(m![1]))
  })
})
