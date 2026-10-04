import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Contrato de la retencion por vertical (D4): lo que muestra una vertical se
 * decide en UN lugar, `publicCommunityWhere` (lib/communityVisibility.ts).
 *
 * Al 4-oct-2026 habia tres reglas distintas de pertenencia y el RSS de Voces
 * Mapuche entregaba 41 notas contra las 387 de la pagina. Este test impide que
 * aparezca una regla nueva compuesta a mano en una ruta publica o en un job, y
 * lleva la cuenta de las que quedan por migrar (Tanda B del diseño, item 11).
 *
 * Si arreglas una de la lista, el test falla hasta que la saques: asi la lista
 * nunca miente.
 */

const SRC = path.resolve(__dirname, '..')
const CARPETAS = ['routes/public', 'jobs']

/**
 * Composicion manual de la pertenencia: el archivo lee las palabras clave de una
 * COMUNIDAD y arma con ellas un OR de `contains`. Hacen falta las dos señales:
 * casos de seguimiento (cases.ts, homepage.ts) y spotlight tambien filtran por
 * palabras clave, pero las suyas, no las de una vertical.
 */
const LEE_PALABRAS_DE_COMUNIDAD = /\b(?:community|comm)\.keywords\b|keywords\s+FROM\s+communities/
const COMPOSICION_MANUAL = /keywords\.(?:flatMap|map)\(/g

/** Pendientes conocidos: archivo → cuantas composiciones manuales tiene hoy. */
const PENDIENTES: Record<string, number> = {
  'routes/public/feed.ts': 1, // RSS por vertical
  'jobs/sendCommunityDigest.ts': 1, // digest semanal
  'routes/public/communities.ts': 1, // correo de bienvenida
  'routes/public/opendata.ts': 1, // parametro community
}

function archivos(): string[] {
  return CARPETAS.flatMap((c) =>
    readdirSync(path.join(SRC, c))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => `${c}/${f}`),
  )
}

describe('una sola regla para lo que muestra una vertical', () => {
  it('ninguna ruta publica ni job compone la pertenencia a mano fuera de los pendientes declarados', () => {
    const encontrados: Record<string, number> = {}
    for (const f of archivos()) {
      const codigo = readFileSync(path.join(SRC, f), 'utf8')
      if (!LEE_PALABRAS_DE_COMUNIDAD.test(codigo)) continue
      const n = (codigo.match(COMPOSICION_MANUAL) ?? []).length
      if (n > 0) encontrados[f] = n
    }
    const nuevos = Object.keys(encontrados).filter((f) => !(f in PENDIENTES))
    expect(nuevos, `composicion manual nueva; usa publicCommunityWhere: ${nuevos.join(', ')}`).toEqual([])
    for (const [f, n] of Object.entries(PENDIENTES)) {
      expect(encontrados[f] ?? 0, `${f}: la cuenta cambio. Si la migraste a publicCommunityWhere, sacala de PENDIENTES`).toBe(n)
    }
  })

  it('las rutas publicas y los jobs no llaman buildCommunityCondition directo: pasan por publicCommunityWhere', () => {
    const directos = archivos().filter((f) => /buildCommunityCondition\(/.test(readFileSync(path.join(SRC, f), 'utf8')))
    expect(directos).toEqual([])
  })

  it('la pagina y el panel de señales de la vertical usan el filtro unico', () => {
    const ruta = readFileSync(path.join(SRC, 'routes/public/communities.ts'), 'utf8')
    expect((ruta.match(/publicCommunityWhere\(/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})
