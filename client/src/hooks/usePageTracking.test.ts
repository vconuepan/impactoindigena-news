import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import { classifyReferrer, usePageTracking } from './usePageTracking'

describe('usePageTracking y el horneado del build (B23)', () => {
  const conRuta = ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: ['/comunidad/aymara'] }, children)

  afterEach(() => {
    delete (window as unknown as { __PRERENDER_INJECTED?: unknown }).__PRERENDER_INJECTED
    vi.unstubAllGlobals()
  })

  it('un lector manda su visita', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => usePageTracking(), { wrapper: conRuta })
    expect(fetchMock).toHaveBeenCalledWith('/api/track', expect.objectContaining({ method: 'POST' }))
  })

  it('el prerender NO manda visita: no lo es, y gastaba el cupo del limitador', () => {
    ;(window as unknown as { __PRERENDER_INJECTED?: unknown }).__PRERENDER_INJECTED = { prerender: true }
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => usePageTracking(), { wrapper: conRuta })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

const HOST = 'vocesindigenas.org'

describe('classifyReferrer', () => {
  it('empty referrer → direct', () => {
    expect(classifyReferrer('', HOST)).toBe('')
  })

  it('invalid referrer → direct', () => {
    expect(classifyReferrer('not-a-url', HOST)).toBe('')
  })

  it('same host → internal', () => {
    expect(classifyReferrer('https://vocesindigenas.org/stories/x', HOST)).toBe('internal')
  })

  it('search engines → search', () => {
    expect(classifyReferrer('https://www.google.com/search?q=indigena', HOST)).toBe('search')
    expect(classifyReferrer('https://www.google.cl/', HOST)).toBe('search')
    expect(classifyReferrer('https://duckduckgo.com/', HOST)).toBe('search')
    expect(classifyReferrer('https://www.bing.com/', HOST)).toBe('search')
  })

  it('social networks → social', () => {
    expect(classifyReferrer('https://l.facebook.com/', HOST)).toBe('social')
    expect(classifyReferrer('https://t.co/abc123', HOST)).toBe('social')
    expect(classifyReferrer('https://www.linkedin.com/feed/', HOST)).toBe('social')
    expect(classifyReferrer('https://bsky.app/profile/x', HOST)).toBe('social')
    expect(classifyReferrer('https://www.instagram.com/', HOST)).toBe('social')
  })

  it('other external sites → referral', () => {
    expect(classifyReferrer('https://somenewspaper.com/article', HOST)).toBe('referral')
    expect(classifyReferrer('https://news.ycombinator.com/', HOST)).toBe('referral')
  })
})
