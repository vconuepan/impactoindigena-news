import { describe, it, expect } from 'vitest'
import { publisherFromUrl } from './publisher.js'

// KEEP IN SYNC: mirror of client/src/lib/publisher.test.ts (the function has
// twin copies in shared/utils/publisher.ts and server/src/lib/publisher.ts).

describe('publisherFromUrl', () => {
  it('maps well-known outlets to curated names', () => {
    expect(publisherFromUrl('https://www.elpais.com/chile/articulo', 'Google News')).toBe('El País')
    expect(publisherFromUrl('https://es.mongabay.com/2026/01/nota/', 'Google News')).toBe('Mongabay')
    expect(publisherFromUrl('https://news.un.org/es/story/2026/06/1', 'Google News')).toBe('Noticias ONU')
  })

  it('falls back to the cleaned hostname for unmapped domains', () => {
    expect(publisherFromUrl('https://www.diarioaustral.cl/nota/123', 'Google News')).toBe('diarioaustral.cl')
    expect(publisherFromUrl('https://prensa-regional.pe/x', 'Google News')).toBe('prensa-regional.pe')
  })

  it('never returns "Google News"-derived hostnames — falls back to feed name', () => {
    expect(publisherFromUrl('https://news.google.com/rss/articles/abc', 'Google News')).toBe('Google News')
    expect(publisherFromUrl('https://www.google.com/url?q=x', 'Google News')).toBe('Google News')
  })

  it('uses the feed name when the URL is missing or invalid', () => {
    expect(publisherFromUrl(null, 'El Mostrador')).toBe('El Mostrador')
    expect(publisherFromUrl(undefined, 'El Mostrador')).toBe('El Mostrador')
    expect(publisherFromUrl('no-es-una-url', 'El Mostrador')).toBe('El Mostrador')
    expect(publisherFromUrl('', 'El Mostrador')).toBe('El Mostrador')
  })

  it('returns empty string when there is neither URL nor feed name', () => {
    expect(publisherFromUrl(null, null)).toBe('')
    expect(publisherFromUrl('::malformed::', undefined)).toBe('')
  })

  it('keeps normal feeds intact (non-Google sources resolve to their own outlet)', () => {
    // A normal RSS feed story: sourceUrl is the outlet itself, so derivation
    // agrees with (or improves on) the feed name.
    expect(publisherFromUrl('https://www.theguardian.com/world/x', 'The Guardian')).toBe('The Guardian')
  })
})
