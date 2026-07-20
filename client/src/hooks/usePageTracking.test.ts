import { describe, it, expect } from 'vitest'
import { classifyReferrer } from './usePageTracking'

const HOST = 'impactoindigena.news'

describe('classifyReferrer', () => {
  it('empty referrer → direct', () => {
    expect(classifyReferrer('', HOST)).toBe('')
  })

  it('invalid referrer → direct', () => {
    expect(classifyReferrer('not-a-url', HOST)).toBe('')
  })

  it('same host → internal', () => {
    expect(classifyReferrer('https://impactoindigena.news/stories/x', HOST)).toBe('internal')
  })

  it('search engines → search', () => {
    expect(classifyReferrer('https://www.google.com/search?q=indigena', HOST)).toBe('search')
    expect(classifyReferrer('https://www.google.cl/', HOST)).toBe('search')
    expect(classifyReferrer('https://duckduckgo.com/', HOST)).toBe('search')
    expect(classifyReferrer('https://www.bing.com/', HOST)).toBe('search')
  })

  it('social networks → social', () => {
    expect(classifyReferrer('https://l.facebook.com/', HOST)).toBe('social')
    expect(classifyReferrer('https://t.co/abc123', HOST)).toBe('social')
    expect(classifyReferrer('https://www.linkedin.com/feed/', HOST)).toBe('social')
    expect(classifyReferrer('https://bsky.app/profile/x', HOST)).toBe('social')
    expect(classifyReferrer('https://www.instagram.com/', HOST)).toBe('social')
  })

  it('other external sites → referral', () => {
    expect(classifyReferrer('https://somenewspaper.com/article', HOST)).toBe('referral')
    expect(classifyReferrer('https://news.ycombinator.com/', HOST)).toBe('referral')
  })
})
