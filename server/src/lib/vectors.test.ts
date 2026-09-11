import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({ $queryRaw: vi.fn() }))
vi.mock('./prisma.js', () => ({ default: mockPrisma }))

const { searchByEmbedding, toVectorLiteral } = await import('./vectors.js')
const { config } = await import('../config.js')

/** El SQL que recibio `$queryRaw`, con los parametros marcados como `?`. */
function sqlDeLaLlamada(): { sql: string; params: unknown[] } {
  const [strings, ...params] = mockPrisma.$queryRaw.mock.calls[0]
  return { sql: (strings as string[]).join('?'), params }
}

/**
 * EL DEFECTO QUE ESTO CIERRA (11-sep-2026): la busqueda semantica ordenaba por
 * distancia coseno y cortaba en `limit` SIN filtrar, asi que siempre devolvia
 * las N historias mas cercanas por lejanas que fueran.
 *
 * Medido en la busqueda publica antes del arreglo: `qwertzxcvnoexiste` devolvia
 * **50 resultados** y `asdfghjklñpoiu` otros 50, contra 96 de «mapuche» y 61 de
 * «consulta». Sin separacion util entre un teclazo y una busqueda real.
 *
 * De paso quedaba inalcanzable el estado vacio de la pagina —`search.noResults`
 * existe y esta traducido—, porque el backend nunca devolvia cero.
 */
describe('searchByEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$queryRaw.mockResolvedValue([])
  })

  it('descarta las historias mas lejanas que el umbral', async () => {
    await searchByEmbedding([0.1, 0.2, 0.3])

    const { sql, params } = sqlDeLaLlamada()
    expect(
      sql,
      'la consulta volvio a quedarse sin filtro de distancia: devolveria las N mas cercanas aunque no se parezcan a nada',
    ).toMatch(/<=>\s*\?::vector\)?\s*<\s*\?/)
    expect(params).toContain(config.search.maxCosineDistance)
  })

  it('agrupa la distancia entre parentesis, para no depender de la precedencia', async () => {
    // `<=>` es un operador definido por la extension, no del nucleo de
    // PostgreSQL. Con parentesis, la comparacion no depende de como resuelva el
    // parser la precedencia frente a `<`.
    await searchByEmbedding([0.1, 0.2, 0.3])
    expect(sqlDeLaLlamada().sql).toContain('(s.embedding <=>')
  })

  it('sigue ordenando por distancia: el umbral acota, no reordena', async () => {
    await searchByEmbedding([0.1, 0.2, 0.3])
    expect(sqlDeLaLlamada().sql).toMatch(/ORDER BY\s+s\.embedding\s*<=>/)
  })

  it('respeta un umbral explicito por encima del de configuracion', async () => {
    await searchByEmbedding([0.1, 0.2, 0.3], { maxDistance: 0.55 })
    expect(sqlDeLaLlamada().params).toContain(0.55)
  })

  it('el umbral por defecto no supera la ortogonalidad', () => {
    // Por encima de 1.0 el filtro deja de significar «tiene alguna relacion» y
    // vuelve a dejar pasar cualquier cosa, que es el defecto de partida.
    expect(config.search.maxCosineDistance).toBeGreaterThan(0)
    expect(
      config.search.maxCosineDistance,
      'un umbral por encima de 1.0 (ortogonalidad) admite pares sin ninguna relacion',
    ).toBeLessThanOrEqual(1.0)
  })

  it('mantiene el limite y el filtro de publicadas', async () => {
    await searchByEmbedding([0.1, 0.2, 0.3], { limit: 7 })
    const { sql, params } = sqlDeLaLlamada()
    expect(sql).toContain("s.status = 'published'")
    expect(sql).toContain('s.embedding IS NOT NULL')
    expect(params).toContain(7)
  })
})

describe('toVectorLiteral', () => {
  it('serializa al literal que pgvector espera', () => {
    expect(toVectorLiteral([0.1, -0.2, 0.3])).toBe('[0.1,-0.2,0.3]')
  })
})
