import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  storyBrandAssessment: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  $queryRaw: vi.fn(),
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const { vitrinaEncendida, vitrinaWhere, notasDeVitrina, mezclarPorFecha, comoNotaPublica, enlaceDeVitrina, fichaDeVitrina } = await import('./brandShowcase.js')

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
