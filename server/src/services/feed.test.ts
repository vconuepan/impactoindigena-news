import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  feed: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  $queryRaw: vi.fn(),
}))
const mockConfig = vi.hoisted(() => ({ config: {} as { crawl?: { dueToleranceMinutes?: number } } }))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../config.js', () => mockConfig)

const { updateCrawlStatus, getDueFeeds, holguraDeVencimiento } = await import('./feed.js')

// 20-nov-2026: el job corre a la hora en punto y cada fuente anota
// last_crawled_at al terminar (0 a 5 min después). Sin holgura, una fuente de
// 24 h esperaba 30 h. Medido del 7 al 20-nov: 0 intervalos de 24 h y 963 de 30 h.
// El SQL se validó contra Postgres real (casos de 21:01:17 y 21:04:59).
describe('getDueFeeds — holgura de vencimiento', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.config = {}
    mockPrisma.$queryRaw.mockResolvedValue([])
  })

  it('resta la holgura configurada al vencimiento de cada fuente', async () => {
    mockConfig.config = { crawl: { dueToleranceMinutes: 15 } }
    await getDueFeeds()
    const [plantilla, ...valores] = mockPrisma.$queryRaw.mock.calls[0]
    expect((plantilla as string[]).join('?')).toContain('make_interval(mins => ?::int)')
    expect(valores).toEqual([15])
  })

  it('sin configuración usa 15 minutos; con un valor inválido, también', () => {
    expect(holguraDeVencimiento()).toBe(15)
    mockConfig.config = { crawl: { dueToleranceMinutes: Number.NaN } }
    expect(holguraDeVencimiento()).toBe(15)
    mockConfig.config = { crawl: { dueToleranceMinutes: -5 } }
    expect(holguraDeVencimiento()).toBe(15)
  })

  it('0 vuelve al comportamiento anterior, y los decimales se truncan', () => {
    mockConfig.config = { crawl: { dueToleranceMinutes: 0 } }
    expect(holguraDeVencimiento()).toBe(0)
    mockConfig.config = { crawl: { dueToleranceMinutes: 20.9 } }
    expect(holguraDeVencimiento()).toBe(20)
  })

  it('sin fuentes vencidas no consulta el detalle', async () => {
    await getDueFeeds()
    expect(mockPrisma.feed.findMany).not.toHaveBeenCalled()
  })
})

/** Extract the `data` object passed to the single prisma.feed.update call. */
function updateData() {
  return mockPrisma.feed.update.mock.calls[0][0].data
}

describe('updateCrawlStatus — broken-feed detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.feed.update.mockResolvedValue({})
  })

  it('broken feed (feedFetchFailed) counts as a FAILURE, not an empty crawl', async () => {
    mockPrisma.feed.findUnique.mockResolvedValue({ consecutiveFailedCrawls: 0 })
    await updateCrawlStatus('f1', {
      hadSuccess: false,
      feedFetchFailed: true,
      errorMessage: 'Request failed with status code 404',
      newItemCount: 0,
      rssItemCount: 0,
      crawlResult: 'Feed error: 404',
    })
    const d = updateData()
    expect(d.consecutiveFailedCrawls).toBe(1) // failure tracked
    expect(d.consecutiveEmptyCrawls).toBeUndefined() // NOT counted as empty
    expect(d.lastCrawlError).toBe('Request failed with status code 404') // red badge
    expect(d.lastSuccessfulCrawlAt).toBeUndefined()
  })

  it('healthy feed with zero items still counts as EMPTY (unchanged behavior)', async () => {
    await updateCrawlStatus('f1', {
      hadSuccess: true, newItemCount: 0, rssItemCount: 0, crawlResult: 'No items in feed',
    })
    const d = updateData()
    expect(d.consecutiveEmptyCrawls).toEqual({ increment: 1 })
    expect(d.consecutiveFailedCrawls).toBe(0)
  })

  it('broken feed auto-advances lastCrawledAt after MAX consecutive failures', async () => {
    mockPrisma.feed.findUnique.mockResolvedValue({ consecutiveFailedCrawls: 2 }) // this run makes 3
    await updateCrawlStatus('f1', {
      hadSuccess: false, feedFetchFailed: true, errorMessage: 'HTTP 403',
      newItemCount: 0, rssItemCount: 0,
    })
    const d = updateData()
    expect(d.consecutiveFailedCrawls).toBe(0) // reset after MAX (3) to avoid infinite retry
    expect(d.lastCrawledAt).toBeInstanceOf(Date)
  })

  it('successful crawl with new items resets both counters and clears the error', async () => {
    await updateCrawlStatus('f1', {
      hadSuccess: true, newItemCount: 2, rssItemCount: 5, crawlResult: 'ok',
    })
    const d = updateData()
    expect(d.consecutiveFailedCrawls).toBe(0)
    expect(d.consecutiveEmptyCrawls).toBe(0)
    expect(d.lastSuccessfulCrawlAt).toBeInstanceOf(Date)
    expect(d.lastCrawlError).toBeNull()
  })

  it('extraction total-failure (items present, all failed) still increments failures', async () => {
    mockPrisma.feed.findUnique.mockResolvedValue({ consecutiveFailedCrawls: 0 })
    await updateCrawlStatus('f1', {
      hadSuccess: false, newItemCount: 3, rssItemCount: 3, errorMessage: 'extraction failed',
    })
    const d = updateData()
    expect(d.consecutiveFailedCrawls).toBe(1)
  })
})
