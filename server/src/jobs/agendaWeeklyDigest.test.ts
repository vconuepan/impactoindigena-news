import { describe, it, expect, vi, beforeEach } from 'vitest'

// ──── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  jobRun: { findUnique: vi.fn() },
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

vi.mock('../config.js', () => ({
  config: {
    siteUrl: 'https://impactoindigena.news',
    agenda: {
      digest: {
        enabled: true,
        postDelayMs: 0,
        channels: { bluesky: true, mastodon: true, twitter: true, instagram: true },
      },
    },
  },
}))

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))
vi.mock('../utils/errors.js', () => ({ summarizeError: (e: unknown) => String(e) }))

const mockSelect = vi.hoisted(() => vi.fn())
const mockSameWeek = vi.hoisted(() => vi.fn())
vi.mock('../services/agendaDigest.js', () => ({
  selectWeeklyAgendaItems: mockSelect,
  buildDigestText: () => 'teaser',
  buildInstagramCaption: () => 'caption',
  isSameIsoWeek: mockSameWeek,
  AGENDA_SECTION_PATH: '/incidencia-internacional',
}))

const mockBsky = vi.hoisted(() => vi.fn())
const mockMasto = vi.hoisted(() => vi.fn())
const mockTweet = vi.hoisted(() => vi.fn())
const mockIg = vi.hoisted(() => vi.fn())
const mockCard = vi.hoisted(() => vi.fn())
vi.mock('../lib/bluesky.js', () => ({ isBlueskyConfigured: () => true, createPost: mockBsky }))
vi.mock('../lib/mastodon.js', () => ({ isMastodonConfigured: () => true, createStatus: mockMasto }))
vi.mock('../lib/twitter.js', () => ({ isTwitterConfigured: () => true, createTweet: mockTweet }))
vi.mock('../lib/instagram.js', () => ({ isInstagramConfigured: () => true, createSingleImagePost: mockIg }))
vi.mock('../lib/agendaCard.js', () => ({ generateAndUploadAgendaCard: mockCard }))

const { runAgendaWeeklyDigest } = await import('./agendaWeeklyDigest.js')

const nonEmpty = { items: [{ type: 'evento' }], counts: { evento: 1, convocatoria: 0, oportunidad: 0, publicacion: 0, total: 1 } }

// ──── Tests ──────────────────────────────────────────────────────────────────

describe('runAgendaWeeklyDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.jobRun.findUnique.mockResolvedValue(null)
    mockSameWeek.mockReturnValue(false)
    mockCard.mockResolvedValue('https://cdn/card.png')
    mockBsky.mockResolvedValue({ uri: 'u', cid: 'c' })
    mockMasto.mockResolvedValue({ id: 'm', url: 'x' })
    mockTweet.mockResolvedValue({ id: 't' })
    mockIg.mockResolvedValue({ id: 'i' })
  })

  it('publishes to all four channels when there are items', async () => {
    mockSelect.mockResolvedValue(nonEmpty)
    await runAgendaWeeklyDigest()
    expect(mockBsky).toHaveBeenCalledTimes(1)
    expect(mockMasto).toHaveBeenCalledTimes(1)
    expect(mockTweet).toHaveBeenCalledTimes(1)
    expect(mockCard).toHaveBeenCalledTimes(1)
    expect(mockIg).toHaveBeenCalledWith('https://cdn/card.png', 'caption')
  })

  it('posts nothing on an empty week', async () => {
    mockSelect.mockResolvedValue({ items: [], counts: { evento: 0, convocatoria: 0, oportunidad: 0, publicacion: 0, total: 0 } })
    await runAgendaWeeklyDigest()
    expect(mockBsky).not.toHaveBeenCalled()
    expect(mockMasto).not.toHaveBeenCalled()
    expect(mockTweet).not.toHaveBeenCalled()
    expect(mockIg).not.toHaveBeenCalled()
  })

  it('skips (idempotent) when already published this ISO week', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue({ lastCompletedAt: new Date('2026-07-10') })
    mockSameWeek.mockReturnValue(true)
    await runAgendaWeeklyDigest()
    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockBsky).not.toHaveBeenCalled()
  })

  it('a failing channel does not abort the others', async () => {
    mockSelect.mockResolvedValue(nonEmpty)
    mockBsky.mockRejectedValueOnce(new Error('bsky down'))
    await runAgendaWeeklyDigest()
    expect(mockMasto).toHaveBeenCalledTimes(1)
    expect(mockTweet).toHaveBeenCalledTimes(1)
    expect(mockIg).toHaveBeenCalledTimes(1)
  })

  it('skips Instagram when the card cannot be produced (no R2)', async () => {
    mockSelect.mockResolvedValue(nonEmpty)
    mockCard.mockResolvedValue(null)
    await runAgendaWeeklyDigest()
    expect(mockIg).not.toHaveBeenCalled()
    expect(mockBsky).toHaveBeenCalledTimes(1)
  })
})
