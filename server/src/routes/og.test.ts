import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const mockPrisma = vi.hoisted(() => ({
  story: { findUnique: vi.fn() },
}))

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))

import ogRouter from './og.js'

// The og handler builds story HTML by fetching the home "shell" and injecting
// per-story tags. Stub global fetch so getShell() returns a valid shell.
const SHELL = '<!DOCTYPE html><html><head><title>Impacto Indígena</title>' +
  '<link rel="canonical" href="https://impactoindigena.news/" data-rh="true"></head>' +
  '<body><div id="root">home content</div><script src="/app.js"></script></body></html>'

const app = express()
app.use('/api/og', ogRouter)

const published = {
  slug: 'a-real-story',
  title: 'A Real Story',
  titleLabel: 'news',
  summary: 'A summary of the story.',
  imageUrl: 'https://impactoindigena.news/images/x.png',
  datePublished: new Date('2026-07-13T00:00:00Z'),
  status: 'published',
}

describe('GET /api/og/story-html — SEO status codes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => SHELL,
    })) as any)
  })

  it('published story → 200 with the story-specific title (not the home)', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(published)
    const res = await request(app).get('/api/og/story-html?slug=a-real-story')
    expect(res.status).toBe(200)
    expect(res.text).toContain('A Real Story')
    expect(res.text).toContain('<link rel="canonical" href="https://impactoindigena.news/stories/a-real-story"')
  })

  it('de-published story (exists but status!=published) → 404, NOT 200 (Soft 404 regression)', async () => {
    mockPrisma.story.findUnique.mockResolvedValue({ ...published, status: 'rejected' })
    const res = await request(app).get('/api/og/story-html?slug=a-real-story')
    // Before the fix this returned 200 with the home shell, which Google
    // classified as a Soft 404. It must now return 404 so crawlers de-index it.
    expect(res.status).toBe(404)
  })

  it('unknown story (not in DB) → 404', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/og/story-html?slug=does-not-exist')
    expect(res.status).toBe(404)
  })

  it('published story but shell fetch fails → 200 (do not 404 a live article)', async () => {
    mockPrisma.story.findUnique.mockResolvedValue(published)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, text: async () => '' })) as any)
    const res = await request(app).get('/api/og/story-html?slug=a-real-story')
    expect(res.status).toBe(200)
  })
})
