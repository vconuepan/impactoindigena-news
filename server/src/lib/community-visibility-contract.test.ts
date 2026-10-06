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
const CARPETAS = ['routes/public', 'jobs', 'services']

/**
 * Composicion manual de la pertenencia: el archivo lee las palabras clave de una
 * COMUNIDAD y arma con ellas un OR de `contains`. Hacen falta las dos señales:
 * casos de seguimiento (cases.ts, homepage.ts) y spotlight tambien filtran por
 * palabras clave, pero las suyas, no las de una vertical.
 */
const LEE_PALABRAS_DE_COMUNIDAD =
  /\b(?:community|comm)\??\.keywords\b|\{\s*keywords\s*\}\s*=\s*\w*[cC]omm|SELECT[^`]*\bkeywords\b[^`]*FROM\s+communities/
/**
 * La FORMA del filtro, no el nombre de la variable: cada condicion `contains`
 * sobre titulo, resumen o medio. Asi no importa si alguien escribe
 * `(community.keywords ?? []).flatMap(...)`, usa otro nombre o un bucle.
 * Revision adversarial del 4-oct-2026: el patron anterior (`keywords.flatMap(`)
 * dejaba pasar esas variantes.
 */
const COMPOSICION_MANUAL = /\b(?:title|summary|sourceTitle)\s*:\s*\{\s*contains\s*:/g

/** Pendientes conocidos: archivo → cuantas condiciones `contains` arma hoy a mano (titulo + resumen = 2). */
const PENDIENTES: Record<string, number> = {
  // Vacia desde la Tanda B (4-oct-2026): RSS, digest y bienvenida ya pasan por publicCommunityWhere.
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

  it('las rutas publicas, los jobs y los servicios no usan buildCommunityCondition directo: pasan por publicCommunityWhere', () => {
    // Solo routes/public/communities.ts la nombra, y solo para reexportarla.
    const usan = archivos().filter((f) => /\bbuildCommunityCondition\b/.test(readFileSync(path.join(SRC, f), 'utf8')))
    expect(usan).toEqual(['routes/public/communities.ts'])
    const ruta = readFileSync(path.join(SRC, 'routes/public/communities.ts'), 'utf8')
    expect(ruta, 'la ruta llama buildCommunityCondition en vez de publicCommunityWhere').not.toMatch(/buildCommunityCondition\(/)
    expect(ruta, 'alias de importacion: evade este test').not.toMatch(/buildCommunityCondition\s+as\b/)
  })

  it('la pagina y el panel de señales de la vertical usan el filtro unico', () => {
    const ruta = readFileSync(path.join(SRC, 'routes/public/communities.ts'), 'utf8')
    expect((ruta.match(/publicCommunityWhere\(/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('los cinco consumidores pasan por el filtro unico CON el modo real de la vertical', () => {
    // pagina, señales y bienvenida en communities.ts; RSS en feed.ts; digest en el job.
    const consumidores: Record<string, number> = {
      'routes/public/communities.ts': 3,
      'routes/public/feed.ts': 1,
      'jobs/sendCommunityDigest.ts': 1,
    }
    for (const [f, n] of Object.entries(consumidores)) {
      const codigo = readFileSync(path.join(SRC, f), 'utf8')
      expect((codigo.match(/publicCommunityWhere\(/g) ?? []).length, `${f}: llamadas a publicCommunityWhere`).toBe(n)
      // El modo viene de la base, no esta cableado: `mode: 'off'` en un consumidor desactivaria la retencion ahi.
      expect((codigo.match(/mode:\s*await getReviewMode\(/g) ?? []).length, `${f}: el modo tiene que salir de getReviewMode`).toBe(n)
      expect(codigo, `${f}: modo cableado a mano`).not.toMatch(/mode:\s*'(?:off|shadow|enforce)'/)
    }
  })
})
