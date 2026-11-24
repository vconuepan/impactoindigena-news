import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SystemMessage } from '@langchain/core/messages'
import { OutputParserException } from '@langchain/core/output_parsers'

// ──── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  story: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
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

const { translateStory, translateStoriesBatch, translateRecentUntranslated, isUntranslated, TranslationUnchangedError } =
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

  it('rechaza la respuesta y NO escribe nada si titulo y resumen vuelven identicos al español', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce({ ...TRADUCIDA, titleEn: STORY.title, summaryEn: STORY.summary })

    const err = await translateStory('s1').catch(e => e)
    expect(err).toBeInstanceOf(TranslationUnchangedError)
    // El error nombra los dos campos: el backfill lo imprime por noticia.
    expect((err as TranslationUnchangedError).fields).toEqual(['title', 'summary'])
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })

  it('rechaza si el resumen vuelve identico aunque el titulo este traducido: el resumen decide', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce({ ...TRADUCIDA, summaryEn: STORY.summary })

    await expect(translateStory('s1')).rejects.toThrow(/summary/)
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })

  it('escribe todo si solo el titulo vuelve identico: «Tapati Rapa Nui 2026» se llama igual en los dos idiomas', async () => {
    // Hasta el 20-oct-2026 un titulo identico hundia la nota entera y no se
    // escribia ni el resumen traducido. Dos o tres oraciones de resumen nunca
    // son legitimamente identicas; un titulo de nombres propios, si.
    mockPrisma.story.findUnique.mockResolvedValueOnce({ ...STORY, title: 'Tapati Rapa Nui 2026' })
    mockInvoke.mockResolvedValueOnce({ ...TRADUCIDA, titleEn: 'Tapati Rapa Nui 2026' })

    await translateStory('s1')

    expect(mockPrisma.story.update).toHaveBeenCalledTimes(1)
    const data = mockPrisma.story.update.mock.calls[0][0].data
    expect(data.titleEn).toBe('Tapati Rapa Nui 2026')
    expect(data.summaryEn).toBe('English summary.')
    expect(data.quoteEn).toBe('A quote.')
  })

  it('la comparacion ignora mayusculas y espacios, porque el guardarrail de capitalizacion los cambia', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce({ ...TRADUCIDA, summaryEn: `  ${STORY.summary.toUpperCase()}  ` })

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
      .mockResolvedValueOnce({ ...TRADUCIDA, summaryEn: STORY.summary })
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

// 23-nov-2026: con Claude, 3 de 30 traducciones llegaron con etiquetas sueltas
// dentro del JSON y LangChain lanzó OutputParserException. Antes no había
// reintento y la noticia quedaba sin inglés.
describe('translateStory — reintento ante respuesta fuera de esquema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  const jsonRoto = () => new OutputParserException('Failed to parse. Text: "{ \"summaryEn\": \"...</summaryEn>\n<parameter name=\\\"quoteEn\\\">" }"')

  it('reintenta cuando el modelo devuelve un JSON roto y escribe la traducción', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockRejectedValueOnce(jsonRoto()).mockResolvedValueOnce(TRADUCIDA)

    const corrida = translateStory('s1')
    await vi.runAllTimersAsync()
    await corrida

    expect(mockInvoke).toHaveBeenCalledTimes(2)
    expect(mockPrisma.story.update).toHaveBeenCalledTimes(1)
  })

  it('se rinde tras dos reintentos y no escribe nada', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockRejectedValue(jsonRoto())

    const corrida = translateStory('s1').catch((e) => e)
    await vi.runAllTimersAsync()
    const error = await corrida

    expect(error).toBeInstanceOf(OutputParserException)
    expect(mockInvoke).toHaveBeenCalledTimes(3)
    expect(mockPrisma.story.update).not.toHaveBeenCalled()
  })

  it('un error que no es de red ni de esquema no se reintenta', async () => {
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockRejectedValueOnce(new Error('content filter'))

    await expect(translateStory('s1')).rejects.toThrow('content filter')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })
})

describe('translateRecentUntranslated — rescate de las que quedaron sin inglés', () => {
  beforeEach(() => vi.clearAllMocks())

  it('busca publicadas recientes sin titleEn, excluye las indicadas, ordena por relevancia y respeta el tope', async () => {
    mockPrisma.story.findMany.mockResolvedValueOnce([{ id: 's1' }])
    mockPrisma.story.findUnique.mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce(TRADUCIDA)
    const antes = Date.now()

    const r = await translateRecentUntranslated({ days: 3, limit: 10, exclude: ['nueva'] })

    const q = mockPrisma.story.findMany.mock.calls[0][0]
    expect(q.where.status).toBe('published')
    expect(q.where.titleEn).toBeNull()
    // Una noticia sin título nunca tendrá titleEn: si entrara, se retraduciría
    // en cada corrida de la ventana y se contaría como traducida.
    expect(q.where.AND).toEqual([{ title: { not: null } }, { title: { not: '' } }])
    expect(q.where.OR).toBeUndefined()
    expect(q.where.id).toEqual({ notIn: ['nueva'] })
    const desde = q.where.datePublished.gte.getTime()
    expect(antes - desde).toBeGreaterThanOrEqual(3 * 86400000 - 1000)
    expect(antes - desde).toBeLessThanOrEqual(3 * 86400000 + 1000)
    expect(q.take).toBe(10)
    expect(q.orderBy[0]).toEqual({ relevance: { sort: 'desc', nulls: 'last' } })
    expect(r).toEqual({ pending: 1, translated: 1, failed: 0 })
    expect(mockPrisma.story.update.mock.calls[0][0].data.titleEn).toBe('Canada advanced land claims')
  })

  it('una que vuelve a fallar se cuenta y no corta el resto', async () => {
    mockPrisma.story.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
    mockPrisma.story.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(STORY)
    mockInvoke.mockResolvedValueOnce(TRADUCIDA)
    const r = await translateRecentUntranslated({ days: 3, limit: 10 })
    expect(r).toEqual({ pending: 2, translated: 1, failed: 1 })
  })

  it('con días o tope en 0 está apagado y no consulta la base', async () => {
    expect(await translateRecentUntranslated({ days: 0, limit: 10 })).toEqual({ pending: 0, translated: 0, failed: 0 })
    expect(await translateRecentUntranslated({ days: 3, limit: 0 })).toEqual({ pending: 0, translated: 0, failed: 0 })
    expect(mockPrisma.story.findMany).not.toHaveBeenCalled()
  })

  it('un valor mal escrito en la variable (NaN) también lo apaga, sin consultar la base', async () => {
    expect(await translateRecentUntranslated({ days: NaN, limit: 10 })).toEqual({ pending: 0, translated: 0, failed: 0 })
    expect(await translateRecentUntranslated({ days: 3, limit: NaN })).toEqual({ pending: 0, translated: 0, failed: 0 })
    expect(mockPrisma.story.findMany).not.toHaveBeenCalled()
  })

  it('sin pendientes no llama al modelo', async () => {
    mockPrisma.story.findMany.mockResolvedValueOnce([])
    const r = await translateRecentUntranslated({ days: 3, limit: 10 })
    expect(r).toEqual({ pending: 0, translated: 0, failed: 0 })
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})
