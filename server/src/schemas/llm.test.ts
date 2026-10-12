import { describe, it, expect } from 'vitest'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import { assessResultSchema, extractQuoteAttributionSchema, extractTitleLabelSchema, preAssessResultSchema } from './llm.js'

describe('assessResultSchema', () => {
  const validResponse = {
    publicationDate: '2024-01-15 00:00:00',
    quote: '"Test quote" said Expert',
    quoteAttribution: 'Dr. Smith, University of Oxford',
    summary: 'Test summary with key information about the topic.',
    factors: ['- **Factor one:** Explanation.'],
    limitingFactors: ['- **Limiting factor:** Explanation.'],
    relevanceCalculation: ['- **Key factor:** 5'],
    relevanceRating: 7,
    relevanceSummary: 'Test relevance summary explaining the rating in sufficient detail.',
    titleLabel: 'Climate risk',
    relevanceTitle: 'New study reveals climate impact on coastal regions',
    marketingBlurb: 'Nature reports on a new study revealing significant climate impact.',
  }

  it('accepts valid complete response including quoteAttribution', () => {
    const result = assessResultSchema.safeParse(validResponse)
    expect(result.success).toBe(true)
  })

  it('rejects response missing required quoteAttribution', () => {
    const { quoteAttribution, ...incomplete } = validResponse
    const result = assessResultSchema.safeParse(incomplete)
    expect(result.success).toBe(false)
  })
})

describe('extractQuoteAttributionSchema', () => {
  it('accepts valid input', () => {
    const result = extractQuoteAttributionSchema.safeParse({
      quote: '"This is a test quote," said the expert.',
      quoteAttribution: 'Dr. Jane Doe, MIT Professor',
    })
    expect(result.success).toBe(true)
  })
})

describe('extractTitleLabelSchema', () => {
  it('accepts valid input', () => {
    const result = extractTitleLabelSchema.safeParse({
      titleLabel: 'EU AI Act',
      title: 'Whistleblower channel could shape AI Act enforcement',
    })
    expect(result.success).toBe(true)
  })
})

describe('terminology guardrail in title guidance', () => {
  // Regression: a published title turned "jóvenes… en La Araucanía" into
  // "jóvenes araucanos" — a colonial exonym absent from the source. Both
  // title-generating schemas must instruct the model against it.
  it('assess relevanceTitle forbids "araucano" as demonym and unstated ethnicity', () => {
    const desc = assessResultSchema.shape.relevanceTitle.description ?? ''
    expect(desc).toContain('araucano')
    expect(desc).toContain('exónimo colonial')
    expect(desc).toContain('no atribuyas pertenencia étnica')
    expect(desc).toContain('de La Araucanía')
  })

  it('extractTitleLabelSchema title carries the same rule', () => {
    const desc = extractTitleLabelSchema.shape.title.description ?? ''
    expect(desc).toContain('araucano')
    expect(desc).toContain('exónimo colonial')
    expect(desc).toContain('no atribuyas pertenencia étnica')
    expect(desc).toContain('de La Araucanía')
  })
})

describe('capitalization guardrail in title guidance', () => {
  // Regresión: se publicaron "Estudio de ufal reveló…" y "Conadi y corfo
  // financian… en chile". La regla anterior decía solo "en minúsculas excepto
  // nombres propios" y el modelo no contaba las siglas como tales. El cliente
  // solo capitaliza la primera letra (`getHeadline`), así que nada corriente
  // abajo repara una sigla en minúsculas.
  const titleFields = [
    ['assessResultSchema.relevanceTitle', assessResultSchema.shape.relevanceTitle],
    ['assessResultSchema.titleLabel', assessResultSchema.shape.titleLabel],
    ['extractTitleLabelSchema.title', extractTitleLabelSchema.shape.title],
    ['extractTitleLabelSchema.titleLabel', extractTitleLabelSchema.shape.titleLabel],
  ] as const

  it.each(titleFields)('%s exige preservar siglas y topónimos', (_name, field) => {
    const desc = field.description ?? ''
    expect(desc).toContain('siglas y acrónimos')
    expect(desc).toContain('topónimos')
    expect(desc).toContain('CONADI')
    // El fallo concreto: capitalizar la sigla en vez de dejarla intacta.
    expect(desc).toContain("no 'conadi' ni 'Conadi'")
  })

  it.each(titleFields)('%s ya no usa la regla vaga anterior', (_name, field) => {
    const desc = field.description ?? ''
    expect(desc).not.toContain('en minúsculas excepto nombres propios')
  })

  it('el prompt de assess no reafirma la regla — el esquema es la fuente única', async () => {
    // .context/prompting.md: duplicar guías de formato hace que el modelo gaste
    // razonamiento reconciliándolas. La versión débil del prompt contradecía
    // la fuerte del esquema.
    const { buildAssessPrompt } = await import('../prompts/assess.js')
    const prompt = buildAssessPrompt('t', 'c', 'publisher', 'https://e.test/a', {
      factors: '',
      topicLimitingFactors: '',
      ratingGuidelines: '',
    } as never)
    expect(prompt).not.toContain('en minúsculas excepto nombres propios')
  })
})

describe('candado de los enums de clasificacion (preAssessResultSchema)', () => {
  // 12-oct-2026: 888 de 889 lotes caian porque UN articulo traia
  // `narrativeFrame: "calm"`, y los otros nueve volvian a la cola. El candado
  // corrige el valor al escribir y deja pasar el lote.
  const base = { articleId: 'a', issueSlug: 'derechos-indigenas', rating: 2, emotionTag: 'calm', country: '' }

  it('un encuadre invalido queda en null y no hunde el lote', () => {
    const parsed = preAssessResultSchema.parse({
      articles: [
        { ...base, articleId: 'a', narrativeFrame: 'calm' },
        { ...base, articleId: 'b', narrativeFrame: 'alianza' },
        { ...base, articleId: 'c', narrativeFrame: null },
      ],
    })
    expect(parsed.articles.map(a => a.narrativeFrame)).toEqual([null, 'alianza', null])
  })

  it('una emocion invalida cae al valor por defecto, calm', () => {
    const parsed = preAssessResultSchema.parse({
      articles: [{ ...base, emotionTag: 'confrontacion', narrativeFrame: 'protagonismo' }],
    })
    expect(parsed.articles[0].emotionTag).toBe('calm')
  })

  it('el rating sigue siendo estricto: sin rating, el lote falla', () => {
    const { rating, ...sinRating } = base
    expect(preAssessResultSchema.safeParse({ articles: [{ ...sinRating, narrativeFrame: 'alianza' }] }).success).toBe(false)
  })

  it('el modelo sigue viendo el enum completo, y null como opcion legal', () => {
    // Lo que LangChain manda como definicion de la funcion: el catch se
    // desenvuelve y el enum queda; nullable agrega null. Si esto cambiara,
    // el modelo dejaria de tener las opciones a la vista.
    const json: any = toJsonSchema(preAssessResultSchema)
    const frame = json.properties.articles.items.properties.narrativeFrame
    const variants = (frame.anyOf ?? [frame]).map((v: any) => v.enum ?? v.type)
    expect(variants).toContainEqual(['confrontacion', 'resiliencia', 'protagonismo', 'alianza'])
    expect(variants).toContainEqual('null')
    const emotion = json.properties.articles.items.properties.emotionTag
    expect(emotion.enum).toEqual(['uplifting', 'frustrating', 'scary', 'calm'])
  })
})
