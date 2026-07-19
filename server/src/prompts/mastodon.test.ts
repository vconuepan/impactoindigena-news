import { describe, it, expect } from 'vitest'
import { buildMastodonPostPrompt } from './mastodon.js'
import type { StoryForMastodonPost } from './mastodon.js'

describe('buildMastodonPostPrompt', () => {
  const baseStory: StoryForMastodonPost = {
    id: 'story-1',
    title: 'Scientists find high-efficiency solar cell',
    titleLabel: 'Solar energy',
    summary: 'Researchers developed a new perovskite solar cell reaching 33% efficiency.',
    relevanceSummary: 'A breakthrough in renewable energy could lower solar panel costs by 40%.',
    maxChars: 350,
  }

  it('interpolates story title and summary', () => {
    const prompt = buildMastodonPostPrompt(baseStory)
    expect(prompt).toContain('Scientists find high-efficiency solar cell')
    expect(prompt).toContain('perovskite solar cell reaching 33% efficiency')
  })

  it('interpolates maxChars into prompt', () => {
    const prompt = buildMastodonPostPrompt(baseStory)
    expect(prompt).toContain('350')
  })

  it('includes relevance summary when present', () => {
    const prompt = buildMastodonPostPrompt(baseStory)
    expect(prompt).toContain('lower solar panel costs by 40%')
  })

  it('omits relevance summary when null', () => {
    const withoutRelevance = buildMastodonPostPrompt({ ...baseStory, relevanceSummary: null })
    const withRelevance = buildMastodonPostPrompt(baseStory)
    expect(withoutRelevance).not.toContain('lower solar panel costs by 40%')
    expect(withoutRelevance.length).toBeLessThan(withRelevance.length)
  })

  it('escapes XML special characters', () => {
    const prompt = buildMastodonPostPrompt({ ...baseStory, title: 'A & B <C>' })
    expect(prompt).toContain('A &amp; B &lt;C&gt;')
  })

  it('mentions Mastodon as the target platform', () => {
    const prompt = buildMastodonPostPrompt(baseStory)
    expect(prompt).toContain('Mastodon')
  })

  it('requires discovery hashtags in constraints', () => {
    const prompt = buildMastodonPostPrompt(baseStory)
    expect(prompt).toContain('hashtags for discovery')
    expect(prompt).toContain('#PueblosIndígenas')
  })
})
