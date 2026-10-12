import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * El autopost no publica en redes lo que una vertical en enforce no muestra
 * (decision del director del 11-oct-2026). withheldInEnforcedVerticals decide
 * cuales; findAutoPostCandidates las saca de la carrera (socialMedia.test.ts).
 */
const mockPrisma = vi.hoisted(() => ({
  issue: { findMany: vi.fn() },
  story: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
const mockConfig = vi.hoisted(() => ({ learningMode: false }))
vi.mock('../config.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../config.js')>()
  return {
    ...real,
    config: { ...real.config, gate: { ...real.config.gate, get learningMode() { return mockConfig.learningMode } } },
  }
})

const { withheldInEnforcedVerticals } = await import('./communityReview.js')

const vertical = (slug: string, mode: string) => ({ id: `c-${slug}`, slug, keywords: [slug], issue_ids: [], mode })

beforeEach(() => {
  vi.clearAllMocks()
  mockConfig.learningMode = false
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.story.findMany.mockResolvedValue([])
})

describe('withheldInEnforcedVerticals', () => {
  it('con el aprendizaje encendido no hay enforce efectivo: vacio y sin consultar la base', async () => {
    mockConfig.learningMode = true
    const r = await withheldInEnforcedVerticals(['s1', 's2'])
    expect(r.size).toBe(0)
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('sin notas no consulta', async () => {
    expect((await withheldInEnforcedVerticals([])).size).toBe(0)
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('una vertical en sombra no retiene nada para el autopost', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([vertical('mapuche', 'shadow')])
    expect((await withheldInEnforcedVerticals(['s1'])).size).toBe(0)
    expect(mockPrisma.story.findMany).not.toHaveBeenCalled()
  })

  it('en enforce: las notas de la vertical sin fila auto ni released', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([vertical('mapuche', 'enforce'), vertical('wallmapu-araucania', 'shadow')])
    mockPrisma.story.findMany.mockResolvedValue([{ id: 's2' }])
    const r = await withheldInEnforcedVerticals(['s1', 's2', 's3'])
    expect([...r]).toEqual(['s2'])
    // Una consulta, solo por la vertical en enforce.
    expect(mockPrisma.story.findMany).toHaveBeenCalledTimes(1)
    const where = mockPrisma.story.findMany.mock.calls[0][0].where
    expect(where.AND[0]).toEqual({ id: { in: ['s1', 's2', 's3'] } })
    // Pertenencia: el mismo where que la pagina (publicada, relevancia, palabras clave).
    expect(where.AND[1]).toMatchObject({ status: 'published', relevance: { gte: 3 } })
    expect(JSON.stringify(where.AND[1])).toContain('mapuche')
    // Y lo que enforce no deja ver: sin fila auto ni released en ESTA vertical.
    expect(where.AND[2]).toEqual({ NOT: { communityReviews: { some: { communityId: 'c-mapuche', reviewState: { in: ['auto', 'released'] } } } } })
  })

  it('suma lo retenido en varias verticales en enforce', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([vertical('mapuche', 'enforce'), vertical('wallmapu-araucania', 'enforce')])
    mockPrisma.story.findMany.mockResolvedValueOnce([{ id: 's1' }]).mockResolvedValueOnce([{ id: 's3' }])
    expect([...(await withheldInEnforcedVerticals(['s1', 's2', 's3']))].sort()).toEqual(['s1', 's3'])
  })

  it('ante un error falla CERRADO: retiene todas y el autopost se salta la corrida', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('connection reset'))
    const r = await withheldInEnforcedVerticals(['s1', 's2'])
    expect([...r].sort()).toEqual(['s1', 's2'])
  })
})
