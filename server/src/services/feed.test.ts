import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  feed: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../config.js', () => ({ config: {} }))

const { updateCrawlStatus } = await import('./feed.js')

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
