import { describe, it, expect } from 'vitest'
import { buildBlueskyPostPrompt, buildBlueskyPickBestPrompt } from './bluesky.js'
import type { StoryForBlueskyPost, StoryForBlueskyPick } from './bluesky.js'

describe('buildBlueskyPostPrompt', () => {
  const baseStory: StoryForBlueskyPost = {
    id: 'story-1',
    title: 'Scientists find high-efficiency solar cell',
    titleLabel: 'Solar energy',
    summary: 'Researchers developed a new perovskite solar cell reaching 33% efficiency.',
    relevanceSummary: 'A breakthrough in renewable energy could lower solar panel costs by 40%.',
    maxChars: 150,
  }

  it('interpolates story title and summary', () => {
    const prompt = buildBlueskyPostPrompt(baseStory)
    expect(prompt).toContain('Scientists find high-efficiency solar cell')
    expect(prompt).toContain('perovskite solar cell reaching 33% efficiency')
  })

  it('interpolates maxChars into prompt', () => {
    const prompt = buildBlueskyPostPrompt(baseStory)
    expect(prompt).toContain('150')
  })

  it('includes relevance summary when present', () => {
    const prompt = buildBlueskyPostPrompt(baseStory)
    expect(prompt).toContain('lower solar panel costs by 40%')
  })

  it('omits relevance summary when null', () => {
    const withoutRelevance = buildBlueskyPostPrompt({ ...baseStory, relevanceSummary: null })
    const withRelevance = buildBlueskyPostPrompt(baseStory)
    expect(withoutRelevance).not.toContain('lower solar panel costs by 40%')
    // The prompt should be shorter without the relevance section
    expect(withoutRelevance.length).toBeLessThan(withRelevance.length)
  })

  it('escapes XML special characters', () => {
    const prompt = buildBlueskyPostPrompt({ ...baseStory, title: 'A & B <C>' })
    expect(prompt).toContain('A &amp; B &lt;C&gt;')
  })

  it('requires discovery hashtags (no longer forbids them)', () => {
    const prompt = buildBlueskyPostPrompt(baseStory)
    expect(prompt).toContain('hashtags for discovery')
    expect(prompt).toContain('#PueblosIndígenas')
    expect(prompt).not.toContain('links, hashtags, or @mentions')
  })
})

describe('buildBlueskyPickBestPrompt', () => {
  const stories: StoryForBlueskyPick[] = [
    {
      id: 'story-1',
      title: 'Story one',
      titleLabel: 'Topic A',
      summary: 'Summary of story one.',
      relevanceSummary: 'This matters because of X.',
      relevance: 8,
      emotionTag: 'uplifting',
      issueName: 'Climate',
      datePublished: '2026-02-10T00:00:00Z',
    },
    {
      id: 'story-2',
      title: 'Story two',
      titleLabel: 'Topic B',
      summary: 'Summary of story two.',
      relevanceSummary: null,
      relevance: 6,
      emotionTag: 'calm',
      issueName: 'Technology',
      datePublished: '2026-02-09T00:00:00Z',
    },
  ]

  it('includes all story IDs', () => {
    const prompt = buildBlueskyPickBestPrompt(stories)
    expect(prompt).toContain('story-1')
    expect(prompt).toContain('story-2')
  })

  it('includes all story titles and summaries', () => {
    const prompt = buildBlueskyPickBestPrompt(stories)
    expect(prompt).toContain('Story one')
    expect(prompt).toContain('Story two')
    expect(prompt).toContain('Summary of story one.')
    expect(prompt).toContain('Summary of story two.')
  })

  it('formats relevance as X/10', () => {
    const prompt = buildBlueskyPickBestPrompt(stories)
    expect(prompt).toContain('8/10')
    expect(prompt).toContain('6/10')
  })

  it('handles null relevance', () => {
    const prompt = buildBlueskyPickBestPrompt([{ ...stories[0], relevance: null }])
    expect(prompt).toContain('N/A')
  })

  it('includes issue names and emotion tags', () => {
    const prompt = buildBlueskyPickBestPrompt(stories)
    expect(prompt).toContain('Climate')
    expect(prompt).toContain('Technology')
    expect(prompt).toContain('uplifting')
    expect(prompt).toContain('calm')
  })

  it('includes relevanceSummary when present', () => {
    const prompt = buildBlueskyPickBestPrompt(stories)
    expect(prompt).toContain('This matters because of X.')
  })

  it('omits relevanceSummary when null', () => {
    const prompt = buildBlueskyPickBestPrompt(stories)
    // story-2 has null relevanceSummary — should not have "Why it matters" line for it
    // but story-1 should
    expect(prompt).toContain('Why it matters: This matters because of X.')
  })

  it('handles null optional fields', () => {
    const prompt = buildBlueskyPickBestPrompt([
      { ...stories[0], relevanceSummary: null, emotionTag: null, issueName: null, datePublished: null },
    ])
    expect(prompt).toContain('story-1')
    // Should not contain 'null' as literal text
    expect(prompt).not.toMatch(/: null/)
  })
})
