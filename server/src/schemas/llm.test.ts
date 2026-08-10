import { describe, it, expect } from 'vitest'
import { assessResultSchema, extractQuoteAttributionSchema, extractTitleLabelSchema } from './llm.js'

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
