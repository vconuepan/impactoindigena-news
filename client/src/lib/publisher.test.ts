import { describe, it, expect } from 'vitest'
import { publisherFromUrl } from '@shared/utils/publisher'

// KEEP IN SYNC: mirror of server/src/lib/publisher.test.ts (the function has
// twin copies in shared/utils/publisher.ts and server/src/lib/publisher.ts).

describe('publisherFromUrl (shared)', () => {
  it('maps well-known outlets to curated names', () => {
    expect(publisherFromUrl('https://www.elpais.com/chile/articulo', 'Google News')).toBe('El País')
    expect(publisherFromUrl('https://es.mongabay.com/2026/01/nota/', 'Google News')).toBe('Mongabay')
    expect(publisherFromUrl('https://news.un.org/es/story/2026/06/1', 'Google News')).toBe('Noticias ONU')
  })

  it('falls back to the cleaned hostname for unmapped domains', () => {
    expect(publisherFromUrl('https://www.diarioaustral.cl/nota/123', 'Google News')).toBe('diarioaustral.cl')
  })

  it('falls back to the feed name for aggregator URLs', () => {
    expect(publisherFromUrl('https://news.google.com/rss/articles/abc', 'Google News')).toBe('Google News')
  })

  it('uses the feed name when the URL is missing or invalid', () => {
    expect(publisherFromUrl(null, 'El Mostrador')).toBe('El Mostrador')
    expect(publisherFromUrl('no-es-una-url', 'El Mostrador')).toBe('El Mostrador')
  })

  it('keeps normal feeds intact', () => {
    expect(publisherFromUrl('https://www.theguardian.com/world/x', 'The Guardian')).toBe('The Guardian')
  })
})
