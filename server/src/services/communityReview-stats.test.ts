import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Alerta de antiguedad de la cola (D4, Tanda B, item 15): la pendiente mas
 * vieja contra config.gate.queueAlertHours. Con el aprendizaje encendido todo
 * es pendiente por diseño, asi que la alerta no se enciende.
 */
const mockPrisma = vi.hoisted(() => ({
  issue: { findMany: vi.fn() },
  story: { count: vi.fn() },
  storyCommunityReview: { groupBy: vi.fn(), findFirst: vi.fn() },
  $queryRaw: vi.fn(),
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
const mockConfig = vi.hoisted(() => ({ learningMode: true, queueAlertHours: 48, learningExit: {} as Record<string, number> }))
vi.mock('../config.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../config.js')>()
  return {
    ...real,
    config: {
      ...real.config,
      gate: {
        ...real.config.gate,
        get learningMode() { return mockConfig.learningMode },
        get queueAlertHours() { return mockConfig.queueAlertHours },
        get learningExit() { return { ...real.config.gate.learningExit, ...mockConfig.learningExit } },
      },
    },
  }
})

const { communityReviewStats, learningExitCriteria } = await import('./communityReview.js')
const COMUNIDAD = { id: 'c1', keywords: ['mapuche'], issueIds: [] }
const hace = (h: number) => new Date(Date.now() - h * 3_600_000)

beforeEach(() => {
  vi.clearAllMocks()
  mockConfig.learningMode = true
  mockConfig.queueAlertHours = 48
  mockConfig.learningExit = {}
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.story.count.mockResolvedValue(0)
  mockPrisma.storyCommunityReview.groupBy.mockResolvedValue([{ reviewState: 'pending', _count: { _all: 3 } }])
})

describe('communityReviewStats: antiguedad de la cola', () => {
  it('sin pendientes: null y sin alerta', async () => {
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue(null)
    const s = await communityReviewStats(COMUNIDAD, 'shadow')
    expect(s.oldestPendingAt).toBeNull()
    expect(s.oldestPendingHours).toBeNull()
    expect(s.queueAlert).toBe(false)
  })

  it('con el aprendizaje encendido no alerta aunque la pendiente tenga 100 horas', async () => {
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue({ createdAt: hace(100) })
    const s = await communityReviewStats(COMUNIDAD, 'shadow')
    expect(s.oldestPendingHours).toBe(100)
    expect(s.queueAlert).toBe(false)
  })

  it('con el aprendizaje apagado alerta desde el umbral, y no antes', async () => {
    mockConfig.learningMode = false
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue({ createdAt: hace(47.5) })
    expect((await communityReviewStats(COMUNIDAD, 'shadow')).queueAlert).toBe(false)
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue({ createdAt: hace(48.2) })
    expect((await communityReviewStats(COMUNIDAD, 'shadow')).queueAlert).toBe(true)
    // La consulta pide la pendiente MAS VIEJA.
    const call = mockPrisma.storyCommunityReview.findFirst.mock.calls[0][0]
    expect(call.where).toEqual({ communityId: 'c1', reviewState: 'pending' })
    expect(call.orderBy[0]).toEqual({ createdAt: 'asc' })
  })

  // Visto el 11-oct-2026: la edad se media por gate_evaluated_at, que el
  // conciliador reescribe en cada cambio de listas. Con B+B (version nueva) toda
  // la cola habria parecido recien llegada y la alerta se habria apagado sola.
  it('mide desde que la fila entro a la cola, no desde la ultima reevaluacion', async () => {
    mockConfig.learningMode = false
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue({ createdAt: hace(60) })
    const s = await communityReviewStats(COMUNIDAD, 'shadow')
    expect(s.oldestPendingHours).toBe(60)
    const call = mockPrisma.storyCommunityReview.findFirst.mock.calls[0][0]
    expect(call.select).toEqual({ createdAt: true })
    expect(JSON.stringify(call.orderBy)).not.toContain('gateEvaluatedAt')
    expect(JSON.stringify(call.orderBy)).not.toContain('publishedAt')
  })

  it('con el aprendizaje encendido «si aplicaras» es una proyeccion: auto, released o pendiente con puntaje 0', async () => {
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue(null)
    const s = await communityReviewStats(COMUNIDAD, 'shadow')
    expect(s.visibleIfEnforcedProjected).toBe(true)
    const where = mockPrisma.story.count.mock.calls[1][0].where
    const some = where.AND[1].communityReviews.some
    expect(some.communityId).toBe('c1')
    expect(some.OR).toEqual([{ reviewState: { in: ['auto', 'released'] } }, { reviewState: 'pending', gateScore: 0 }])
  })

  it('con el aprendizaje apagado «si aplicaras» es el where real de enforce', async () => {
    mockConfig.learningMode = false
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue(null)
    const s = await communityReviewStats(COMUNIDAD, 'shadow')
    expect(s.visibleIfEnforcedProjected).toBe(false)
    const where = mockPrisma.story.count.mock.calls[1][0].where
    expect(JSON.stringify(where)).not.toContain('gateScore')
    expect(JSON.stringify(where)).toContain('"in":["auto","released"]')
  })
})

/**
 * Criterio del director para apagar el modo aprendizaje (11-oct-2026, «ambos»):
 * dos semanas desde el encendido en sombra Y una semana con la cola al dia y
 * al menos 9 de cada 10 notas de puntaje 0 liberadas.
 */
describe('learningExitCriteria', () => {
  const ENCENDIDO = new Date('2026-10-04T19:46:00Z') // carga inicial en sombra
  const DIA = 86_400_000
  const fila = (o: Partial<{ review_since: Date | null; overdue_now: boolean | null; last_overdue_end: Date | null; score0_decided: number; score0_released: number }>) => [
    { review_since: ENCENDIDO, overdue_now: false, last_overdue_end: null, score0_decided: 0, score0_released: 0, ...o },
  ]

  it('la fecha: dos semanas desde la primera fila, 4-oct → 18-oct', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(fila({}))
    const antes = await learningExitCriteria('c1', new Date('2026-10-18T19:45:00Z'))
    expect(antes.earliestOffAt).toEqual(new Date('2026-10-18T19:46:00Z'))
    expect(antes.dateMet).toBe(false)
    expect((await learningExitCriteria('c1', new Date('2026-10-18T19:47:00Z'))).dateMet).toBe(true)
  })

  it('la cola: con una pendiente vencida hoy no esta al dia', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(fila({ overdue_now: true, last_overdue_end: new Date(ENCENDIDO.getTime() + DIA) }))
    const c = await learningExitCriteria('c1', new Date('2026-10-20T00:00:00Z'))
    expect(c.queueCurrentSince).toBeNull()
    expect(c.queueCurrentDays).toBe(0)
    expect(c.queueMet).toBe(false)
  })

  it('la cola: al dia desde la ultima vencida que se decidio; cumple con siete dias', async () => {
    const ahora = new Date('2026-10-20T12:00:00Z')
    mockPrisma.$queryRaw.mockResolvedValue(fila({ last_overdue_end: new Date(ahora.getTime() - 6.5 * DIA) }))
    expect((await learningExitCriteria('c1', ahora)).queueMet).toBe(false)
    mockPrisma.$queryRaw.mockResolvedValue(fila({ last_overdue_end: new Date(ahora.getTime() - 7 * DIA) }))
    const c = await learningExitCriteria('c1', ahora)
    expect(c.queueCurrentDays).toBe(7)
    expect(c.queueMet).toBe(true)
  })

  it('la cola: si nunca vencio una nota, esta al dia desde el encendido', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(fila({ last_overdue_end: null }))
    const c = await learningExitCriteria('c1', new Date(ENCENDIDO.getTime() + 10 * DIA))
    expect(c.queueCurrentSince).toEqual(ENCENDIDO)
    expect(c.queueCurrentDays).toBe(10)
  })

  it('puntaje 0: 9 de cada 10, con al menos 10 decisiones', async () => {
    const ahora = new Date('2026-10-20T00:00:00Z')
    const caso = async (decided: number, released: number) => {
      mockPrisma.$queryRaw.mockResolvedValue(fila({ score0_decided: decided, score0_released: released }))
      return (await learningExitCriteria('c1', ahora)).score0Met
    }
    expect(await caso(10, 9)).toBe(true)
    expect(await caso(10, 8)).toBe(false)
    expect(await caso(9, 9)).toBe(false) // muestra chica: «9 de cada 10» pide 10
    expect(await caso(30, 27)).toBe(true)
    expect(await caso(0, 0)).toBe(false)
  })

  it('puntaje 0: la proporcion se compara en enteros, no en coma flotante', async () => {
    // El umbral es configurable; con 0.55, 0.55 * 100 da 55.00000000000001 y la
    // comparacion directa dejaria fuera 55 liberadas de 100.
    mockConfig.learningExit = { score0ReleaseRatio: 0.55 }
    mockPrisma.$queryRaw.mockResolvedValue(fila({ score0_decided: 100, score0_released: 55 }))
    expect((await learningExitCriteria('c1', new Date('2026-10-20T00:00:00Z'))).score0Met).toBe(true)
    mockPrisma.$queryRaw.mockResolvedValue(fila({ score0_decided: 100, score0_released: 54 }))
    expect((await learningExitCriteria('c1', new Date('2026-10-20T00:00:00Z'))).score0Met).toBe(false)
  })

  it('cumple solo si se cumplen las tres', async () => {
    const ahora = new Date('2026-10-26T00:00:00Z')
    mockPrisma.$queryRaw.mockResolvedValue(fila({ last_overdue_end: new Date('2026-10-18T00:00:00Z'), score0_decided: 20, score0_released: 19 }))
    expect((await learningExitCriteria('c1', ahora)).met).toBe(true)
    mockPrisma.$queryRaw.mockResolvedValue(fila({ last_overdue_end: new Date('2026-10-18T00:00:00Z'), score0_decided: 20, score0_released: 17 }))
    expect((await learningExitCriteria('c1', ahora)).met).toBe(false)
  })

  it('sin filas no cumple nada y no lanza', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ review_since: null, overdue_now: null, last_overdue_end: null, score0_decided: 0, score0_released: 0 }])
    const c = await learningExitCriteria('c1')
    expect(c).toMatchObject({ reviewSince: null, earliestOffAt: null, dateMet: false, queueCurrentSince: null, queueMet: false, score0Met: false, met: false })
  })

  it('la consulta filtra por la vertical y usa los umbrales de config', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(fila({}))
    await learningExitCriteria('c1', new Date('2026-10-20T00:00:00Z'))
    const [strings, ...values] = mockPrisma.$queryRaw.mock.calls[0]
    const sql = (strings as string[]).join('?')
    expect(values).toContain('c1')
    expect(values).toContain(48)
    expect(values).toContain(7)
    expect(sql).toContain('FROM story_community_reviews')
    expect(sql).toContain("review_state = 'pending'")
    expect(sql).toContain('gate_score = 0')
  })

  it('las estadisticas de la vertical lo incluyen', async () => {
    mockPrisma.storyCommunityReview.findFirst.mockResolvedValue(null)
    mockPrisma.$queryRaw.mockResolvedValue(fila({}))
    const s = await communityReviewStats(COMUNIDAD, 'shadow')
    expect(s.learningExit.reviewSince).toEqual(ENCENDIDO)
    expect(s.learningExit.thresholds).toEqual({ minDays: 14, windowDays: 7, score0ReleaseRatio: 0.9, score0MinDecisions: 10, queueAlertHours: 48 })
  })
})
