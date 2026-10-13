import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  issue: { findMany: vi.fn() },
  story: { findMany: vi.fn(), count: vi.fn() },
  storyCommunityReview: { findMany: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const {
  gateTextFor,
  gateScore,
  puntajesViejos,
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
  it('el encuadre «confrontacion» solo da 1; corroborado por la Lista A o la B sigue en 3 (decision del 13-oct-2026)', () => {
    // Medido: de 44 notas retenidas solo por el encuadre, 5 necesitaban revision.
    expect(gateScore({ reasons: ['frame:confrontacion'] })).toBe(1)
    expect(gateScore({ reasons: ['learning_mode', 'frame:confrontacion'] })).toBe(1)
    expect(gateScore({ reasons: ['learning_mode', 'frame:confrontacion', 'listA:desaloj'] })).toBe(3)
    expect(gateScore({ reasons: ['frame:confrontacion', 'listB+corroborated:fundo'] })).toBe(3)
  })
  it('B+B da puntaje 1, tambien bajo el aprendizaje, y se libera en masa', () => {
    expect(gateScore({ reasons: ['listB+B:carabineros', 'listB+B:predio'] })).toBe(1)
    expect(gateScore({ reasons: ['learning_mode', 'listB+B:tribunal', 'listB+B:restitu'] })).toBe(1)
  })
})

describe('evaluateForCommunity · B+B', () => {
  const OPERATIVO = { ...STORY, title: 'Carabineros llegó al predio de la comunidad', titleLabel: null, summary: null, narrativeFrame: null }
  it('sin aprendizaje: pendiente con puntaje 1', () => {
    const r = evaluateForCommunity(OPERATIVO, MAPUCHE, { learningMode: false, textSource: 'short' })
    expect(r.reviewState).toBe('pending')
    expect(r.gateScore).toBe(1)
    expect(r.gateReasons).toEqual(expect.arrayContaining(['listB+B:carabineros', 'listB+B:predio']))
  })
  it('con aprendizaje: sigue pendiente, pero con puntaje 1 y no 0 (sin el aprendizaje seguiria retenida)', () => {
    expect(evaluateForCommunity(OPERATIVO, MAPUCHE, { learningMode: true, textSource: 'short' }).gateScore).toBe(1)
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
  it('created_at es la entrada a la cola: se reinicia solo cuando la fila pasa a pending desde otro estado', () => {
    const sql = machineUpsertSql(evaluateForCommunity(STORY, MAPUCHE, { learningMode: true, textSource: 'short' }), new Date())
    const texto = sql.strings.join('?').replace(/\s+/g, ' ')
    expect(texto).toContain("created_at = CASE WHEN story_community_reviews.review_state <> 'pending' AND EXCLUDED.review_state = 'pending' THEN EXCLUDED.created_at ELSE story_community_reviews.created_at END")
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

describe('puntajesViejos', () => {
  it('agrupa por puntaje nuevo solo las filas cuyo puntaje guardado no sigue la regla vigente', () => {
    const m = puntajesViejos([
      { story_id: 'solo-encuadre', gate_reasons: ['learning_mode', 'frame:confrontacion'], gate_score: 3 },
      { story_id: 'encuadre-y-a', gate_reasons: ['learning_mode', 'frame:confrontacion', 'listA:desaloj'], gate_score: 3 },
      { story_id: 'aprendizaje', gate_reasons: ['learning_mode'], gate_score: 0 },
      { story_id: 'b-mal-guardada', gate_reasons: ['listB+B:tribunal', 'listB+B:predio'], gate_score: 0 },
    ])
    expect(Object.fromEntries(m)).toEqual({ 1: ['solo-encuadre', 'b-mal-guardada'] })
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

  it('recalcula el puntaje guardado de las filas de maquina sin tocar su estado ni las humanas', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'c-mapuche', slug: 'mapuche', keywords: ['mapuche'], issue_ids: [], mode: 'shadow' }]) // verticales
      .mockResolvedValueOnce([]) // filas viejas
      .mockResolvedValueOnce([
        { story_id: 's1', gate_reasons: ['learning_mode', 'frame:confrontacion'], gate_score: 3 },
        { story_id: 's2', gate_reasons: ['learning_mode', 'frame:confrontacion', 'listA:atentado'], gate_score: 3 },
      ]) // puntajes guardados
    mockPrisma.issue.findMany.mockResolvedValue([])
    mockPrisma.story.findMany
      .mockResolvedValueOnce([]) // faltantes
      .mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }]) // siguen encajando
    mockPrisma.storyCommunityReview.findMany.mockResolvedValue([{ storyId: 's1' }, { storyId: 's2' }])
    mockPrisma.storyCommunityReview.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.storyCommunityReview.groupBy.mockResolvedValue([{ reviewState: 'pending', _count: { _all: 2 } }])

    const [rep] = await reconcileCommunityReviews()

    expect(rep.rescored).toBe(1)
    expect(mockPrisma.storyCommunityReview.updateMany).toHaveBeenCalledOnce()
    expect(mockPrisma.storyCommunityReview.updateMany.mock.calls[0][0]).toEqual({
      where: { communityId: 'c-mapuche', reviewState: { in: ['auto', 'pending'] }, storyId: { in: ['s1'] } },
      data: { gateScore: 1 },
    })
    // la lectura de puntajes es solo de filas de maquina
    expect(String(mockPrisma.$queryRaw.mock.calls[2][0].join(''))).toContain("review_state IN ('auto', 'pending')")
    // y no reescribe la fila: ningun upsert
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled()
  })
})
