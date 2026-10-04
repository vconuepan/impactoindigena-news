import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  issue: { findMany: vi.fn() },
  story: { findMany: vi.fn(), count: vi.fn() },
  storyCommunityReview: { findMany: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const {
  gateTextFor,
  gateScore,
  marcaFor,
  evaluateForCommunity,
  machineUpsertSql,
  registerCommunityReviews,
  reconcileCommunityReviews,
} = await import('./communityReview.js')
const { GATE_VERSION } = await import('../lib/gate.js')

const STORY = {
  id: 's1',
  title: 'Taller de mapuzugun en Temuco',
  titleLabel: 'Lengua',
  summary: 'Comunidades organizan clases abiertas.',
  sourceTitle: 'Titular original',
  sourceContent: 'Cuerpo con la palabra atentado al pasar.',
  narrativeFrame: 'protagonismo',
  datePublished: new Date('2026-10-01T12:00:00Z'),
}
const MAPUCHE = { id: 'c-mapuche', slug: 'mapuche' }

describe('gateTextFor', () => {
  it('short: titulo, etiqueta y resumen; sin el cuerpo', () => {
    const t = gateTextFor(STORY, 'short')
    expect(t).toContain('Taller de mapuzugun')
    expect(t).toContain('Lengua')
    expect(t).not.toContain('atentado')
  })
  it('full: suma el cuerpo de la fuente', () => {
    expect(gateTextFor(STORY, 'full')).toContain('atentado')
  })
  it('sin titulo cae al titular de la fuente y salta los vacios', () => {
    const t = gateTextFor({ ...STORY, title: null, titleLabel: null, summary: '  ' }, 'short')
    expect(t).toBe('Titular original')
  })
})

describe('gateScore', () => {
  it('ordena por fuerza de señal', () => {
    expect(gateScore({ reasons: ['frame:confrontacion', 'listA:desaloj'] })).toBe(3)
    expect(gateScore({ reasons: ['listA:desaloj'] })).toBe(2)
    expect(gateScore({ reasons: ['listB+corroborated:fundo'] })).toBe(1)
    expect(gateScore({ reasons: ['learning_mode'] })).toBe(0)
    expect(gateScore({ reasons: [] })).toBe(0)
  })
})

describe('marcaFor', () => {
  it('mapea las dos verticales y deja el resto en indigenas', () => {
    expect(marcaFor('mapuche')).toBe('mapuche')
    expect(marcaFor('wallmapu-araucania')).toBe('araucania')
    expect(marcaFor('aymara')).toBe('indigenas')
  })
})

describe('evaluateForCommunity', () => {
  it('con aprendizaje: pendiente, puntaje 0, sin fecha en la vertical', () => {
    const r = evaluateForCommunity(STORY, MAPUCHE, { learningMode: true, textSource: 'short' })
    expect(r.reviewState).toBe('pending')
    expect(r.gateScore).toBe(0)
    expect(r.publishedAt).toBeNull()
    expect(r.gateVersion).toBe(GATE_VERSION)
  })
  it('una nota cultural sin aprendizaje: auto, visible desde su fecha de publicacion', () => {
    const r = evaluateForCommunity(STORY, MAPUCHE, { learningMode: false, textSource: 'short' })
    expect(r.reviewState).toBe('auto')
    expect(r.publishedAt).toEqual(STORY.datePublished)
  })
  it('el texto elegido importa: el cuerpo con «atentado» solo retiene con full', () => {
    expect(evaluateForCommunity(STORY, MAPUCHE, { learningMode: false, textSource: 'short' }).reviewState).toBe('auto')
    const full = evaluateForCommunity(STORY, MAPUCHE, { learningMode: false, textSource: 'full' })
    expect(full.reviewState).toBe('pending')
    expect(full.gateReasons).toContain('listA:atentado')
    expect(full.gateTextSource).toBe('full')
  })
})

describe('machineUpsertSql', () => {
  it('nunca pisa una decision humana: el ON CONFLICT solo actualiza filas auto o pending', () => {
    const sql = machineUpsertSql(evaluateForCommunity(STORY, MAPUCHE, { learningMode: true, textSource: 'short' }), new Date())
    const texto = sql.strings.join('?').replace(/\s+/g, ' ')
    expect(texto).toContain("ON CONFLICT (story_id, community_id) DO UPDATE SET")
    expect(texto).toContain("WHERE story_community_reviews.review_state IN ('auto', 'pending')")
  })
  it('las fechas van en UTC explicito, no en la zona de la sesion de la base', () => {
    const sql = machineUpsertSql(evaluateForCommunity(STORY, MAPUCHE, { learningMode: false, textSource: 'short' }), new Date())
    const texto = sql.strings.join('?')
    // gate_evaluated_at, published_at, created_at, updated_at y el CASE del ON CONFLICT
    expect((texto.match(/::timestamptz AT TIME ZONE 'UTC'/g) ?? []).length).toBe(5)
  })
  it('published_at nunca vuelve a null: COALESCE con lo que ya tenia', () => {
    const sql = machineUpsertSql(evaluateForCommunity(STORY, MAPUCHE, { learningMode: false, textSource: 'short' }), new Date())
    expect(sql.strings.join('?').replace(/\s+/g, ' ')).toContain('COALESCE( story_community_reviews.published_at,')
  })
})

describe('registerCommunityReviews (el gancho) nunca lanza', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sin ids no consulta nada', async () => {
    await registerCommunityReviews([])
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('si la tabla de modos no existe, no lanza ni escribe', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('relation "community_review_modes" does not exist'))
    await expect(registerCommunityReviews(['s1'])).resolves.toBeUndefined()
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled()
  })

  it('sin verticales en revision, no escribe', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    await registerCommunityReviews(['s1'])
    expect(mockPrisma.story.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled()
  })

  it('con una vertical en sombra: evalua solo las notas que encajan y escribe una fila por nota', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'c-mapuche', slug: 'mapuche', keywords: ['mapuche'], issue_ids: [], mode: 'shadow' }])
    mockPrisma.issue.findMany.mockResolvedValue([])
    mockPrisma.story.findMany.mockResolvedValue([STORY, { ...STORY, id: 's2' }])
    mockPrisma.$executeRaw.mockResolvedValue(1)
    await registerCommunityReviews(['s1', 's2', 's3'])
    const where = mockPrisma.story.findMany.mock.calls[0][0].where
    expect(where.AND[0]).toEqual({ id: { in: ['s1', 's2', 's3'] } })
    expect(where.AND[1]).toMatchObject({ status: 'published', relevance: { gte: 3 } })
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2)
  })

  it('si una escritura falla, no lanza', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'c-mapuche', slug: 'mapuche', keywords: ['mapuche'], issue_ids: [], mode: 'shadow' }])
    mockPrisma.issue.findMany.mockResolvedValue([])
    mockPrisma.story.findMany.mockResolvedValue([STORY])
    mockPrisma.$executeRaw.mockRejectedValue(new Error('boom'))
    await expect(registerCommunityReviews(['s1'])).resolves.toBeUndefined()
  })
})

describe('reconcileCommunityReviews', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sin verticales en revision no hace nada', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    await expect(reconcileCommunityReviews()).resolves.toEqual([])
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled()
  })

  it('crea las faltantes, borra solo filas de MAQUINA huerfanas y no toca las humanas', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'c-mapuche', slug: 'mapuche', keywords: ['mapuche'], issue_ids: [], mode: 'shadow' }]) // verticales
      .mockResolvedValueOnce([]) // filas viejas
    mockPrisma.issue.findMany.mockResolvedValue([])
    mockPrisma.story.findMany
      .mockResolvedValueOnce([STORY]) // faltantes (menos que un lote: termina)
      .mockResolvedValueOnce([{ id: 's1' }]) // de las filas de maquina, cuales siguen encajando
    mockPrisma.$executeRaw.mockResolvedValue(1)
    mockPrisma.storyCommunityReview.findMany.mockResolvedValue([{ storyId: 's1' }, { storyId: 'huerfana' }])
    mockPrisma.storyCommunityReview.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.storyCommunityReview.groupBy.mockResolvedValue([{ reviewState: 'pending', _count: { _all: 1 } }])

    const [rep] = await reconcileCommunityReviews()
    expect(rep.created).toBe(1)
    expect(rep.deleted).toBe(1)
    // solo lee y borra filas de maquina: las released/held quedan fuera de la consulta
    expect(mockPrisma.storyCommunityReview.findMany.mock.calls[0][0].where.reviewState).toEqual({ in: ['auto', 'pending'] })
    expect(mockPrisma.storyCommunityReview.deleteMany.mock.calls[0][0].where).toEqual({
      communityId: 'c-mapuche',
      reviewState: { in: ['auto', 'pending'] },
      storyId: { in: ['huerfana'] },
    })
    expect(rep.byState.pending).toBe(1)
  })
})
