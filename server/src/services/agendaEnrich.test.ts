import { describe, it, expect, vi, beforeEach } from 'vitest'

// ──── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  agendaItem: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('./llm.js', () => ({
  getSmallLLM: () => ({ withStructuredOutput: () => ({ invoke: mockInvoke }) }),
  rateLimitDelay: vi.fn(),
}))

const mockExtract = vi.hoisted(() => vi.fn())
vi.mock('./extractor.js', () => ({ extractContent: mockExtract }))

vi.mock('../prompts/agenda.js', () => ({
  buildExtractAgendaPrompt: () => 'extract-prompt',
  buildTranslateAgendaPrompt: () => 'translate-prompt',
}))

vi.mock('../config.js', () => ({
  config: { agenda: { enrichDateLimit: 20, enrichTranslateLimit: 20, enrichContentMaxChars: 6000 } },
}))

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const { enrichAgendaItems } = await import('./agendaEnrich.js')

// ──── Tests ──────────────────────────────────────────────────────────────────

describe('enrichAgendaItems — date extraction (pass A)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fills dueDate and marks sys:llm-dated for an undated call', async () => {
    mockPrisma.agendaItem.findMany
      .mockResolvedValueOnce([
        { id: 'a', title: 'Call X', sourceUrl: 'https://x/1', type: 'convocatoria', summary: null, location: null, startDate: null, endDate: null, extractionScore: 0.3 },
      ]) // date pass
      .mockResolvedValueOnce([]) // translate pass
    mockExtract.mockResolvedValueOnce({ title: null, content: 'deadline 30 September 2026', datePublished: null, method: 'readability' })
    mockInvoke.mockResolvedValueOnce({ dueDate: '2026-09-30', startDate: null, endDate: null, type: 'convocatoria', location: null, summary: 'Resumen', confidence: 0.9 })

    const result = await enrichAgendaItems()

    expect(result.dated).toBe(1)
    expect(mockPrisma.agendaItem.update).toHaveBeenCalledTimes(1)
    const arg = mockPrisma.agendaItem.update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'a' })
    expect(arg.data.dueDate.toISOString()).toBe('2026-09-30T23:59:59.000Z')
    expect(arg.data.tags).toEqual({ push: 'sys:llm-dated' })
    expect(arg.data.extractionScore).toBe(0.9)
  })

  it('marks tried (no infinite retry / no LLM) when the fetch returns no content', async () => {
    mockPrisma.agendaItem.findMany
      .mockResolvedValueOnce([{ id: 'a', title: 'Call X', sourceUrl: 'https://x/1', type: 'convocatoria', summary: null, location: null, startDate: null, endDate: null, extractionScore: 0.3 }])
      .mockResolvedValueOnce([])
    mockExtract.mockResolvedValueOnce(null)

    const result = await enrichAgendaItems()

    expect(result.failed).toBe(1)
    expect(result.dated).toBe(0)
    expect(mockInvoke).not.toHaveBeenCalled()
    const arg = mockPrisma.agendaItem.update.mock.calls[0][0]
    expect(arg.data.tags).toEqual({ push: 'sys:llm-dated' }) // tried once, won't loop
    expect(arg.data.dueDate).toBeUndefined()
  })
})

describe('enrichAgendaItems — translation (pass B)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('translates a non-Spanish title and keeps the original', async () => {
    mockPrisma.agendaItem.findMany
      .mockResolvedValueOnce([]) // date pass
      .mockResolvedValueOnce([{ id: 'b', title: 'International Day of Indigenous Women', summary: null }]) // translate pass
    mockInvoke.mockResolvedValueOnce({ isSpanish: false, titleEs: 'Día Internacional de las Mujeres Indígenas', summaryEs: null })

    const result = await enrichAgendaItems()

    expect(result.translated).toBe(1)
    const arg = mockPrisma.agendaItem.update.mock.calls[0][0]
    expect(arg.data.titleOriginal).toBe('International Day of Indigenous Women')
    expect(arg.data.title).toBe('Día Internacional de las Mujeres Indígenas')
    expect(arg.data.tags).toEqual({ push: 'sys:llm-translated' })
  })

  it('marks an already-Spanish item via the LLM without touching the title', async () => {
    mockPrisma.agendaItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'c', title: 'Diplomado en lingüística indígena', summary: null }])
    mockInvoke.mockResolvedValueOnce({ isSpanish: true, titleEs: 'Diplomado en lingüística indígena', summaryEs: null })

    const result = await enrichAgendaItems()

    expect(result.translated).toBe(0)
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    const arg = mockPrisma.agendaItem.update.mock.calls[0][0]
    expect(arg.data.tags).toEqual({ push: 'sys:llm-translated' })
    expect(arg.data.titleOriginal).toBeUndefined()
  })
})
