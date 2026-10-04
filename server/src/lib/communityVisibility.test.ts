import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  issue: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}))
vi.mock('./prisma.js', () => ({ default: mockPrisma }))

const { publicCommunityWhere, effectiveMode, getReviewMode, reviewExclusion, buildCommunityCondition } = await import('./communityVisibility.js')

const COMMUNITY = { id: 'c-mapuche', keywords: ['mapuche'], issueIds: [] }
const TEMAS = new Set<string>()
const COND = buildCommunityCondition(COMMUNITY.keywords, COMMUNITY.issueIds, TEMAS).where

/**
 * Retencion por vertical (D4). La garantia que mas importa: en off la vertical
 * se ve EXACTAMENTE como antes, y en sombra solo se oculta lo que una persona
 * retuvo. Encender el gate no puede vaciar las 387 notas de Voces Mapuche.
 */
describe('publicCommunityWhere', () => {
  it('en off devuelve exactamente el where de siempre (publicada, relevancia >= 3, palabras clave)', () => {
    const w = publicCommunityWhere({ community: COMMUNITY, temas: TEMAS, mode: 'off', learningMode: true })
    expect(w).toEqual({ status: 'published', relevance: { gte: 3 }, ...COND })
  })

  it('en sombra excluye SOLO lo retenido por una persona', () => {
    const w = publicCommunityWhere({ community: COMMUNITY, temas: TEMAS, mode: 'shadow', learningMode: true })
    expect(w).toEqual({
      status: 'published',
      relevance: { gte: 3 },
      AND: [COND, { NOT: { communityReviews: { some: { communityId: 'c-mapuche', reviewState: 'held' } } } }],
    })
  })

  it('en enforce con el aprendizaje apagado exige fila auto o released (sin fila, invisible)', () => {
    const w = publicCommunityWhere({ community: COMMUNITY, temas: TEMAS, mode: 'enforce', learningMode: false })
    expect(w).toEqual({
      status: 'published',
      relevance: { gte: 3 },
      AND: [COND, { communityReviews: { some: { communityId: 'c-mapuche', reviewState: { in: ['auto', 'released'] } } } }],
    })
  })

  it('el candado: enforce con el aprendizaje encendido se comporta como sombra', () => {
    const enforce = publicCommunityWhere({ community: COMMUNITY, temas: TEMAS, mode: 'enforce', learningMode: true })
    const shadow = publicCommunityWhere({ community: COMMUNITY, temas: TEMAS, mode: 'shadow', learningMode: true })
    expect(enforce).toEqual(shadow)
  })

  it('combina con AND: una vertical sin via (id in []) no queda pisada por la exclusion', () => {
    const sinVia = { id: 'c-x', keywords: [], issueIds: ['tema-fantasma'] }
    const w = publicCommunityWhere({ community: sinVia, temas: TEMAS, mode: 'shadow', learningMode: false })
    expect(w.AND).toContainEqual({ id: { in: [] } })
  })
})

describe('effectiveMode y reviewExclusion', () => {
  it('solo degrada enforce, y solo con aprendizaje', () => {
    expect(effectiveMode('enforce', true)).toBe('shadow')
    expect(effectiveMode('enforce', false)).toBe('enforce')
    expect(effectiveMode('shadow', true)).toBe('shadow')
    expect(effectiveMode('off', true)).toBe('off')
  })
  it('off no agrega exclusion', () => {
    expect(reviewExclusion('c', 'off')).toBeNull()
  })
})

describe('getReviewMode nunca lanza y ante la duda es off', () => {
  beforeEach(() => vi.clearAllMocks())
  it('devuelve el modo de la fila', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ mode: 'shadow' }])
    await expect(getReviewMode('c')).resolves.toBe('shadow')
  })
  it('sin fila: off', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    await expect(getReviewMode('c')).resolves.toBe('off')
  })
  it('con un valor desconocido: off', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ mode: 'aplicar' }])
    await expect(getReviewMode('c')).resolves.toBe('off')
  })
  it('si la tabla no existe (codigo desplegado antes del SQL): off, sin lanzar', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('relation "community_review_modes" does not exist'))
    await expect(getReviewMode('c')).resolves.toBe('off')
  })
  it('si la consulta devuelve algo que no es una lista: off', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(undefined)
    await expect(getReviewMode('c')).resolves.toBe('off')
  })
})
