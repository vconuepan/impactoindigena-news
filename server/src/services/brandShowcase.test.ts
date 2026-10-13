import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  storyBrandAssessment: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  $queryRaw: vi.fn(),
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const { vitrinaEncendida, vitrinaWhere, notasDeVitrina, mezclarPorFecha, comoNotaPublica, enlaceDeVitrina, fichaDeVitrina, reglasDeDestacadas, elegirDestacadas } = await import('./brandShowcase.js')

beforeEach(() => vi.clearAllMocks())

describe('la vitrina de marca (D5, entrega 2)', () => {
  it('se enciende solo con la marca o su rescate en modo aplicar; sin tabla, apagada', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ mode: 'shadow', rescue_mode: 'off' }])
    expect(await vitrinaEncendida('c1')).toBe(false)
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ mode: 'shadow', rescue_mode: 'enforce' }])
    expect(await vitrinaEncendida('c1')).toBe(true)
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ mode: 'enforce', rescue_mode: 'off' }])
    expect(await vitrinaEncendida('c1')).toBe(true)
    mockPrisma.$queryRaw.mockResolvedValueOnce([])
    expect(await vitrinaEncendida('c1')).toBe(false)
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('relation "community_brand_criteria" does not exist'))
    expect(await vitrinaEncendida('c1')).toBe(false)
  })

  it('solo lo publicado por la marca y visible en D4 para esta vertical (auto o liberada)', () => {
    expect(vitrinaWhere('c1')).toEqual({
      communityId: 'c1',
      state: 'published',
      story: { communityReviews: { some: { communityId: 'c1', reviewState: { in: ['auto', 'released'] } } } },
    })
  })

  it('apagada no consulta las notas', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ mode: 'shadow', rescue_mode: 'off' }])
    expect(await notasDeVitrina('c1', { take: 10 })).toEqual([])
    expect(mockPrisma.storyBrandAssessment.findMany).not.toHaveBeenCalled()
  })

  it('mezcla dos listas por fecha y corta la ventana pedida', () => {
    const a = [{ id: 'p1', t: 13 }, { id: 'p2', t: 11 }, { id: 'p3', t: 9 }]
    const b = [{ id: 'm1', t: 12 }, { id: 'm2', t: 10 }]
    const f = (x: { t: number }) => x.t
    expect(mezclarPorFecha(a, b, f, f, 0, 5).map((x) => x.id)).toEqual(['p1', 'm1', 'p2', 'm2', 'p3'])
    expect(mezclarPorFecha(a, b, f, f, 2, 2).map((x) => x.id)).toEqual(['p2', 'm2'])
    expect(mezclarPorFecha(a, [], f, f, 0, 2).map((x) => x.id)).toEqual(['p1', 'p2'])
  })

  it('la nota de vitrina no lleva slug global, tema ni relevancia, y enlaza a su ficha en la vertical', () => {
    const n = comoNotaPublica(
      {
        brandTitle: 'Angol inaugura su CESFAM', brandSummary: 'Resumen.', brandSlug: 'angol-inaugura-su-cesfam-abc123', brandDate: new Date('2026-10-13T12:00:00Z'),
        brandScore: 6, axis: 'region_completa', place: null, sourceSignal: 'term',
        story: { id: 's1', sourceUrl: 'https://x', sourceTitle: 'Crudo', imageUrl: null, narrativeFrame: null, feedId: 'f1', feed: { id: 'f1', title: 'Angol Noticias', displayTitle: null, issue: { name: 'X', slug: 'x' } } },
      },
      'wallmapu-araucania',
    )
    expect(n).toMatchObject({ slug: null, brandSlug: 'angol-inaugura-su-cesfam-abc123', communitySlug: 'wallmapu-araucania', title: 'Angol inaugura su CESFAM', issue: null, relevance: null })
    expect(enlaceDeVitrina('wallmapu-araucania', 'x-abc')).toBe('/comunidad/wallmapu-araucania/n/x-abc')
  })

  it('la ficha exige la vitrina encendida y la nota visible', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ mode: 'off', rescue_mode: 'off' }])
    expect(await fichaDeVitrina('c1', 'x')).toBeNull()
    expect(mockPrisma.storyBrandAssessment.findFirst).not.toHaveBeenCalled()
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ mode: 'enforce', rescue_mode: 'off' }])
    mockPrisma.storyBrandAssessment.findFirst.mockResolvedValueOnce(null)
    expect(await fichaDeVitrina('c1', 'x')).toBeNull()
    expect(mockPrisma.storyBrandAssessment.findFirst.mock.calls[0][0].where).toMatchObject({ brandSlug: 'x', state: 'published' })
  })
})

describe('destacadas de Voces Mapuche (D5, ítem 9)', () => {
  const balance = { confrontacionMaxDestacadas: 0.3334, ejeDirectorMinDestacadas: 1, puelmapuMinDestacadas: 1, porFeedMaxDestacadas: 3 }
  const c = (id: string, dia: number, encuadre: string | null = null) => ({ storyId: id, encuadre, feedId: `f-${id}`, fecha: new Date(Date.UTC(2026, 9, dia)) })

  it('solo la escala Mapuche en modo aplicar ordena destacadas', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ criterion: 'escala_mapuche', mode: 'enforce', balance }])
    expect(await reglasDeDestacadas('c1')).toMatchObject({ confrontacionMax: 0.3334, ejeDirectorMin: 1 })
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ criterion: 'escala_mapuche', mode: 'shadow', balance }])
    expect(await reglasDeDestacadas('c1')).toBeNull()
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ criterion: 'territorial', mode: 'enforce', balance: {} }])
    expect(await reglasDeDestacadas('c1')).toBeNull()
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('sin tabla'))
    expect(await reglasDeDestacadas('c1')).toBeNull()
  })

  it('sin reglas: las n más recientes, sin leer notas de marca', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([])
    const r = await elegirDestacadas('c1', [c('a', 13), c('b', 12), c('d', 11)], 2, (x) => x)
    expect(r.map((x) => x.storyId)).toEqual(['a', 'b'])
    expect(mockPrisma.storyBrandAssessment.findMany).not.toHaveBeenCalled()
  })

  it('con la escala en modo aplicar: nota de marca, tope de confrontación y un eje del director', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ criterion: 'escala_mapuche', mode: 'enforce', balance }])
    mockPrisma.storyBrandAssessment.findMany.mockResolvedValueOnce([
      { storyId: 'k1', brandScore: 6, axis: 'conflicto', place: 'araucania' },
      { storyId: 'k2', brandScore: 6, axis: 'conflicto', place: 'araucania' },
      { storyId: 'k3', brandScore: 6, axis: 'conflicto', place: 'araucania' },
      { storyId: 't1', brandScore: 5, axis: 'territorio_derechos', place: 'araucania' },
      { storyId: 't2', brandScore: 5, axis: 'territorio_derechos', place: 'araucania' },
      { storyId: 't3', brandScore: 5, axis: 'territorio_derechos', place: 'puelmapu' },
      { storyId: 'l1', brandScore: 4, axis: 'lengua', place: 'gulumapu' },
    ])
    const cands = [c('k1', 13, 'confrontacion'), c('k2', 13, 'confrontacion'), c('k3', 12, 'confrontacion'), c('t1', 12), c('t2', 11), c('t3', 11), c('l1', 10)]
    const r = (await elegirDestacadas('c1', cands, 5, (x) => x)).map((x) => x.storyId)
    expect(r).toHaveLength(5)
    expect(r.filter((id) => id.startsWith('k'))).toHaveLength(1)
    expect(r).toContain('l1')
  })

  it('la nota de marca decide entre candidatas sin otra regla en juego: gana la de más nota, aunque sea más vieja', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ criterion: 'escala_mapuche', mode: 'enforce', balance: { ...balance, ejeDirectorMinDestacadas: 0, puelmapuMinDestacadas: 0 } }])
    mockPrisma.storyBrandAssessment.findMany.mockResolvedValueOnce([
      { storyId: 'nueva', brandScore: 3, axis: 'territorio_derechos', place: 'araucania' },
      { storyId: 'vieja', brandScore: 8, axis: 'territorio_derechos', place: 'araucania' },
    ])
    const r = await elegirDestacadas('c1', [c('nueva', 13), c('vieja', 10)], 1, (x) => x)
    expect(r.map((x) => x.storyId)).toEqual(['vieja'])
  })
})
