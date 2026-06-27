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
