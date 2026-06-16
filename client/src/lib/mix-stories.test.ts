import { describe, it, expect, beforeEach } from 'vitest'
import { mixHomepageStories, filterStoriesByPositivity, pickHero, positivityToEmotionTags } from './mix-stories'
import type { StoryBuckets } from './mix-stories'
import type { PublicStory, EmotionTag } from '@shared/types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let idCounter = 0

function makeStory(overrides: Partial<PublicStory> & { emotionTag: EmotionTag }): PublicStory {
  const id = `story-${++idCounter}`
  return {
    id,
    slug: id,
    sourceUrl: 'https://example.com',
    sourceTitle: 'Source',
    title: `Story ${id}`,
    titleLabel: null,
    dateCrawled: '2024-01-01T00:00:00Z',
    datePublished: '2024-01-01T00:00:00Z',
    status: 'published',
    relevancePre: 7,
    relevance: 8,
    summary: 'summary',
    quote: null,
    quoteAttribution: null,
    marketingBlurb: null,
    relevanceReasons: null,
    relevanceSummary: null,
    antifactors: null,
    issue: { name: 'Test', slug: 'test' },
    feed: { id: 'f1', title: 'Feed', displayTitle: null, issue: { name: 'Test', slug: 'test' } },
    ...overrides,
  } as PublicStory
}

function storiesOfType(emotionTag: EmotionTag, n: number, dateBase = '2024-01-'): PublicStory[] {
  return Array.from({ length: n }, (_, i) =>
    makeStory({
      emotionTag,
      datePublished: `${dateBase}${String(15 - i).padStart(2, '0')}T00:00:00Z`,
    }),
  )
}

function makeBuckets(upCount: number, calmCount: number, negCount: number): StoryBuckets {
  return {
    uplifting: storiesOfType('uplifting', upCount),
    calm: storiesOfType('calm', calmCount),
    negative: Array.from({ length: negCount }, (_, i) =>
      makeStory({
        emotionTag: i % 2 === 0 ? 'frustrating' : 'scary',
        datePublished: `2024-01-${String(15 - i).padStart(2, '0')}T00:00:00Z`,
      }),
    ),
  }
}

beforeEach(() => {
  idCounter = 0
})

// ---------------------------------------------------------------------------
// mixHomepageStories
// ---------------------------------------------------------------------------

describe('mixHomepageStories', () => {
  it('returns only uplifting at 100% (no calm)', () => {
    const buckets = makeBuckets(7, 5, 7)
    const result = mixHomepageStories(buckets, 7, 100)
    expect(result).toHaveLength(7)
    expect(result.every((s) => s.emotionTag === 'uplifting')).toBe(true)
  })

  it('at 100% returns fewer than slots if not enough uplifting', () => {
    const buckets = makeBuckets(3, 5, 7)
    const result = mixHomepageStories(buckets, 7, 100)
    // Only 3 uplifting available — no backfill
    expect(result).toHaveLength(3)
    expect(result.every((s) => s.emotionTag === 'uplifting')).toBe(true)
  })

  it('returns all negative at 0%', () => {
    const buckets = makeBuckets(7, 5, 7)
    const result = mixHomepageStories(buckets, 7, 0)
    expect(result).toHaveLength(7)
    expect(result.every((s) => ['frustrating', 'scary'].includes(s.emotionTag!))).toBe(true)
  })

  it('does not leak positive stories at 0% when negatives are short', () => {
    const buckets = makeBuckets(7, 5, 3) // only 3 negatives available, 7 slots
    const result = mixHomepageStories(buckets, 7, 0)
    // No backfill from positive buckets — return only the available negatives
    expect(result).toHaveLength(3)
    expect(result.every((s) => ['frustrating', 'scary'].includes(s.emotionTag!))).toBe(true)
  })

  it('returns a balanced mix at 50%', () => {
    const buckets = makeBuckets(4, 3, 7)
    const result = mixHomepageStories(buckets, 7, 50)
    expect(result).toHaveLength(7)

    const posCount = result.filter((s) => ['uplifting', 'calm'].includes(s.emotionTag!)).length
    const negCount = result.filter((s) => ['frustrating', 'scary'].includes(s.emotionTag!)).length
    // round(7 * 0.5) = 4 positive, 3 negative
    expect(posCount).toBe(4)
    expect(negCount).toBe(3)
  })

  it('at 75% combines uplifting+calm as positive', () => {
    const buckets = makeBuckets(3, 4, 7)
    const result = mixHomepageStories(buckets, 7, 75)
    expect(result).toHaveLength(7)

    const posCount = result.filter((s) => ['uplifting', 'calm'].includes(s.emotionTag!)).length
    // round(7 * 0.75) = 5 positive (uplifting+calm), 2 negative
    expect(posCount).toBe(5)
  })

  it('returns 25% positive mix', () => {
    const buckets = makeBuckets(4, 3, 7)
    const result = mixHomepageStories(buckets, 7, 25)
    expect(result).toHaveLength(7)

    const posCount = result.filter((s) => ['uplifting', 'calm'].includes(s.emotionTag!)).length
    // round(7 * 0.25) = 2 positive, 5 negative
    expect(posCount).toBe(2)
  })

  it('fills from other bucket when one is short (non-100%)', () => {
    const buckets = makeBuckets(1, 1, 7)
    const result = mixHomepageStories(buckets, 7, 75)
    // Wants 5 positive but only 2 available; fills from negative
    expect(result).toHaveLength(7)
  })

  it('handles empty positive buckets', () => {
    const buckets = makeBuckets(0, 0, 7)
    const result = mixHomepageStories(buckets, 7, 50)
    expect(result).toHaveLength(7)
    expect(result.every((s) => ['frustrating', 'scary'].includes(s.emotionTag!))).toBe(true)
  })

  it('handles empty negative bucket', () => {
    const buckets = makeBuckets(4, 3, 0)
    const result = mixHomepageStories(buckets, 7, 50)
    expect(result).toHaveLength(7)
    expect(result.every((s) => ['uplifting', 'calm'].includes(s.emotionTag!))).toBe(true)
  })

  it('handles all buckets empty', () => {
    const buckets = makeBuckets(0, 0, 0)
    const result = mixHomepageStories(buckets, 7, 50)
    expect(result).toHaveLength(0)
  })

  it('sorts result by date descending', () => {
    const buckets = makeBuckets(3, 2, 3)
    const result = mixHomepageStories(buckets, 6, 50)
    for (let i = 1; i < result.length; i++) {
      const prev = new Date(result[i - 1].datePublished!).getTime()
      const curr = new Date(result[i].datePublished!).getTime()
      expect(prev).toBeGreaterThanOrEqual(curr)
    }
  })

  it('does not include duplicate stories', () => {
    const buckets = makeBuckets(3, 2, 3)
    const result = mixHomepageStories(buckets, 6, 50)
    const ids = result.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ---------------------------------------------------------------------------
// pickHero
// ---------------------------------------------------------------------------

describe('pickHero', () => {
  it('picks most recent uplifting at 100%', () => {
    const storiesByIssue = {
      'issue-a': makeBuckets(3, 3, 3),
      'issue-b': makeBuckets(3, 3, 3),
    }
    const hero = pickHero(storiesByIssue, 100)
    expect(hero).not.toBeNull()
    expect(hero!.emotionTag).toBe('uplifting')
  })

  it('picks most recent negative at 0%', () => {
    const storiesByIssue = {
      'issue-a': makeBuckets(3, 3, 3),
    }
    const hero = pickHero(storiesByIssue, 0)
    expect(hero).not.toBeNull()
    expect(['frustrating', 'scary']).toContain(hero!.emotionTag)
  })

  it('picks from uplifting+calm at 75%', () => {
    const storiesByIssue = {
      'issue-a': makeBuckets(3, 3, 3),
    }
    const hero = pickHero(storiesByIssue, 75)
    expect(hero).not.toBeNull()
    expect(['uplifting', 'calm']).toContain(hero!.emotionTag)
  })

  it('picks from all stories at 50%', () => {
    const storiesByIssue = {
      'issue-a': makeBuckets(3, 3, 3),
    }
    const hero = pickHero(storiesByIssue, 50)
    expect(hero).not.toBeNull()
  })

  it('returns null when no stories match', () => {
    const storiesByIssue = {
      'issue-a': makeBuckets(0, 3, 3),
    }
    const hero = pickHero(storiesByIssue, 100)
    expect(hero).toBeNull()
  })

  it('returns null for empty buckets', () => {
    const hero = pickHero({}, 50)
    expect(hero).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// positivityToEmotionTags
// ---------------------------------------------------------------------------

describe('positivityToEmotionTags', () => {
  it('maps each slider stop to its emotion-tag band', () => {
    expect(positivityToEmotionTags(0)).toEqual(['frustrating', 'scary'])
    expect(positivityToEmotionTags(25)).toEqual(['frustrating', 'scary', 'calm'])
    expect(positivityToEmotionTags(50)).toBeUndefined()
    expect(positivityToEmotionTags(75)).toEqual(['frustrating', 'calm', 'uplifting'])
    expect(positivityToEmotionTags(100)).toEqual(['uplifting'])
  })

  it('keeps 25% and 75% symmetric — each drops only the opposite extreme', () => {
    const heavy = positivityToEmotionTags(25)!
    const light = positivityToEmotionTags(75)!
    // 25% (mostly heavy) drops the most upbeat tag; 75% (mostly positive) drops the most alarming tag
    expect(heavy).not.toContain('uplifting')
    expect(light).not.toContain('scary')
    // neither stop erases the milder opposite tag — 'calm' appears in both
    expect(heavy).toContain('calm')
    expect(light).toContain('calm')
    // same band size: no asymmetric over-exclusion (the regression had 75% at length 2)
    expect(heavy).toHaveLength(light.length)
  })
})

// ---------------------------------------------------------------------------
// filterStoriesByPositivity
// ---------------------------------------------------------------------------

describe('filterStoriesByPositivity', () => {
  function mixedStories(): PublicStory[] {
    return [
      ...storiesOfType('uplifting', 5),
      ...storiesOfType('calm', 5),
      ...storiesOfType('frustrating', 5),
      ...storiesOfType('scary', 5),
    ]
  }

  it('returns all stories at 50%', () => {
    const stories = mixedStories()
    const result = filterStoriesByPositivity(stories, 50)
    expect(result).toHaveLength(20)
  })

  it('returns only uplifting stories at 100% (not calm)', () => {
    const stories = mixedStories()
    const result = filterStoriesByPositivity(stories, 100)
    expect(result).toHaveLength(5)
    expect(result.every((s) => s.emotionTag === 'uplifting')).toBe(true)
  })

  it('returns only negative stories at 0%', () => {
    const stories = mixedStories()
    const result = filterStoriesByPositivity(stories, 0)
    expect(result).toHaveLength(10)
    expect(result.every((s) => ['frustrating', 'scary'].includes(s.emotionTag!))).toBe(true)
  })

  it('returns ~75% positive at 75% (includes calm)', () => {
    const stories = mixedStories()
    const result = filterStoriesByPositivity(stories, 75)
    const posCount = result.filter((s) => ['uplifting', 'calm'].includes(s.emotionTag!)).length
    const ratio = posCount / result.length
    expect(ratio).toBeGreaterThanOrEqual(0.7)
    expect(ratio).toBeLessThanOrEqual(0.85)
  })

  it('returns ~25% positive at 25%', () => {
    const stories = mixedStories()
    const result = filterStoriesByPositivity(stories, 25)
    const posCount = result.filter((s) => ['uplifting', 'calm'].includes(s.emotionTag!)).length
    const ratio = posCount / result.length
    expect(ratio).toBeGreaterThanOrEqual(0.2)
    expect(ratio).toBeLessThanOrEqual(0.35)
  })

  it('at 75% includes all positive stories (uplifting+calm)', () => {
    const stories = mixedStories()
    const allPositive = stories.filter((s) => ['uplifting', 'calm'].includes(s.emotionTag!))
    const result = filterStoriesByPositivity(stories, 75)
    for (const pos of allPositive) {
      expect(result.find((s) => s.id === pos.id)).toBeDefined()
    }
  })

  it('at 25% includes all negative stories', () => {
    const stories = mixedStories()
    const allNegative = stories.filter((s) => ['frustrating', 'scary'].includes(s.emotionTag!))
    const result = filterStoriesByPositivity(stories, 25)
    for (const neg of allNegative) {
      expect(result.find((s) => s.id === neg.id)).toBeDefined()
    }
  })

  it('sorts result by date descending', () => {
    const stories = mixedStories()
    const result = filterStoriesByPositivity(stories, 75)
    for (let i = 1; i < result.length; i++) {
      const prev = new Date(result[i - 1].datePublished!).getTime()
      const curr = new Date(result[i].datePublished!).getTime()
      expect(prev).toBeGreaterThanOrEqual(curr)
    }
  })

  it('handles empty input', () => {
    expect(filterStoriesByPositivity([], 50)).toHaveLength(0)
    expect(filterStoriesByPositivity([], 100)).toHaveLength(0)
    expect(filterStoriesByPositivity([], 0)).toHaveLength(0)
  })

  it('handles all-uplifting input', () => {
    const stories = storiesOfType('uplifting', 10)
    expect(filterStoriesByPositivity(stories, 0)).toHaveLength(0)
    expect(filterStoriesByPositivity(stories, 50)).toHaveLength(10)
    expect(filterStoriesByPositivity(stories, 100)).toHaveLength(10)
  })

  it('handles all-calm input at 100%', () => {
    const stories = storiesOfType('calm', 10)
    // At 100%: only uplifting, so calm is excluded
    expect(filterStoriesByPositivity(stories, 100)).toHaveLength(0)
    // At 75%: calm counts as positive
    expect(filterStoriesByPositivity(stories, 75)).toHaveLength(10)
  })

  it('handles all-negative input', () => {
    const stories = storiesOfType('frustrating', 10)
    expect(filterStoriesByPositivity(stories, 100)).toHaveLength(0)
    expect(filterStoriesByPositivity(stories, 50)).toHaveLength(10)
    expect(filterStoriesByPositivity(stories, 0)).toHaveLength(10)
  })

  it('handles stories with null emotionTag', () => {
    const stories = [
      makeStory({ emotionTag: 'uplifting' }),
      makeStory({ emotionTag: 'scary' }),
      { ...makeStory({ emotionTag: 'calm' }), emotionTag: null } as unknown as PublicStory,
    ]
    const result = filterStoriesByPositivity(stories, 100)
    expect(result).toHaveLength(1)
    expect(result[0].emotionTag).toBe('uplifting')
  })
})
