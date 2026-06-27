import { describe, it, expect } from 'vitest'
import { buildPreassessPrompt, buildReclassifyPrompt, buildAssessPrompt, buildSelectPrompt, buildPodcastPrompt, buildNewsletterIntroPrompt, pickIntroStyle } from '../prompts/index.js'

const guidelines = {
  factors: 'Technology advancement\nScientific discovery',
  antifactors: 'Limited geographic scope',
  ratings: '1-2: Minimal impact\n5-6: Moderate impact\n9-10: Transformative',
}

const issues = [
  { slug: 'ai-technology', name: 'AI & Technology', description: 'Artificial intelligence and tech advances' },
  { slug: 'climate', name: 'Climate', description: 'Climate change and environment' },
]

describe('buildPreassessPrompt', () => {
  it('includes article IDs and titles', () => {
    const stories = [
      { id: 'story-1', title: 'AI Breakthrough', content: 'Some content about AI...' },
      { id: 'story-2', title: 'Climate News', content: 'Climate change update...' },
    ]
    const prompt = buildPreassessPrompt(stories, issues)
    expect(prompt).toContain('Article ID: story-1')
    expect(prompt).toContain('Title: AI Breakthrough')
    expect(prompt).toContain('Article ID: story-2')
  })

  it('truncates content to 1200 chars', () => {
    const longContent = 'x'.repeat(2000)
    const stories = [{ id: 's1', title: 'Test', content: longContent }]
    const prompt = buildPreassessPrompt(stories, issues)
    const contentStart = prompt.indexOf('x'.repeat(100))
    expect(contentStart).toBeGreaterThan(-1)
    expect(prompt).not.toContain('x'.repeat(1500))
  })

  it('includes rating guidelines section', () => {
    const stories = [{ id: 's1', title: 'Test', content: 'Content' }]
    const prompt = buildPreassessPrompt(stories, issues)
    // Prompt uses Spanish tag name
    expect(prompt).toContain('<CRITERIOS DE CALIFICACION>')
  })

  it('does not include issue-specific guidelines', () => {
    const stories = [{ id: 's1', title: 'Test', content: 'Content' }]
    const prompt = buildPreassessPrompt(stories, issues)
    expect(prompt).not.toContain('<FACTORS>')
    expect(prompt).not.toContain('<CRITERIA>')
    expect(prompt).not.toContain('<TOPIC-SPECIFIC LIMITING FACTORS>')
  })

  it('includes issues XML block with slug, name, and description', () => {
    const stories = [{ id: 's1', title: 'Test', content: 'Content' }]
    const prompt = buildPreassessPrompt(stories, issues)
    expect(prompt).toContain('<ISSUES>')
    expect(prompt).toContain('</ISSUES>')
    expect(prompt).toContain('slug="ai-technology"')
    expect(prompt).toContain('name="AI &amp; Technology"')
    expect(prompt).toContain('Artificial intelligence and tech advances')
    expect(prompt).toContain('slug="climate"')
  })

  it('escapes XML characters in issue names', () => {
    const specialIssues = [
      { slug: 'test', name: 'Test & <Special>', description: 'Desc with "quotes"' },
    ]
    const stories = [{ id: 's1', title: 'Test', content: 'Content' }]
    const prompt = buildPreassessPrompt(stories, specialIssues)
    expect(prompt).toContain('name="Test &amp; &lt;Special&gt;"')
  })

  it('uses XML scaffolding structure', () => {
    const stories = [{ id: 's1', title: 'Test', content: 'Content' }]
    const prompt = buildPreassessPrompt(stories, issues)
    expect(prompt).toContain('<ROLE>')
    expect(prompt).toContain('<GOAL>')
    expect(prompt).toContain('<ARTICLES>')
    expect(prompt).toContain('</ARTICLES>')
  })

})

describe('buildReclassifyPrompt', () => {
  it('includes article IDs, titles, and content', () => {
    const stories = [
      { id: 'story-1', title: 'AI Breakthrough', content: 'Some content about AI...' },
    ]
    const prompt = buildReclassifyPrompt(stories, issues)
    expect(prompt).toContain('Article ID: story-1')
    expect(prompt).toContain('Title: AI Breakthrough')
    expect(prompt).toContain('Some content about AI...')
  })

  it('includes issues XML block', () => {
    const stories = [{ id: 's1', title: 'Test', content: 'Content' }]
    const prompt = buildReclassifyPrompt(stories, issues)
    expect(prompt).toContain('<ISSUES>')
    expect(prompt).toContain('slug="ai-technology"')
    expect(prompt).toContain('slug="climate"')
  })

  it('does NOT include rating guidelines', () => {
    const stories = [{ id: 's1', title: 'Test', content: 'Content' }]
    const prompt = buildReclassifyPrompt(stories, issues)
    expect(prompt).not.toContain('<RATING GUIDELINES>')
  })

  it('uses XML scaffolding structure', () => {
    const stories = [{ id: 's1', title: 'Test', content: 'Content' }]
    const prompt = buildReclassifyPrompt(stories, issues)
    expect(prompt).toContain('<ROLE>')
    expect(prompt).toContain('<GOAL>')
    expect(prompt).toContain('<ARTICLES>')
    expect(prompt).toContain('</ARTICLES>')
  })
})

describe('buildAssessPrompt', () => {
  it('includes article metadata', () => {
    const prompt = buildAssessPrompt('Test Title', 'Test content', 'BBC', 'https://bbc.com/article', guidelines)
    expect(prompt).toContain('Title: Test Title')
    expect(prompt).toContain('Publisher: BBC')
    expect(prompt).toContain('URL: https://bbc.com/article')
  })

  it('truncates content to 4000 chars', () => {
    const longContent = 'y'.repeat(5000)
    const prompt = buildAssessPrompt('Title', longContent, 'Pub', 'https://example.com', guidelines)
    expect(prompt).toContain('y'.repeat(4000))
    expect(prompt).not.toContain('y'.repeat(4500))
  })

  it('injects issue-specific guidelines', () => {
    const prompt = buildAssessPrompt('Title', 'Content', 'Pub', 'https://example.com', guidelines)
    expect(prompt).toContain('Technology advancement')
    expect(prompt).toContain('<CRITERIA>')
  })

  it('includes generic limiting factors section', () => {
    const prompt = buildAssessPrompt('Title', 'Content', 'Pub', 'https://example.com', guidelines)
    expect(prompt).toContain('<GENERIC_LIMITING_FACTORS>')
    expect(prompt).toContain('</GENERIC_LIMITING_FACTORS>')
  })

  it('uses XML scaffolding structure', () => {
    const prompt = buildAssessPrompt('Title', 'Content', 'Pub', 'https://example.com', guidelines)
    expect(prompt).toContain('<ROLE>')
    expect(prompt).toContain('<GOAL>')
    expect(prompt).toContain('<UNTRUSTED_ARTICLE>')
    expect(prompt).toContain('<ANALYSIS_REQUIREMENTS>')
    expect(prompt).toContain('<GUIDELINES>')
  })

})

describe('buildSelectPrompt', () => {
  const stories = [
    {
      id: 'story-1',
      title: 'AI Progress',
      summary: 'Summary of AI article',
      relevanceReasons: 'Factor 1\nFactor 2',
      antifactors: 'Limiting factor 1',
      relevanceCalculation: 'Key factor: 6',
      emotionTag: 'uplifting',
    },
    {
      id: 'story-2',
      title: 'Climate Update',
      summary: 'Summary of climate article',
      relevanceReasons: 'Factor A',
      antifactors: 'Limiting factor A',
      relevanceCalculation: 'Key factor: 4',
      emotionTag: 'frustrating',
    },
  ]

  it('includes article XML blocks', () => {
    const prompt = buildSelectPrompt(stories, 1)
    expect(prompt).toContain('<ARTICLE>')
    expect(prompt).toContain('<ID>story-1</ID>')
    expect(prompt).toContain('<Title>AI Progress</Title>')
    expect(prompt).toContain('<Summary>Summary of AI article</Summary>')
  })

  it('includes selection count in goal', () => {
    const prompt = buildSelectPrompt(stories, 1)
    // Prompt uses Spanish
    expect(prompt).toContain('1 artículos de los 2 candidatos')
  })

  it('uses XML scaffolding structure', () => {
    const prompt = buildSelectPrompt(stories, 1)
    expect(prompt).toContain('<ROLE>')
    expect(prompt).toContain('<GOAL>')
    // Spanish tag name
    expect(prompt).toContain('<CRITERIOS_DE_SELECCION>')
  })

  it('escapes XML characters in content', () => {
    const storiesWithSpecial = [{
      id: 's1',
      title: 'Test & <special>',
      summary: 'Summary with "quotes"',
      relevanceReasons: null,
      antifactors: null,
      relevanceCalculation: null,
      emotionTag: null,
    }]
    const prompt = buildSelectPrompt(storiesWithSpecial, 1)
    expect(prompt).toContain('&amp;')
    expect(prompt).toContain('&lt;special&gt;')
  })
})

describe('buildPodcastPrompt', () => {
  const stories = [
    {
      category: 'AI & Technology',
      title: 'AI Breakthrough',
      summary: 'Major AI advancement in reasoning',
      publisher: 'Nature',
      relevanceReasons: 'Technology factor\nScientific discovery',
      antifactors: 'Early stage technology',
    },
    {
      category: 'Climate',
      title: 'Climate Report',
      summary: 'New climate data released',
      publisher: 'Guardian',
      relevanceReasons: 'Environmental impact',
      antifactors: 'Report only',
    },
  ]

  it('includes STORY XML blocks with all fields', () => {
    const prompt = buildPodcastPrompt(stories)
    expect(prompt).toContain('<STORY>')
    expect(prompt).toContain('Category: AI & Technology')
    expect(prompt).toContain('Title: AI Breakthrough')
    expect(prompt).toContain('Summary of original article: Major AI advancement in reasoning')
    expect(prompt).toContain('Publisher of original article: Nature')
    expect(prompt).toContain('</STORY>')
  })

  it('formats relevance reasons as bullet points', () => {
    const prompt = buildPodcastPrompt(stories)
    expect(prompt).toContain('Relevance of the article\n- Technology factor\n- Scientific discovery')
  })

  it('formats antifactors as bullet points', () => {
    const prompt = buildPodcastPrompt(stories)
    expect(prompt).toContain('Limiting factors for the relevance\n- Early stage technology')
  })
})

describe('buildNewsletterIntroPrompt', () => {
  const stories = [
    { title: 'AI Breakthrough', issueName: 'Technology', blurb: 'Major AI advancement', emotionTag: 'uplifting' },
    { title: 'Climate Report', issueName: 'Climate', blurb: 'New climate data released', emotionTag: 'calm' },
  ]
  const issueNames = ['Climate', 'Technology']

  it('uses XML scaffolding structure', () => {
    const prompt = buildNewsletterIntroPrompt(stories, issueNames)
    expect(prompt).toContain('<ROLE>')
    expect(prompt).toContain('<GOAL>')
    expect(prompt).toContain('<GUIDELINES>')
    expect(prompt).toContain('<STORIES>')
    expect(prompt).toContain('</STORIES>')
  })

  it('includes story titles, issues, emotion tags, and blurbs', () => {
    const prompt = buildNewsletterIntroPrompt(stories, issueNames)
    expect(prompt).toContain('<TITLE>AI Breakthrough</TITLE>')
    expect(prompt).toContain('<ISSUE>Technology</ISSUE>')
    expect(prompt).toContain('<EMOTION>uplifting</EMOTION>')
    expect(prompt).toContain('<BLURB>Major AI advancement</BLURB>')
    expect(prompt).toContain('<TITLE>Climate Report</TITLE>')
  })

  it('includes issue categories', () => {
    const prompt = buildNewsletterIntroPrompt(stories, issueNames)
    expect(prompt).toContain('<ISSUE_CATEGORIES>')
    expect(prompt).toContain('- Climate')
    expect(prompt).toContain('- Technology')
  })

  it('escapes XML characters in content', () => {
    const storiesWithSpecial = [
      { title: 'Test & <special>', issueName: 'Tech', blurb: 'Blurb with "quotes"', emotionTag: 'calm' },
    ]
    const prompt = buildNewsletterIntroPrompt(storiesWithSpecial, ['Tech'])
    expect(prompt).toContain('&amp;')
    expect(prompt).toContain('&lt;special&gt;')
  })

  it('includes a STYLE block', () => {
    const prompt = buildNewsletterIntroPrompt(stories, issueNames)
    expect(prompt).toContain('<STYLE>')
    expect(prompt).toContain('</STYLE>')
  })

  it('uses an explicit style when provided', () => {
    const customStyle = 'Start with a bold claim.'
    const prompt = buildNewsletterIntroPrompt(stories, issueNames, customStyle)
    expect(prompt).toContain(customStyle)
  })

  it('pickIntroStyle returns a non-empty string', () => {
    const style = pickIntroStyle()
    expect(style).toBeTruthy()
    expect(typeof style).toBe('string')
  })

})
