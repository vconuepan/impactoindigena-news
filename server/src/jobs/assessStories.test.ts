import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetStoryIdsByStatus = vi.hoisted(() => vi.fn())
const mockAssessStories = vi.hoisted(() => vi.fn())
const mockPrisma = vi.hoisted(() => ({
  issue: { findMany: vi.fn() },
  story: { updateMany: vi.fn() },
}))

vi.mock('../services/story.js', () => ({
  getStoryIdsByStatus: mockGetStoryIdsByStatus,
}))
vi.mock('../services/analysis.js', () => ({
  assessStories: mockAssessStories,
}))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

const { runAssessStories } = await import('./assessStories.js')

describe('runAssessStories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.issue.findMany.mockResolvedValue([])
    mockPrisma.story.updateMany.mockResolvedValue({ count: 0 })
  })

  it('assesses pre-analyzed stories above threshold', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'issue-1', name: 'Test Issue', minPreRating: null },
    ])
    mockGetStoryIdsByStatus
      .mockResolvedValueOnce([]) // snapshot: all pre_analyzed (for rejection)
      .mockResolvedValueOnce(['story-1', 'story-2']) // issue-1 stories
      .mockResolvedValueOnce([]) // unassigned stories
    mockAssessStories.mockResolvedValue({ completed: 2, errors: 0 })

    await runAssessStories()

    // First call: snapshot with no filters
    expect(mockGetStoryIdsByStatus).toHaveBeenCalledWith('pre_analyzed')
    // Per-issue and unassigned calls use global threshold (5) from config
    expect(mockGetStoryIdsByStatus).toHaveBeenCalledWith('pre_analyzed', { ratingMin: 5, issueId: 'issue-1' })
    expect(mockGetStoryIdsByStatus).toHaveBeenCalledWith('pre_analyzed', { ratingMin: 5, issueId: null })
    expect(mockAssessStories).toHaveBeenCalledWith(['story-1', 'story-2'])
  })

  it('uses per-issue minPreRating when set', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'issue-1', name: 'Regular', minPreRating: null },
      { id: 'issue-2', name: 'Strict', minPreRating: 7 },
    ])
    mockGetStoryIdsByStatus
      .mockResolvedValueOnce(['story-1', 'story-2']) // snapshot: all pre_analyzed
      .mockResolvedValueOnce(['story-1']) // issue-1 with global threshold (4)
      .mockResolvedValueOnce(['story-2']) // issue-2 with threshold 7
      .mockResolvedValueOnce([]) // unassigned
    mockAssessStories.mockResolvedValue({ completed: 2, errors: 0 })

    await runAssessStories()

    expect(mockGetStoryIdsByStatus).toHaveBeenCalledWith('pre_analyzed')
    expect(mockGetStoryIdsByStatus).toHaveBeenCalledWith('pre_analyzed', { ratingMin: 5, issueId: 'issue-1' })
    expect(mockGetStoryIdsByStatus).toHaveBeenCalledWith('pre_analyzed', { ratingMin: 7, issueId: 'issue-2' })
    expect(mockAssessStories).toHaveBeenCalledWith(['story-1', 'story-2'])
  })

  it('does nothing when no stories above threshold', async () => {
    mockGetStoryIdsByStatus
      .mockResolvedValueOnce([]) // snapshot: all pre_analyzed (empty)
      .mockResolvedValueOnce([]) // no unassigned qualify

    await runAssessStories()

    expect(mockAssessStories).not.toHaveBeenCalled()
    expect(mockPrisma.story.updateMany).not.toHaveBeenCalled()
  })

  it('rejects pre_analyzed stories below threshold', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'issue-1', name: 'Test', minPreRating: null },
    ])
    mockGetStoryIdsByStatus
      .mockResolvedValueOnce(['story-1', 'story-2', 'story-3']) // snapshot: all pre_analyzed
      .mockResolvedValueOnce(['story-1']) // issue-1: qualifies
      .mockResolvedValueOnce([]) // unassigned
    mockAssessStories.mockResolvedValue({ completed: 1, errors: 0 })

    await runAssessStories()

    // story-2 and story-3 are below threshold (not in qualified set)
    expect(mockPrisma.story.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['story-2', 'story-3'] }, status: 'pre_analyzed' },
      data: { status: 'rejected' },
    })
  })

  it('does not reject when all pre_analyzed stories qualify', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'issue-1', name: 'Test', minPreRating: null },
    ])
    mockGetStoryIdsByStatus
      .mockResolvedValueOnce(['story-1', 'story-2']) // snapshot: all pre_analyzed
      .mockResolvedValueOnce(['story-1', 'story-2']) // issue-1: both qualify
      .mockResolvedValueOnce([]) // unassigned
    mockAssessStories.mockResolvedValue({ completed: 2, errors: 0 })

    await runAssessStories()

    expect(mockPrisma.story.updateMany).not.toHaveBeenCalled()
  })

  it('rejects below-threshold stories even when no stories qualify', async () => {
    // All pre_analyzed stories are below threshold
    mockGetStoryIdsByStatus
      .mockResolvedValueOnce(['story-low-1', 'story-low-2']) // snapshot: all pre_analyzed
      .mockResolvedValueOnce([]) // no unassigned qualify

    await runAssessStories()

    expect(mockAssessStories).not.toHaveBeenCalled()
    expect(mockPrisma.story.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['story-low-1', 'story-low-2'] }, status: 'pre_analyzed' },
      data: { status: 'rejected' },
    })
  })

  it('handles errors in assessment result', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'issue-1', name: 'Test', minPreRating: null },
    ])
    mockGetStoryIdsByStatus
      .mockResolvedValueOnce(['story-1', 'story-2']) // snapshot: all pre_analyzed
      .mockResolvedValueOnce(['story-1', 'story-2']) // issue-1: both qualify
      .mockResolvedValueOnce([]) // unassigned
    mockAssessStories.mockResolvedValue({ completed: 1, errors: 1 })

    await runAssessStories()

    expect(mockAssessStories).toHaveBeenCalledWith(['story-1', 'story-2'])
  })
})
