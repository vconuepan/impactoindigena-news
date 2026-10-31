import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  story: { findUnique: vi.fn() },
  storyBody: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}))
const mockInvoke = vi.hoisted(() => vi.fn())
const mockConfig = vi.hoisted(() => ({
  storyBody: { enabled: true, modelTier: 'medium', minSourceChars: 1200, maxSourceChars: 15000 },
  llm: { provider: 'azure', azure: { deployments: { medium: 'gpt-4.1-mini' } } },
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../config.js', () => ({ config: mockConfig }))
vi.mock('./llm.js', () => ({
  getLLMByTier: vi.fn(() => ({ withStructuredOutput: vi.fn(() => ({ invoke: mockInvoke })) })),
  rateLimitDelay: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/retry.js', () => ({ withRetry: vi.fn((fn: () => Promise<unknown>) => fn()) }))
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const { draftStoryBody, draftStoryBodies, updateStoryBody, StoryBodyError } = await import('./storyBody.js')

// Fragmento del original de Resumen Latinoamericano con que se midió la nota
// con claves el 25-oct-2026, alargado hasta superar el mínimo de 1.200.
const ORIGINAL = (
  'La Cámara de Diputados aprobó el proyecto de Ley de Inviolabilidad de la Propiedad Privada, que facilita los desalojos y restringe las expropiaciones. ' +
  'La iniciativa oficialista recogió 124 votos afirmativos, 119 negativos y seis abstenciones y deberá regresar a la Cámara Alta para su revisión. ' +
  '“Las comunidades van a resistir”, sostiene Orlando Carriqueo, referente del Parlamento Mapuche Tehuelche de Río Negro. ' +
  'El 10 de diciembre de 2024, el presidente Javier Milei derogó la Ley 26.160, que prohibía de manera transitoria los desalojos de las tierras comunitarias. '
).repeat(4)

const cuerpoFiel = {
  bajada: 'Las comunidades mapuche de Río Negro enfrentan una ley que facilita los desalojos, aprobada por la Cámara de Diputados y pendiente en el Senado.',
  quePaso: 'La Cámara aprobó el proyecto con 124 votos a favor y 119 en contra. Orlando Carriqueo, del Parlamento Mapuche Tehuelche, dijo que «Las comunidades van a resistir». El proyecto acorta los juicios de desalojo y encarece las expropiaciones, y vuelve al Senado con cambios.',
  porQueImporta: 'La ley cambia el procedimiento con que un juez puede ordenar el desalojo de una comunidad que disputa su tierra, y encarece la expropiación con que el Estado podría resolver esa disputa.',
  contexto: 'En 2024 el Gobierno derogó la ley de emergencia territorial que suspendía los desalojos de comunidades, según recuerda Carriqueo.',
  queSigue: 'El proyecto vuelve al Senado, que debe revisar los cambios antes de que pueda convertirse en ley.',
}

function story(parcial: Record<string, unknown> = {}) {
  return {
    id: 's1',
    sourceTitle: 'Nación Mapuche. La ley de inviolabilidad…',
    sourceContent: ORIGINAL,
    sourceUrl: 'https://www.resumenlatinoamericano.org/2026/10/23/nota',
    sourceDatePublished: new Date('2026-10-23T00:00:00Z'),
    datePublished: new Date('2026-10-25T11:00:00Z'),
    dateCrawled: new Date('2026-10-25T03:00:00Z'),
    feed: { title: 'Google News — Búsqueda Indígena', displayTitle: 'Google News' },
    ...parcial,
  }
}

describe('draftStoryBody', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.storyBody.enabled = true
    mockPrisma.storyBody.upsert.mockResolvedValue({})
  })

  it('redacta desde el original, pasa los candados y guarda con método ia_sin_revision y su costo', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(story())
    mockInvoke.mockResolvedValue({ raw: { usage_metadata: { input_tokens: 3200, output_tokens: 450 } }, parsed: cuerpoFiel })

    const r = await draftStoryBody('s1')

    expect(r.outcome).toBe('saved')
    const { create } = mockPrisma.storyBody.upsert.mock.calls[0][0]
    expect(create).toMatchObject({ storyId: 's1', method: 'ia_sin_revision', reviewedBy: '', model: 'gpt-4.1-mini', inputTokens: 3200, outputTokens: 450 })
    expect(create.bajadaEn).toBeNull()
  })

  it('falla cerrado: una cifra que el original no da bloquea y no se escribe nada', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(story())
    mockInvoke.mockResolvedValue({ raw: {}, parsed: { ...cuerpoFiel, contexto: 'La obra se modificó en 2019.' } })

    const r = await draftStoryBody('s1')

    expect(r.outcome).toBe('blocked')
    expect(r.outcome === 'blocked' && r.avisos.map((a) => a.tipo)).toContain('cifra')
    expect(mockPrisma.storyBody.upsert).not.toHaveBeenCalled()
  })

  it('un año posterior al de la noticia bloquea aunque el original lo traiga (errata de la fuente)', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(story({ sourceContent: ORIGINAL + ' Resumen Latinoamericano, 23 de octubre de 2027' }))
    mockInvoke.mockResolvedValue({ raw: {}, parsed: { ...cuerpoFiel, bajada: 'Las comunidades enfrentan la ley aprobada en octubre de 2027.' } })
    const r = await draftStoryBody('s1')
    expect(r.outcome).toBe('blocked')
  })

  it('limpia antes de revisar: una cita traducida pierde las comillas y un queSigue meta queda vacío', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(story())
    mockInvoke.mockResolvedValue({
      raw: {},
      parsed: {
        ...cuerpoFiel,
        quePaso: 'Carriqueo advirtió: "Las comunidades resistirán hasta el final". El proyecto vuelve al Senado.',
        queSigue: 'El artículo no menciona pasos futuros.',
      },
    })
    const r = await draftStoryBody('s1')
    expect(r.outcome).toBe('saved')
    const { create } = mockPrisma.storyBody.upsert.mock.calls[0][0]
    expect(create.quePaso).not.toContain('"')
    expect(create.queSigue).toBe('')
  })

  it('no llama al modelo con Google News, con un original corto ni apagado', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(story({ sourceUrl: 'https://news.google.com/rss/articles/x' }))
    expect((await draftStoryBody('s1')).outcome).toBe('skipped')
    mockPrisma.story.findUnique.mockResolvedValue(story({ sourceContent: 'Solo la bajada del feed.' }))
    expect((await draftStoryBody('s1')).outcome).toBe('skipped')
    mockConfig.storyBody.enabled = false
    mockPrisma.story.findUnique.mockResolvedValue(story())
    expect((await draftStoryBody('s1')).outcome).toBe('skipped')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('tolera que la tabla no exista todavía', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(story())
    mockInvoke.mockResolvedValue({ raw: {}, parsed: cuerpoFiel })
    mockPrisma.storyBody.upsert.mockRejectedValue(Object.assign(new Error('table does not exist'), { code: 'P2021' }))
    const r = await draftStoryBody('s1')
    expect(r.outcome).toBe('skipped')
  })

  it('el lote cuenta y nunca lanza', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(story()).mockRejectedValueOnce(new Error('caída'))
    mockInvoke.mockResolvedValue({ raw: {}, parsed: cuerpoFiel })
    const cuenta = await draftStoryBodies(['s1', 's2'])
    expect(cuenta).toEqual({ saved: 1, blocked: 0, skipped: 0, failed: 1 })
  })
})

describe('updateStoryBody', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.storyBody.findUnique.mockResolvedValue({ storyId: 's1', ...cuerpoFiel, method: 'ia_sin_revision', reviewedBy: '' })
    mockPrisma.story.findUnique.mockResolvedValue({ sourceContent: ORIGINAL, sourceDatePublished: new Date('2026-10-23'), datePublished: null, dateCrawled: new Date('2026-10-25') })
    mockPrisma.storyBody.update.mockResolvedValue({})
  })

  it('dar por revisada sube el método a ia_revisada con quién lo hizo', async () => {
    await updateStoryBody('s1', { reviewedBy: 'Venancio Coñuepán Mesías' })
    expect(mockPrisma.storyBody.update.mock.calls[0][0].data).toMatchObject({ method: 'ia_revisada', reviewedBy: 'Venancio Coñuepán Mesías' })
    expect(mockPrisma.storyBody.update.mock.calls[0][0].data.quePasoEn).toBeUndefined()
  })

  it('editar el texto borra la traducción vieja y pasa por los candados', async () => {
    await updateStoryBody('s1', { queSigue: 'El Senado revisa los cambios antes de votar, y las organizaciones mapuche convocan a presionar a los senadores.' })
    const data = mockPrisma.storyBody.update.mock.calls[0][0].data
    expect(data.quePasoEn).toBeNull()
    expect(data.method).toBe('ia_revisada')
  })

  it('una edición que inventa una cifra no se guarda', async () => {
    await expect(updateStoryBody('s1', { contexto: 'Afecta a 300 familias.' })).rejects.toBeInstanceOf(StoryBodyError)
    expect(mockPrisma.storyBody.update).not.toHaveBeenCalled()
  })
})
