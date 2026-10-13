import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const mockPrisma = vi.hoisted(() => ({
  issue: { findMany: vi.fn() },
  story: { findMany: vi.fn() },
  storyBrandAssessment: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('./llm.js', () => ({
  getMediumLLM: () => ({ withStructuredOutput: () => ({ invoke: mockInvoke }) }),
  rateLimitDelay: async () => {},
}))
vi.mock('../lib/retry.js', () => ({ withRetry: (fn: () => Promise<unknown>) => fn() }))

const brandLaneConfig = vi.hoisted(() => ({ enabled: true, maxCandidatesPerRun: 40, maxAttempts: 2 }))
vi.mock('../config.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../config.js')>()
  return { config: { ...orig.config, brandLane: brandLaneConfig } }
})

const { aplicarJuicio, motivoSeguro, juzgarPendientes, runBrandLaneOnce, seleccionarTerritorial, seleccionarRescate, ordenarRescate, sinCandidatasRecientes, TAMANO_LOTE } =
  await import('./brandLane.js')
const { buildTerritorialPrompt, buildMapuchePrompt } = await import('../prompts/brandLane.js')
const { MOTIVO_GENERICO } = await import('../lib/brandLanguage.js')

const ARAUCANIA = {
  communityId: 'c-arauc',
  slug: 'wallmapu-araucania',
  keywords: ['araucanía'],
  issueIds: [],
  criterion: 'territorial' as const,
  mode: 'shadow' as const,
  rescueMode: 'off' as const,
  guidelines: 'Regla de entrada: la nota trata sobre La Araucanía.',
  guidelinesVersion: 1,
  relevanceMin: 5,
  dailyTarget: 3,
  balance: { regionCompletaMin: 0.5, mapucheChilenoMaxDia: 1, porComunaMaxDia: 1 },
  dailyCallCap: 20,
}
const AHORA = new Date('2026-10-13T12:00:00Z')

const pendiente = (n: number, attempts = 0) => ({
  id: `a${n}`,
  storyId: `s${n}`,
  attempts,
  story: { sourceTitle: `Titular ${n} en Angol`, sourceContent: `Cuerpo ${n}` },
})
const respuesta = (n: number, extra: Record<string, unknown> = {}) => ({
  articleId: `s${n}`,
  isNews: true,
  aboutRegion: true,
  score: 6,
  axis: 'region_completa',
  sensitive: [],
  reason: 'Obra vial para la comuna',
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  brandLaneConfig.enabled = true
  mockPrisma.$queryRaw.mockResolvedValue([{ lotes: 0, redacciones: 0 }])
})

describe('el carril solo suma (contrato)', () => {
  const SRC = readFileSync(path.resolve(__dirname, 'brandLane.ts'), 'utf8')

  it('nunca escribe en stories: ni por el cliente ni por SQL crudo', () => {
    expect(SRC).not.toMatch(/prisma\.story\.(update|updateMany|upsert|create|createMany|delete|deleteMany)\b/)
    expect(SRC).not.toMatch(/UPDATE\s+"?stories"?/i)
    expect(SRC).not.toMatch(/DELETE\s+FROM\s+"?stories"?/i)
    expect(SRC).not.toMatch(/\$executeRaw/)
  })

  it('de stories solo lee', () => {
    const usos = [...SRC.matchAll(/prisma\.story\.(\w+)/g)].map((m) => m[1])
    expect(usos.length).toBeGreaterThan(0)
    expect(new Set(usos)).toEqual(new Set(['findMany']))
  })
})

describe('aplicarJuicio', () => {
  const t = (item: Record<string, unknown>) => aplicarJuicio(ARAUCANIA, { tipo: 'territorial', item: respuesta(1, item) as never })

  it('Araucanía: noticia de la región con eje y nota sobre el umbral queda evaluada', () => {
    expect(t({})).toMatchObject({ admitted: true, state: 'evaluated', discardReason: null, brandScore: 6, axis: 'region_completa' })
  })

  it('Araucanía: un aviso, una nota de otra región o sin eje no se admiten', () => {
    expect(t({ isNews: false })).toMatchObject({ admitted: false, state: 'discarded', discardReason: 'not_admitted' })
    expect(t({ aboutRegion: false })).toMatchObject({ admitted: false, discardReason: 'not_admitted' })
    expect(t({ axis: null })).toMatchObject({ admitted: false, discardReason: 'not_admitted' })
    expect(t({ score: null })).toMatchObject({ admitted: false, discardReason: 'not_admitted' })
  })

  it('Araucanía: admitida bajo el umbral queda descartada por nota, no por admisión', () => {
    expect(t({ score: 4 })).toMatchObject({ admitted: true, state: 'discarded', discardReason: 'below_min' })
  })

  it('Mapuche: sin nota o sin eje es error de juicio, no una nota baja', () => {
    const m = (item: Record<string, unknown>) =>
      aplicarJuicio({ relevanceMin: 7, criterion: 'escala_mapuche' }, {
        tipo: 'mapuche',
        item: { articleId: 's1', score: 8, axis: 'lengua', place: 'gulumapu', sensitive: [], reason: 'Taller de lengua', ...item } as never,
      })
    expect(m({})).toMatchObject({ admitted: true, state: 'evaluated', place: 'gulumapu' })
    expect(m({ score: null })).toMatchObject({ state: 'discarded', discardReason: 'error' })
    expect(m({ axis: null })).toMatchObject({ state: 'discarded', discardReason: 'error' })
  })

  it('las banderas del juez se guardan tal cual', () => {
    expect(t({ sensitive: ['victimas', 'violencia'] }).sensitiveFlagsJudge).toEqual(['victimas', 'violencia'])
  })
})

describe('motivoSeguro', () => {
  it('no guarda nombres de personas', () => {
    expect(motivoSeguro('La dirigenta Jeny Parra denuncia falta de consulta')).toBe(MOTIVO_GENERICO)
  })
  it('recorta a 20 palabras (diseño, sección 3) y deja pasar lugares', () => {
    const largo = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(' ')
    expect(motivoSeguro(largo)?.split(' ')).toHaveLength(20)
    expect(motivoSeguro('Obra en Padre Las Casas')).toBe('Obra en Padre Las Casas')
    expect(motivoSeguro(null)).toBeNull()
  })
})

describe('juzgarPendientes: candados de costo', () => {
  it('sin pautas no llama al modelo ni lee la base', async () => {
    expect(await juzgarPendientes({ ...ARAUCANIA, guidelines: '  ' }, AHORA)).toBe(0)
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('con el tope del día alcanzado en la base, no llama', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ lotes: 18n, redacciones: 2n }])
    expect(await juzgarPendientes(ARAUCANIA, AHORA)).toBe(0)
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockPrisma.storyBrandAssessment.findMany).not.toHaveBeenCalled()
  })

  it('no pide más pendientes que las que caben en las llamadas que quedan', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ lotes: 19, redacciones: 0 }])
    mockPrisma.storyBrandAssessment.findMany.mockResolvedValue(Array.from({ length: TAMANO_LOTE }, (_, i) => pendiente(i)))
    mockInvoke.mockResolvedValue({ articles: Array.from({ length: TAMANO_LOTE }, (_, i) => respuesta(i)) })
    expect(await juzgarPendientes(ARAUCANIA, AHORA)).toBe(1)
    expect(mockPrisma.storyBrandAssessment.findMany.mock.calls[0][0]).toMatchObject({ take: TAMANO_LOTE, where: { attempts: { lt: 2 } } })
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('el lote lleva sus ocho artículos completos (el formateador común perdía el último)', async () => {
    mockPrisma.storyBrandAssessment.findMany.mockResolvedValue(Array.from({ length: TAMANO_LOTE }, (_, i) => pendiente(i)))
    mockInvoke.mockResolvedValue({ articles: [] })
    await juzgarPendientes(ARAUCANIA, AHORA)
    const prompt = mockInvoke.mock.calls[0][0][0].content as string
    for (let i = 0; i < TAMANO_LOTE; i++) expect(prompt).toContain(`Article ID: s${i}`)
    expect(prompt).toContain(ARAUCANIA.guidelines)
  })
})

describe('juzgarPendientes: lo que se escribe', () => {
  it('una respuesta por nota; la que falta suma un intento y al segundo queda descartada', async () => {
    mockPrisma.storyBrandAssessment.findMany.mockResolvedValue([pendiente(1), pendiente(2), pendiente(3, 1)])
    mockInvoke.mockResolvedValue({ articles: [respuesta(1), respuesta(2, { score: 3 })] })
    await juzgarPendientes(ARAUCANIA, AHORA)
    const porId = Object.fromEntries(mockPrisma.storyBrandAssessment.update.mock.calls.map((c) => [c[0].where.id, c[0].data]))
    expect(porId.a1).toMatchObject({ state: 'evaluated', admitted: true, attempts: 1, guidelinesVersion: 1, lastError: null })
    expect(porId.a2).toMatchObject({ state: 'discarded', discardReason: 'below_min', attempts: 1 })
    expect(porId.a3).toMatchObject({ state: 'discarded', discardReason: 'error', attempts: 2 })
    expect(porId.a1.batchId).toBe(porId.a3.batchId)
  })

  it('si el modelo falla, ninguna nota se marca juzgada: suman un intento y guardan el error', async () => {
    mockPrisma.storyBrandAssessment.findMany.mockResolvedValue([pendiente(1), pendiente(2)])
    mockInvoke.mockRejectedValue(new Error('429 rate limit'))
    await juzgarPendientes(ARAUCANIA, AHORA)
    for (const [arg] of mockPrisma.storyBrandAssessment.update.mock.calls) {
      expect(arg.data).toMatchObject({ attempts: 1, lastError: '429 rate limit' })
      expect(arg.data.state).toBeUndefined()
    }
  })

  it('un campo inválido en una nota no hunde a las otras del lote', async () => {
    mockPrisma.storyBrandAssessment.findMany.mockResolvedValue([pendiente(1), pendiente(2)])
    mockInvoke.mockResolvedValue({ articles: [respuesta(1, { axis: 'eje_inventado' }), respuesta(2)] })
    await juzgarPendientes(ARAUCANIA, AHORA)
    const porId = Object.fromEntries(mockPrisma.storyBrandAssessment.update.mock.calls.map((c) => [c[0].where.id, c[0].data]))
    expect(porId.a1).toMatchObject({ state: 'discarded', discardReason: 'not_admitted', axis: null })
    expect(porId.a2).toMatchObject({ state: 'evaluated' })
  })
})

describe('seleccionarTerritorial', () => {
  it('marca elegidas con la regla del día y toma la primera comuna nombrada', async () => {
    const fila = (id: string, brandScore: number, axis: string, comuna: string) => ({ id, brandScore, axis, matchedTerms: [comuna, 'Temuco'], brandDate: AHORA })
    mockPrisma.storyBrandAssessment.findMany
      .mockResolvedValueOnce([
        fila('r1', 6, 'region_completa', 'Angol'),
        fila('r2', 6, 'region_completa', 'Angol'),
        fila('r3', 5, 'region_completa', 'Pucón'),
        fila('m1', 8, 'mapuche_chileno', 'Ercilla'),
      ])
      .mockResolvedValueOnce([{ axis: 'mapuche_chileno', matchedTerms: ['Lumaco'] }])
    const ids = await seleccionarTerritorial(ARAUCANIA, AHORA)
    // m1 no entra: ya hubo una «mapuche y chileno» hoy. r2 cede ante r3: no se repite Angol si hay otra comuna.
    expect(ids).toEqual(['r1', 'r3'])
    expect(mockPrisma.storyBrandAssessment.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['r1', 'r3'] } }, data: { state: 'selected', selectedAt: AHORA } })
  })

  it('sin alternativa de otra comuna, la repite antes de dejar el cupo vacío', async () => {
    const fila = (id: string, comuna: string) => ({ id, brandScore: 6, axis: 'region_completa', matchedTerms: [comuna], brandDate: AHORA })
    mockPrisma.storyBrandAssessment.findMany.mockResolvedValueOnce([fila('r1', 'Angol'), fila('r2', 'Angol')]).mockResolvedValueOnce([])
    expect(await seleccionarTerritorial(ARAUCANIA, AHORA)).toEqual(['r1', 'r2'])
  })
})

describe('runBrandLaneOnce', () => {
  it('con D5_ENABLED apagado no hace nada: ni lee los criterios', async () => {
    brandLaneConfig.enabled = false
    expect(await runBrandLaneOnce(AHORA)).toEqual([])
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('sin la tabla (migración no aplicada) no falla: ninguna marca', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('relation "community_brand_criteria" does not exist'))
    expect(await runBrandLaneOnce(AHORA)).toEqual([])
  })
})

describe('rescate de Voces Mapuche: prioridad a los ejes en déficit', () => {
  const d = (h: number) => new Date(AHORA.getTime() - h * 3_600_000)
  const e = (id: string, axis: string | null, brandScore: number, horas = 1) => ({ id, axis, brandScore, brandDate: d(horas) })

  it('el eje menos mostrado en 30 días va primero, aunque puntúe menos', () => {
    const cuentas = new Map([['protagonismo', 9], ['lengua', 0], ['economia_propia', 2]])
    const orden = ordenarRescate([e('p', 'protagonismo', 9), e('l', 'lengua', 7), e('x', 'economia_propia', 8)], cuentas)
    expect(orden.map((r) => r.id)).toEqual(['l', 'x', 'p'])
  })

  it('a igual déficit decide la nota y, a igual nota, la más reciente; sin eje va al final', () => {
    const orden = ordenarRescate([e('viejo', 'saber', 8, 30), e('nuevo', 'saber', 8, 2), e('alto', 'saber', 9), e('sin', null, 10)], new Map())
    expect(orden.map((r) => r.id)).toEqual(['alto', 'nuevo', 'viejo', 'sin'])
  })

  it('respeta el cupo del día y marca elegidas', async () => {
    mockPrisma.storyBrandAssessment.count.mockResolvedValue(1)
    mockPrisma.storyBrandAssessment.findMany.mockResolvedValue([e('p', 'protagonismo', 9), e('l', 'lengua', 7)])
    mockPrisma.$queryRaw.mockResolvedValue([{ axis: 'protagonismo', n: 5n }])
    const mapuche = { ...ARAUCANIA, communityId: 'c-mapu', slug: 'mapuche', criterion: 'escala_mapuche' as const, relevanceMin: 7, dailyTarget: 2 }
    expect(await seleccionarRescate(mapuche, AHORA)).toEqual(['l'])
    expect(mockPrisma.storyBrandAssessment.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['l'] } }, data: { state: 'selected', selectedAt: AHORA } })
  })

  it('con el cupo lleno no lee ni marca nada', async () => {
    mockPrisma.storyBrandAssessment.count.mockResolvedValue(2)
    const mapuche = { ...ARAUCANIA, criterion: 'escala_mapuche' as const, dailyTarget: 2 }
    expect(await seleccionarRescate(mapuche, AHORA)).toEqual([])
    expect(mockPrisma.storyBrandAssessment.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.storyBrandAssessment.updateMany).not.toHaveBeenCalled()
  })
})

describe('alerta de 24 horas sin candidatas (diseño, sección 8)', () => {
  it('avisa si nunca hubo candidatas o la última tiene más de 24 horas', async () => {
    mockPrisma.storyBrandAssessment.findFirst.mockResolvedValueOnce(null)
    expect(await sinCandidatasRecientes('c', AHORA)).toBe(true)
    mockPrisma.storyBrandAssessment.findFirst.mockResolvedValueOnce({ createdAt: new Date(AHORA.getTime() - 25 * 3_600_000) })
    expect(await sinCandidatasRecientes('c', AHORA)).toBe(true)
  })
  it('no avisa si hubo una en las últimas 24 horas', async () => {
    mockPrisma.storyBrandAssessment.findFirst.mockResolvedValueOnce({ createdAt: new Date(AHORA.getTime() - 23 * 3_600_000) })
    expect(await sinCandidatasRecientes('c', AHORA)).toBe(false)
  })
})

describe('candado del dato sensible en el prompt', () => {
  const art = [{ id: 's1', title: 't', content: 'c' }]
  it('el eje mapuche y chileno exige que la nota declare la relación, y ninguna pauta lo quita', () => {
    const p = buildTerritorialPrompt('', art)
    expect(p).toContain('Nunca por el apellido de alguien')
    expect(p).toContain('<REGLA_DEL_EJE_MAPUCHE_CHILENO>')
  })
  it('las dos marcas prohíben inferir la pertenencia de una persona y nombrar personas en el motivo', () => {
    for (const p of [buildTerritorialPrompt('x', art), buildMapuchePrompt('x', art)]) {
      expect(p).toContain('No se infiere la pertenencia de nadie a un pueblo por su apellido')
      expect(p).toContain('El motivo no nombra a personas.')
    }
  })
})

describe('vocabulario de lugar de Voces Mapuche', () => {
  it('lo urbano es un eje y no un lugar (diseño, sección 5): un «urbano» del modelo cae a null', async () => {
    const { brandMapucheItemSchema, LUGARES_MAPUCHE, EJES_MAPUCHE } = await import('../schemas/brandLane.js')
    expect(LUGARES_MAPUCHE).not.toContain('urbano')
    expect(EJES_MAPUCHE).toContain('vida_urbana')
    const r = brandMapucheItemSchema.parse({ articleId: 's1', score: 7, axis: 'vida_urbana', place: 'urbano', sensitive: [], reason: 'x' })
    expect(r).toMatchObject({ axis: 'vida_urbana', place: null })
  })
})
