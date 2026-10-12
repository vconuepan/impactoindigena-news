import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SystemMessage } from '@langchain/core/messages'

// ──── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  story: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const mockInvoke = vi.hoisted(() => vi.fn())
const mockWithStructuredOutput = vi.hoisted(() => vi.fn(() => ({ invoke: mockInvoke })))
vi.mock('./llm.js', () => ({
  getSmallLLM: () => ({ withStructuredOutput: mockWithStructuredOutput }),
  rateLimitDelay: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const { translateStory, translateStoriesBatch, isUntranslated, TranslationUnchangedError } =
  await import('./translation.js')

const STORY = {
  id: 's1',
  titleLabel: 'conflicto territorial',
  title: 'canadá avanzó en reclamación de tierras',
  summary: 'Resumen en español.',
  quote: 'Una cita.',
  marketingBlurb: 'Un blurb.',
  relevanceSummary: 'Por qué importa.',
}

const TRADUCIDA = {
  titleLabelEn: 'land claim',
  titleEn: 'Canada advanced land claims',
  summaryEn: 'English summary.',
  quoteEn: 'A quote.',
  marketingBlurbEn: 'A blurb.',
  relevanceSummaryEn: 'Why it matters.',
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
      ...TRADUCIDA,
      titleLabelEn: 'mapuche land claim',
      titleEn: 'canada advanced land claims in mozambique and peru',
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
      ...TRADUCIDA,
      summaryEn: 'a summary mentioning chile in lowercase',
    })

    await translateStory('s1')

    const data = mockPrisma.story.update.mock.calls[0][0].data
    expect(data.summaryEn).toBe('a summary mentioning chile in lowercase')
  })

  it('deja los titulos en null si el modelo devuelve vacio', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce({ ...TRADUCIDA, titleLabelEn: '', titleEn: '' })

    await translateStory('s1')

    const data = mockPrisma.story.update.mock.calls[0][0].data
    expect(data.titleEn).toBeNull()
    expect(data.titleLabelEn).toBeNull()
  })
})

describe('translateStory — el ingles no puede ser una copia del español', () => {
  // Del 10-may al 12-oct-2026, 3131 de 3958 noticias publicadas tenian el
  // titulo "en ingles" identico al castellano: el esquema pedia los campos con
  // el mismo nombre que la entrada y el modelo los rellenaba copiando. Estos
  // tests fijan las dos defensas: nombres distintos y comprobacion al escribir.
  beforeEach(() => vi.clearAllMocks())

  it('los campos de salida NO se llaman como los de entrada, y el metodo sigue siendo functionCalling', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce(TRADUCIDA)

    await translateStory('s1')

    const [schema, options] = mockWithStructuredOutput.mock.calls[0] as unknown as [{ shape: object }, { method: string }]
    const salida = Object.keys(schema.shape)
    expect(salida).toEqual(['titleLabelEn', 'titleEn', 'summaryEn', 'quoteEn', 'marketingBlurbEn', 'relevanceSummaryEn'])
    for (const entrada of ['title', 'titleLabel', 'summary', 'quote', 'marketingBlurb', 'relevanceSummary']) {
      expect(salida).not.toContain(entrada)
    }
    // functionCalling se forzo en a1a2a73 por compatibilidad con Azure; el
    // arreglo no lo cambia, cambia lo que el modelo recibe.
    expect(options.method).toBe('functionCalling')
  })

  it('el traductor recibe su rol por mensaje de sistema, antes del contenido', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce(TRADUCIDA)

    await translateStory('s1')

    const mensajes = mockInvoke.mock.calls[0][0] as unknown[]
    expect(mensajes[0]).toBeInstanceOf(SystemMessage)
    expect(String((mensajes[0] as SystemMessage).content)).toMatch(/English/)
  })

  it('rechaza la respuesta y NO escribe nada si el titulo vuelve identico al español', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce({ ...TRADUCIDA, titleEn: STORY.title })

    await expect(translateStory('s1')).rejects.toBeInstanceOf(TranslationUnchangedError)
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })

  it('rechaza tambien si el resumen vuelve identico, aunque el titulo este traducido', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce({ ...TRADUCIDA, summaryEn: STORY.summary })

    await expect(translateStory('s1')).rejects.toThrow(/summary/)
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })

  it('la comparacion ignora mayusculas y espacios, porque el guardarrail de capitalizacion los cambia', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce({ ...TRADUCIDA, titleEn: `  ${STORY.title.toUpperCase()}  ` })

    await expect(translateStory('s1')).rejects.toBeInstanceOf(TranslationUnchangedError)
  })

  it('acepta un rotulo corto identico: "COP30" se escribe igual en los dos idiomas', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce({ ...STORY, titleLabel: 'COP30' })
    mockInvoke.mockResolvedValueOnce({ ...TRADUCIDA, titleLabelEn: 'COP30' })

    await translateStory('s1')

    expect(mockPrisma.story.update).toHaveBeenCalledTimes(1)
    expect(mockPrisma.story.update.mock.calls[0][0].data.titleLabelEn).toBe('COP30')
  })

  it('el lote cuenta la copia como fallo y sigue con la siguiente', async () => {
    mockPrisma.story.findUnique
      .mockResolvedValueOnce(STORY)
      .mockResolvedValueOnce({ ...STORY, id: 's2' })
    mockInvoke
      .mockResolvedValueOnce({ ...TRADUCIDA, titleEn: STORY.title })
      .mockResolvedValueOnce(TRADUCIDA)

    const r = await translateStoriesBatch(['s1', 's2'])

    expect(r).toEqual({ translated: 1, failed: 1 })
    expect(mockPrisma.story.update).toHaveBeenCalledTimes(1)
  })
})

describe('isUntranslated', () => {
  it('es falso cuando alguno de los dos esta vacio: no hay copia posible', () => {
    expect(isUntranslated('', '')).toBe(false)
    expect(isUntranslated(null, 'x')).toBe(false)
    expect(isUntranslated('x', null)).toBe(false)
  })

  it('es verdadero solo cuando el texto es el mismo salvo mayusculas y espacios', () => {
    expect(isUntranslated('Hola  mundo', 'hola mundo ')).toBe(true)
    expect(isUntranslated('Hola mundo', 'Hello world')).toBe(false)
  })
})
