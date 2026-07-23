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
