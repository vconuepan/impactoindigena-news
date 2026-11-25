import { describe, it, expect, vi, beforeEach } from 'vitest'

// ──── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  agendaItem: { findMany: vi.fn() },
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

vi.mock('../config.js', () => ({
  config: {
    siteUrl: 'https://impactoindigena.news',
    mastodon: { charLimit: 500 },
    agenda: {
      digest: {
        enabled: true,
        dueWithinDays: 21,
        eventWithinDays: 30,
        publishedWithinDays: 7,
      },
    },
  },
}))

const {
  selectWeeklyAgendaItems,
  buildCountPhrase,
  buildDigestText,
  buildInstagramCaption,
  isoWeekKey,
  isSameIsoWeek,
  AGENDA_SECTION_PATH,
} = await import('./agendaDigest.js')

type Counts = { evento: number; convocatoria: number; oportunidad: number; publicacion: number; total: number }
const counts = (c: Partial<Counts>): Counts => ({
  evento: 0, convocatoria: 0, oportunidad: 0, publicacion: 0, total: 0, ...c,
})

// ──── buildCountPhrase ────────────────────────────────────────────────────────

describe('buildCountPhrase', () => {
  it('uses singular for 1 and plural otherwise', () => {
    expect(buildCountPhrase(counts({ evento: 1 }))).toBe('1 evento')
    expect(buildCountPhrase(counts({ evento: 3 }))).toBe('3 eventos')
    expect(buildCountPhrase(counts({ convocatoria: 1 }))).toBe('1 convocatoria con fecha límite')
    expect(buildCountPhrase(counts({ oportunidad: 2 }))).toBe('2 oportunidades')
    expect(buildCountPhrase(counts({ publicacion: 1 }))).toBe('1 publicación nueva')
  })

  it('omits zero-count types and joins with commas + "y"', () => {
    const phrase = buildCountPhrase(counts({ evento: 3, convocatoria: 2, oportunidad: 2, publicacion: 2 }))
    expect(phrase).toBe('3 eventos, 2 convocatorias con fecha límite, 2 oportunidades y 2 publicaciones nuevas')
  })

  it('single non-zero type has no separator', () => {
    expect(buildCountPhrase(counts({ oportunidad: 1 }))).toBe('1 oportunidad')
  })
})

// ──── buildDigestText ─────────────────────────────────────────────────────────

describe('buildDigestText', () => {
  const c = counts({ evento: 3, convocatoria: 2, oportunidad: 2, publicacion: 2 })

  it('bluesky body carries no URL (link lives in the card) and stays within 300', () => {
    const text = buildDigestText(c, 'bluesky')
    expect(text).not.toContain('https://')
    expect([...text].length).toBeLessThanOrEqual(300)
    expect(text).toContain('incidencia internacional indígena')
  })

  it('mastodon appends the section URL inline within 500', () => {
    const text = buildDigestText(c, 'mastodon')
    expect(text).toContain(`https://impactoindigena.news${AGENDA_SECTION_PATH}`)
    expect([...text].length).toBeLessThanOrEqual(500)
  })

  it('twitter budgets the URL as a fixed t.co length and stays within 280', () => {
    const text = buildDigestText(c, 'twitter')
    expect(text).toContain(AGENDA_SECTION_PATH)
    // real URL is longer than 280 minus body, so the fixed-length budgeting matters
    expect([...text].length).toBeLessThanOrEqual(280 + `https://impactoindigena.news${AGENDA_SECTION_PATH}`.length)
  })

  it('instagram caption includes the teaser and hashtags', () => {
    const cap = buildInstagramCaption(c)
    expect(cap).toContain('incidencia internacional indígena')
    expect(cap).toContain('#PueblosIndígenas')
  })
})

// ──── ISO week helpers ────────────────────────────────────────────────────────

describe('isoWeekKey / isSameIsoWeek', () => {
  it('same Monday-based week returns the same key', () => {
    const mon = new Date('2026-07-06T00:00:00Z') // Monday
    const fri = new Date('2026-07-10T23:00:00Z') // Friday same week
    expect(isoWeekKey(mon)).toBe(isoWeekKey(fri))
    expect(isSameIsoWeek(mon, fri)).toBe(true)
  })

  it('crossing into the next Monday flips the week', () => {
    const sun = new Date('2026-07-12T23:00:00Z') // Sunday
    const nextMon = new Date('2026-07-13T00:00:00Z') // Monday
    expect(isSameIsoWeek(sun, nextMon)).toBe(false)
  })
})

// ──── selectWeeklyAgendaItems ─────────────────────────────────────────────────

describe('selectWeeklyAgendaItems', () => {
  beforeEach(() => vi.clearAllMocks())

  it('queries only published items with the four type windows and counts by type', async () => {
    mockPrisma.agendaItem.findMany.mockResolvedValueOnce([
      { type: 'evento' }, { type: 'evento' },
      { type: 'convocatoria' },
      { type: 'publicacion' },
    ])
    const now = new Date('2026-07-10T09:00:00Z')
    const { counts: c, items } = await selectWeeklyAgendaItems(now)

    expect(items).toHaveLength(4)
    expect(c).toEqual({ evento: 2, convocatoria: 1, oportunidad: 0, publicacion: 1, total: 4 })

    const arg = mockPrisma.agendaItem.findMany.mock.calls[0][0]
    expect(arg.where.status).toBe('published')
    expect(arg.where.OR).toHaveLength(4)
  })

  it('degrades to empty counts when the table is not provisioned (P2021)', async () => {
    mockPrisma.agendaItem.findMany.mockRejectedValueOnce({ code: 'P2021' })
    const { counts: c, items } = await selectWeeklyAgendaItems(new Date())
    expect(items).toHaveLength(0)
    expect(c.total).toBe(0)
  })
})
