import { describe, it, expect } from 'vitest'
import { parseEnglishDate, parseOhchrListing } from './ohchrScraper.js'

const TODAY = new Date('2026-06-27T00:00:00Z')

describe('parseEnglishDate', () => {
  it('parses "D Month YYYY" as end-of-day UTC', () => {
    expect(parseEnglishDate('30 September 2026')?.toISOString()).toBe('2026-09-30T23:59:59.000Z')
  })
  it('parses "Month D, YYYY"', () => {
    expect(parseEnglishDate('September 30, 2026')?.toISOString()).toBe('2026-09-30T23:59:59.000Z')
  })
  it('parses abbreviated months', () => {
    expect(parseEnglishDate('5 Jan 2027')?.toISOString()).toBe('2027-01-05T23:59:59.000Z')
  })
  it('returns null for "ongoing" / no deadline / empty', () => {
    expect(parseEnglishDate('ongoing')).toBeNull()
    expect(parseEnglishDate('No deadline')).toBeNull()
    expect(parseEnglishDate('')).toBeNull()
  })
  it('rejects out-of-range days instead of silently rolling over', () => {
    expect(parseEnglishDate('45 September 2026')).toBeNull()
    expect(parseEnglishDate('31 April 2026')).toBeNull()
  })
})

const PAGE = `
<div class="card-2-item-wrapper views-row"><div class="card-2__text-container">
  <div>Special Rapporteur on the rights of indigenous peoples</div>
  <time>30 September 2026</time>
  <a class="card-2__link" href="/en/calls-for-input/2026/indigenous-land"><span class="card-2__title">Call for input: indigenous peoples and land rights</span></a>
</div></div>
<div class="card-2-item-wrapper views-row"><div class="card-2__text-container">
  <div>Special Procedures</div>
  <time>30 September 2026</time>
  <a class="card-2__link" href="/en/calls-for-input/2026/water"><span class="card-2__title">Call for input: water conference</span></a>
</div></div>
<div class="card-2-item-wrapper views-row"><div class="card-2__text-container">
  <div>Expert Mechanism</div>
  <time>01 January 2020</time>
  <a class="card-2__link" href="/en/calls-for-input/2020/old"><span class="card-2__title">Old indigenous peoples call</span></a>
</div></div>
<div class="card-2-item-wrapper views-row"><div class="card-2__text-container">
  <div>Special Rapporteur indigenous</div>
  <a class="card-2__link" href="/en/calls-for-input/2026/ongoing-indigenous"><span class="card-2__title">Ongoing call for indigenous submissions</span></a>
</div></div>`

describe('parseOhchrListing', () => {
  const drafts = parseOhchrListing(PAGE, TODAY)

  it('keeps only indigenous-relevant, non-expired calls', () => {
    // item1 (indigenous, future) + item4 (indigenous, undated) kept;
    // item2 (water, not indigenous) and item3 (indigenous but 2020) dropped.
    expect(drafts).toHaveLength(2)
    expect(drafts.map((d) => d.sourceUrl)).toEqual([
      'https://www.ohchr.org/en/calls-for-input/2026/indigenous-land',
      'https://www.ohchr.org/en/calls-for-input/2026/ongoing-indigenous',
    ])
  })

  it('maps a dated call to a convocatoria draft with the deadline', () => {
    const d = drafts[0]
    expect(d.type).toBe('convocatoria')
    expect(d.status).toBe('draft')
    expect(d.lang).toBe('en')
    expect(d.sourceName).toBe('ACNUDH · Llamados')
    expect(d.dueDate?.toISOString()).toBe('2026-09-30T23:59:59.000Z')
    expect(d.extractionScore).toBe(0.8)
    expect(d.externalId).toBe('ohchr:https://www.ohchr.org/en/calls-for-input/2026/indigenous-land')
  })

  it('keeps an undated call with null dueDate and a lower score (enrich will resolve)', () => {
    const d = drafts[1]
    expect(d.dueDate).toBeNull()
    expect(d.extractionScore).toBe(0.4)
  })
})
