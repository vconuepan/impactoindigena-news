import jwt from 'jsonwebtoken'

export const TEST_API_KEY = 'test-admin-key-12345'
// Must be >= 32 chars: auth's getJwtSecret() rejects shorter secrets (hardened in the security PR).
export const TEST_JWT_SECRET = 'test-jwt-secret-for-helpers-0123456789'

// Set JWT_SECRET early so auth middleware can verify tokens
process.env.JWT_SECRET = TEST_JWT_SECRET

export function authHeader() {
  const token = jwt.sign(
    { userId: 'test-admin-id', email: 'admin@test.com', role: 'admin' },
    TEST_JWT_SECRET,
    { expiresIn: '15m' },
  )
  return { Authorization: `Bearer ${token}` }
}

export function apiKeyHeader() {
  return { Authorization: `Bearer ${TEST_API_KEY}` }
}

// Sample data factories

export function sampleIssue(overrides: Record<string, any> = {}) {
  return {
    id: 'issue-1',
    name: 'AI & Technology',
    slug: 'ai-technology',
    description: 'Test description',
    promptFactors: 'Test factors',
    promptAntifactors: 'Test antifactors',
    promptRatings: 'Test ratings',
    parentId: null,
    intro: '',
    evaluationIntro: '',
    evaluationCriteria: '',
    sourceNames: '',
    makeADifference: '',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

export function sampleFeed(overrides: Record<string, any> = {}) {
  return {
    id: 'feed-1',
    title: 'Test Feed',
    rssUrl: 'https://example.com/feed',
    url: null,
    displayTitle: null,
    language: 'en',
    issueId: 'issue-1',
    active: true,
    crawlIntervalHours: 24,
    lastCrawledAt: null,
    htmlSelector: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

export function sampleNewsletter(overrides: Record<string, any> = {}) {
  return {
    id: 'newsletter-1',
    title: 'Weekly Roundup #1',
    content: '',
    html: '',
    storyIds: [],
    selectedStoryIds: [],
    status: 'draft' as const,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

export function samplePodcast(overrides: Record<string, any> = {}) {
  return {
    id: 'podcast-1',
    title: 'Episode #1',
    script: '',
    storyIds: [],
    status: 'draft' as const,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

export function sampleUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    email: 'admin@test.com',
    name: 'Test Admin',
    role: 'admin',
    userType: 'ADMIN',
    passwordHash: '$2a$12$fakehashfortest',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

export function sampleStory(overrides: Record<string, any> = {}) {
  return {
    id: 'story-1',
    sourceUrl: 'https://example.com/article',
    sourceTitle: 'Test Article',
    sourceContent: 'Test content',
    sourceDatePublished: null,
    feedId: 'feed-1',
    status: 'fetched' as const,
    dateCrawled: new Date('2024-01-01'),
    datePublished: null,
    relevancePre: null,
    relevance: null,
    emotionTag: null,
    title: null,
    summary: null,
    quote: null,
    marketingBlurb: null,
    relevanceReasons: null,
    antifactors: null,
    relevanceCalculation: null,
    crawlMethod: null,
    issueId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}
