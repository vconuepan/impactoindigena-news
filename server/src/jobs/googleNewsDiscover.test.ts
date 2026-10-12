import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Las busquedas del descubrimiento van a Bing News RSS, y Bing devuelve CERO
 * items con `OR` y con `site:` (medido el 17-ago-2026 y el 11-oct-2026). Una
 * busqueda asi no falla: simplemente no trae nada, y nadie se entera. Se lee el
 * archivo como texto para no arrastrar prisma ni el crawler a este test.
 */
const fuente = readFileSync(path.resolve(__dirname, 'googleNewsDiscover.ts'), 'utf8')
const queries = [...fuente.matchAll(/\{\s*query:\s*'([^']+)',\s*region:\s*'([^']+)'/g)].map((m) => ({ query: m[1], region: m[2] }))

describe('SEARCH_QUERIES del descubrimiento en Bing News', () => {
  it('se leyeron las queries', () => {
    expect(queries.length).toBeGreaterThan(40)
  })

  it('ninguna usa OR ni site:, que Bing News no admite', () => {
    for (const { query } of queries) {
      expect(query, query).not.toMatch(/\bOR\b/)
      expect(query, query).not.toMatch(/\bsite:/i)
    }
  })

  it('no hay queries repetidas en la misma region', () => {
    const claves = queries.map((q) => `${q.query.toLowerCase()}|${q.region}`)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('cubre La Araucania y el Puelmapu desde el 11-oct-2026', () => {
    const claves = queries.map((q) => `${q.query}|${q.region}`)
    for (const esperada of ['La Araucanía|CL:es', 'Temuco|CL:es', 'Angol|CL:es', '"Padre Las Casas"|CL:es', 'mapuche|AR:es']) {
      expect(claves).toContain(esperada)
    }
  })
})
