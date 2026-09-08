import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSchedule = vi.hoisted(() => vi.fn(() => ({ stop: vi.fn() })))
const mockValidate = vi.hoisted(() => vi.fn(() => true))

const mockPrisma = vi.hoisted(() => ({
  jobRun: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $disconnect: vi.fn(),
}))

vi.mock('node-cron', () => ({
  default: {
    schedule: mockSchedule,
    validate: mockValidate,
  },
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('./crawlFeeds.js', () => ({ runCrawlFeeds: vi.fn() }))
vi.mock('./preassessStories.js', () => ({ runPreassessStories: vi.fn() }))
vi.mock('./assessStories.js', () => ({ runAssessStories: vi.fn() }))
vi.mock('./selectStories.js', () => ({ runSelectStories: vi.fn() }))

const { initScheduler, stopScheduler, estimateCronIntervalMs } = await import('./scheduler.js')

describe('scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidate.mockReturnValue(true)
    mockSchedule.mockReturnValue({ stop: vi.fn() })
    stopScheduler()
  })

  describe('initScheduler', () => {
    it('registers enabled jobs with valid cron expressions', async () => {
      mockPrisma.jobRun.findMany.mockResolvedValue([
        {
          jobName: 'crawl_feeds',
          enabled: true,
          cronExpression: '0 */6 * * *',
          lastCompletedAt: new Date(),
          lastStartedAt: null,
        },
      ])

      await initScheduler()

      expect(mockSchedule).toHaveBeenCalledTimes(1)
      // La zona va en el tercer argumento y NO es decorativa: sin ella node-cron
      // lee la expresion en la del proceso —UTC en el App Service— mientras el
      // panel muestra hora de Chile, y el job corre tres o cuatro horas antes de
      // lo que su autor creia. Se afirma el valor, no solo su presencia.
      expect(mockSchedule).toHaveBeenCalledWith('0 */6 * * *', expect.any(Function), {
        timezone: 'America/Santiago',
      })
    })

    it('skips disabled jobs', async () => {
      mockPrisma.jobRun.findMany.mockResolvedValue([
        {
          jobName: 'crawl_feeds',
          enabled: false,
          cronExpression: '0 */6 * * *',
          lastCompletedAt: null,
          lastStartedAt: null,
        },
      ])

      await initScheduler()

      expect(mockSchedule).not.toHaveBeenCalled()
    })

    it('skips jobs with unknown handler', async () => {
      mockPrisma.jobRun.findMany.mockResolvedValue([
        {
          jobName: 'unknown_job',
          enabled: true,
          cronExpression: '0 */6 * * *',
          lastCompletedAt: null,
          lastStartedAt: null,
        },
      ])

      await initScheduler()

      expect(mockSchedule).not.toHaveBeenCalled()
    })

    it('skips jobs with invalid cron expression', async () => {
      mockValidate.mockReturnValue(false)
      mockPrisma.jobRun.findMany.mockResolvedValue([
        {
          jobName: 'crawl_feeds',
          enabled: true,
          cronExpression: 'bad cron',
          lastCompletedAt: null,
          lastStartedAt: null,
        },
      ])

      await initScheduler()

      expect(mockSchedule).not.toHaveBeenCalled()
    })

    it('triggers overdue jobs immediately', async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000) // 48 hours ago
      mockPrisma.jobRun.findMany.mockResolvedValue([
        {
          jobName: 'crawl_feeds',
          enabled: true,
          cronExpression: '0 */6 * * *',
          lastCompletedAt: oldDate,
          lastStartedAt: null,
        },
      ])
      // runJob will call findUnique
      mockPrisma.jobRun.findUnique.mockResolvedValue({
        jobName: 'crawl_feeds',
        lastStartedAt: null,
        lastCompletedAt: oldDate,
      })
      mockPrisma.jobRun.update.mockResolvedValue({})

      await initScheduler()

      // Should have scheduled AND triggered immediately
      expect(mockSchedule).toHaveBeenCalledTimes(1)
      // runJob should have been called (marks as started)
      expect(mockPrisma.jobRun.update).toHaveBeenCalled()
    })
  })

  describe('estimateCronIntervalMs', () => {
    it('returns null for expressions with fewer than 5 parts', () => {
      expect(estimateCronIntervalMs('* * *')).toBeNull()
    })

    it('parses */N hour pattern as N hours', () => {
      expect(estimateCronIntervalMs('0 */6 * * *')).toBe(6 * 60 * 60 * 1000)
      expect(estimateCronIntervalMs('0 */1 * * *')).toBe(1 * 60 * 60 * 1000)
    })

    it('parses comma-separated hours as 24/count', () => {
      // 4 times per day → 6 hour interval
      expect(estimateCronIntervalMs('0 1,7,13,19 * * *')).toBe(6 * 60 * 60 * 1000)
      // 2 times per day → 12 hour interval
      expect(estimateCronIntervalMs('0 9,21 * * *')).toBe(12 * 60 * 60 * 1000)
    })

    it('parses single hour as daily (24 hours)', () => {
      expect(estimateCronIntervalMs('0 10 * * *')).toBe(24 * 60 * 60 * 1000)
    })

    it('factors in single day-of-week as weekly', () => {
      // Saturday only → 7 * 24h = 168h
      expect(estimateCronIntervalMs('0 4 * * 6')).toBe(7 * 24 * 60 * 60 * 1000)
    })

    it('factors in weekday range (1-5) as 7/5 multiplier', () => {
      // Weekdays at 9am → 24h * 7/5 = 33.6h
      expect(estimateCronIntervalMs('0 9 * * 1-5')).toBe(24 * (7 / 5) * 60 * 60 * 1000)
    })

    it('handles wrap-around day-of-week range', () => {
      // Fri-Tue (5-2) = 5 days → 24h * 7/5 = 33.6h
      expect(estimateCronIntervalMs('0 9 * * 5-2')).toBe(24 * (7 / 5) * 60 * 60 * 1000)
    })

    it('handles comma-separated days', () => {
      // Mon, Wed, Fri → 3 days → 24h * 7/3
      expect(estimateCronIntervalMs('0 10 * * 1,3,5')).toBe(24 * (7 / 3) * 60 * 60 * 1000)
    })

    it('treats day-of-week * as daily (multiplier 1)', () => {
      expect(estimateCronIntervalMs('0 10 * * *')).toBe(24 * 60 * 60 * 1000)
    })

    it('treats day 7 and day 0 as the same (Sunday)', () => {
      // Both 0 and 7 represent Sunday
      expect(estimateCronIntervalMs('0 10 * * 0')).toBe(estimateCronIntervalMs('0 10 * * 7'))
    })

    it('returns null for unparseable hour field', () => {
      expect(estimateCronIntervalMs('0 * * * *')).toBeNull()
    })
  })

  describe('stopScheduler', () => {
    it('stops all registered tasks', async () => {
      const mockStop = vi.fn()
      mockSchedule.mockReturnValue({ stop: mockStop })
      mockPrisma.jobRun.findMany.mockResolvedValue([
        {
          jobName: 'crawl_feeds',
          enabled: true,
          cronExpression: '0 */6 * * *',
          lastCompletedAt: new Date(),
          lastStartedAt: null,
        },
      ])

      await initScheduler()
      stopScheduler()

      expect(mockStop).toHaveBeenCalled()
    })
  })
})
