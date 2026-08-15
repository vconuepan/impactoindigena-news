import { describe, it, expect, vi, beforeEach } from 'vitest'

// ──── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  story: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('./llm.js', () => ({
  getSmallLLM: () => ({ withStructuredOutput: () => ({ invoke: mockInvoke }) }),
  rateLimitDelay: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const { translateStory } = await import('./translation.js')

const STORY = {
  id: 's1',
  titleLabel: 'conflicto territorial',
  title: 'canadá avanzó en reclamación de tierras',
  summary: 'Resumen en español.',
  quote: 'Una cita.',
  marketingBlurb: 'Un blurb.',
  relevanceSummary: 'Por qué importa.',
}

// ──── Tests ──────────────────────────────────────────────────────────────────

describe('translateStory — guardarrail de capitalizacion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normaliza siglas y toponimos en el titulo traducido', async () => {
    // El traductor es un LLM distinto del que arma el titulo en español, y
    // comete el mismo error. Hasta el 15-ago-2026 estos dos campos se
    // persistian tal cual venian del modelo.
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce({
      titleLabel: 'mapuche land claim',
      title: 'canada advanced land claims in mozambique and peru',
      summary: 'English summary.',
      quote: 'A quote.',
      marketingBlurb: 'A blurb.',
      relevanceSummary: 'Why it matters.',
    })

    await translateStory('s1')

    const data = mockPrisma.story.update.mock.calls[0][0].data
    expect(data.titleEn).toBe('Canada advanced land claims in Mozambique and Peru')
    expect(data.titleLabelEn).toBe('Mapuche land claim')
  })

  it('no toca los campos largos, que no llevan guardarrail', async () => {
    // Deliberado: el guardarrail existe para titulos. Aplicarlo a un resumen
    // completo multiplicaria el riesgo de tocar texto legitimo.
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce({
      titleLabel: 'land claim',
      title: 'a clean title',
      summary: 'a summary mentioning chile in lowercase',
      quote: 'a quote',
      marketingBlurb: 'a blurb',
      relevanceSummary: 'why it matters',
    })

    await translateStory('s1')

    const data = mockPrisma.story.update.mock.calls[0][0].data
    expect(data.summaryEn).toBe('a summary mentioning chile in lowercase')
  })

  it('deja los titulos en null si el modelo devuelve vacio', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce({
      titleLabel: '',
      title: '',
      summary: 'English summary.',
      quote: 'A quote.',
      marketingBlurb: 'A blurb.',
      relevanceSummary: 'Why it matters.',
    })

    await translateStory('s1')

    const data = mockPrisma.story.update.mock.calls[0][0].data
    expect(data.titleEn).toBeNull()
    expect(data.titleLabelEn).toBeNull()
  })
})
