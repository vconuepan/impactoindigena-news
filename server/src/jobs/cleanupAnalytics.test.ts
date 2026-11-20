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
    // La primera es daily_visitors; la segunda, visitor_day_signals (abajo).
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2)

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

  it('never touches page_views nor ua_hits_daily (aggregate, no identifiable subject)', async () => {
    await runCleanupAnalytics()
    for (const [strings] of mockPrisma.$executeRaw.mock.calls) {
      expect(strings.join('?')).not.toContain('page_views')
      expect(strings.join('?')).not.toContain('ua_hits_daily')
    }
  })

  // 20-nov-2026: la señal de interaccion lleva el mismo hash diario, mismo plazo.
  it('poda visitor_day_signals con el mismo corte que daily_visitors', async () => {
    await runCleanupAnalytics()
    const [s1, c1] = mockPrisma.$executeRaw.mock.calls[0]
    const [s2, c2] = mockPrisma.$executeRaw.mock.calls[1]
    expect(s1.join('?')).toContain('daily_visitors')
    expect(s2.join('?')).toContain('visitor_day_signals')
    expect((c2 as Date).toISOString()).toBe((c1 as Date).toISOString())
  })

  it('si visitor_day_signals no existe aun, la limpieza no falla', async () => {
    mockPrisma.$executeRaw.mockResolvedValueOnce(3).mockRejectedValueOnce(new Error('relation does not exist'))
    await expect(runCleanupAnalytics()).resolves.toBeUndefined()
  })
})
