import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({ $executeRaw: vi.fn() }))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../config.js', () => ({ config: { analytics: { visitorRetentionDays: 365 } } }))

const { runCleanupAnalytics } = await import('./cleanupAnalytics.js')

describe('runCleanupAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$executeRaw.mockResolvedValue(0)
  })

  it('deletes daily_visitors rows older than the retention window', async () => {
    await runCleanupAnalytics()
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1)

    // Tagged-template call: the SQL fragments carry the table, the cutoff is a param.
    const [strings, cutoff] = mockPrisma.$executeRaw.mock.calls[0]
    expect(strings.join('?')).toContain('daily_visitors')
    expect(cutoff).toBeInstanceOf(Date)

    // 365 days back, normalized to midnight UTC.
    const expected = new Date()
    expected.setUTCDate(expected.getUTCDate() - 365)
    expected.setUTCHours(0, 0, 0, 0)
    expect((cutoff as Date).toISOString()).toBe(expected.toISOString())
  })

  it('never touches page_views (aggregate, no identifiable subject)', async () => {
    await runCleanupAnalytics()
    const [strings] = mockPrisma.$executeRaw.mock.calls[0]
    expect(strings.join('?')).not.toContain('page_views')
  })
})
