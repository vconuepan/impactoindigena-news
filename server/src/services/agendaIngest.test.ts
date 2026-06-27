import { describe, it, expect } from 'vitest'
import { buildFromRss, buildFromVevent } from './agendaIngest.js'
import type { AgendaSource } from '../data/agendaSources.js'

const rssPublicacion: AgendaSource = { sourceName: 'FILAC · Publicaciones', url: 'x', kind: 'rss', type: 'publicacion', lang: 'es' }
const rssConvocatoria: AgendaSource = { sourceName: 'FILAC · Convocatorias', url: 'x', kind: 'rss', type: 'convocatoria', lang: 'es' }
const icalEvento: AgendaSource = { sourceName: 'ONU', url: 'x', kind: 'ical', type: 'evento', lang: 'en' }

const NOW = new Date('2026-06-27T12:00:00Z')
const TODAY = new Date('2026-06-27T00:00:00Z')

describe('buildFromRss', () => {
  it('drafts a publicacion using the RSS pubDate as startDate (curation: never auto-publish)', () => {
    const d = buildFromRss(
      { url: 'https://filac.org/p1', title: 'Informe sobre derechos', datePublished: '2026-06-20T00:00:00Z', description: 'desc', imageUrl: null },
      rssPublicacion, NOW,
    )
    expect(d).not.toBeNull()
    expect(d!.status).toBe('draft')
    expect(d!.type).toBe('publicacion')
    expect(d!.startDate?.toISOString()).toBe('2026-06-20T00:00:00.000Z')
    expect(d!.externalId).toBe('rss:https://filac.org/p1')
    expect(d!.extractionScore).toBeGreaterThan(0.5)
  })

  it('holds convocatoria/evento RSS as draft (no structured deadline/date)', () => {
    const d = buildFromRss(
      { url: 'https://filac.org/c1', title: 'Convocatoria becas', datePublished: '2026-06-20T00:00:00Z', description: null, imageUrl: null },
      rssConvocatoria, NOW,
    )
    expect(d!.status).toBe('draft')
    expect(d!.dueDate).toBeNull()
    expect(d!.extractionScore).toBeLessThan(0.5)
  })

  it('returns null when title or url is missing', () => {
    expect(buildFromRss({ url: '', title: 'x', datePublished: null, description: null, imageUrl: null }, rssPublicacion)).toBeNull()
    expect(buildFromRss({ url: 'u', title: '', datePublished: null, description: null, imageUrl: null }, rssPublicacion)).toBeNull()
  })

  it('rejects junk placeholder titles', () => {
    expect(buildFromRss({ url: 'u', title: 'No item available', datePublished: null, description: null, imageUrl: null }, rssConvocatoria)).toBeNull()
  })

  it('drops stale RSS items older than ~6 months by pubDate', () => {
    // 2021 fellowship → dropped
    expect(buildFromRss(
      { url: 'https://filac.org/becas2021', title: 'BECAS 2021: título de experto', datePublished: '2021-03-01T00:00:00Z', description: null, imageUrl: null },
      rssConvocatoria, NOW,
    )).toBeNull()
    // ~8 months old (before the 6-month cutoff from NOW=2026-06-27) → dropped
    expect(buildFromRss(
      { url: 'https://filac.org/old', title: 'Convocatoria octubre 2025', datePublished: '2025-10-01T00:00:00Z', description: null, imageUrl: null },
      rssConvocatoria, NOW,
    )).toBeNull()
    // Recent (within 6 months) → kept
    expect(buildFromRss(
      { url: 'https://filac.org/becas2026', title: 'Becas 2026', datePublished: '2026-05-01T00:00:00Z', description: null, imageUrl: null },
      rssConvocatoria, NOW,
    )).not.toBeNull()
    // No parseable date → kept (can't tell its age; lands as draft)
    expect(buildFromRss(
      { url: 'https://filac.org/nodate', title: 'Convocatoria sin fecha', datePublished: null, description: null, imageUrl: null },
      rssConvocatoria, NOW,
    )).not.toBeNull()
  })

  it('falls back to draft if a publicacion has no parseable date', () => {
    const d = buildFromRss({ url: 'u', title: 'Informe sin fecha', datePublished: null, description: null, imageUrl: null }, rssPublicacion, NOW)
    expect(d!.status).toBe('draft')
    expect(d!.startDate).toBeNull()
  })
})

describe('buildFromVevent', () => {
  it('drafts a future event with authoritative dates (curation: never auto-publish)', () => {
    const d = buildFromVevent(
      { type: 'VEVENT', uid: 'evt-1', summary: '62º Consejo DDHH', start: new Date('2026-07-10T09:00:00Z'), end: new Date('2026-07-12T18:00:00Z'), location: 'Ginebra', datetype: 'date-time' },
      icalEvento, TODAY, NOW,
    )
    expect(d).not.toBeNull()
    expect(d!.status).toBe('draft')
    expect(d!.type).toBe('evento')
    expect(d!.externalId).toBe('ical:evt-1')
    expect(d!.allDay).toBe(false)
    expect(d!.extractionScore).toBe(1.0)
  })

  it('marks all-day events from a date-only VEVENT', () => {
    const d = buildFromVevent(
      { type: 'VEVENT', uid: 'evt-2', summary: 'Sesión', start: new Date('2026-07-10T00:00:00Z'), datetype: 'date' },
      icalEvento, TODAY, NOW,
    )
    expect(d!.allDay).toBe(true)
  })

  it('skips past events', () => {
    const d = buildFromVevent(
      { type: 'VEVENT', uid: 'old', summary: 'Vieja', start: new Date('2020-01-01T00:00:00Z'), end: new Date('2020-01-02T00:00:00Z'), datetype: 'date-time' },
      icalEvento, TODAY, NOW,
    )
    expect(d).toBeNull()
  })

  it('skips non-VEVENT, or entries without uid/summary/start', () => {
    expect(buildFromVevent({ type: 'VTODO', uid: 'x', summary: 's', start: new Date('2026-07-10') }, icalEvento, TODAY, NOW)).toBeNull()
    expect(buildFromVevent({ type: 'VEVENT', summary: 's', start: new Date('2026-07-10') }, icalEvento, TODAY, NOW)).toBeNull()
    expect(buildFromVevent({ type: 'VEVENT', uid: 'x', start: new Date('2026-07-10') }, icalEvento, TODAY, NOW)).toBeNull()
    expect(buildFromVevent({ type: 'VEVENT', uid: 'x', summary: 's' }, icalEvento, TODAY, NOW)).toBeNull()
  })
})
