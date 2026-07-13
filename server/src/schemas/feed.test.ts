import { describe, it, expect } from 'vitest'
import { createFeedSchema, updateFeedSchema } from './feed.js'

describe('createFeedSchema — trims title and URLs', () => {
  it('strips leading/trailing whitespace from title, rssUrl, url, displayTitle', () => {
    const parsed = createFeedSchema.parse({
      title: '  DeSmog  ',
      rssUrl: ' https://desmog.com/rss.xml ',
      url: '  https://desmog.com  ',
      displayTitle: '  DeSmog  ',
      issueId: 'issue-1',
    })
    expect(parsed.title).toBe('DeSmog')
    expect(parsed.rssUrl).toBe('https://desmog.com/rss.xml')
    expect(parsed.url).toBe('https://desmog.com')
    expect(parsed.displayTitle).toBe('DeSmog')
  })

  it('a URL with a leading space still validates once trimmed', () => {
    // Before the fix this threw ("Must be a valid URL") because .url() saw the space.
    expect(() =>
      createFeedSchema.parse({ title: 'X', rssUrl: '  https://a.com/feed', issueId: 'i' }),
    ).not.toThrow()
  })

  it('a whitespace-only title is rejected (trim → empty → min(1))', () => {
    expect(() =>
      createFeedSchema.parse({ title: '   ', rssUrl: 'https://a.com/feed', issueId: 'i' }),
    ).toThrow()
  })
})

describe('updateFeedSchema — trims provided fields', () => {
  it('trims rssUrl on update', () => {
    const parsed = updateFeedSchema.parse({ rssUrl: 'https://a.com/feed  ' })
    expect(parsed.rssUrl).toBe('https://a.com/feed')
  })
})
