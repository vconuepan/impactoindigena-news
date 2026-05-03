import type { PublicStory, PaginatedResponse, Community } from '@shared/types'

export const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options)

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error || res.statusText)
  }

  return res.json()
}

function toQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value))
    }
  }
  const qs = searchParams.toString()
  return qs ? `?${qs}` : ''
}

export interface PublicIssue {
  id: string
  name: string
  slug: string
  description: string
  intro: string
  evaluationIntro: string
  evaluationCriteria: string[]
  sourceNames: string[]
  makeADifference: { label: string; url: string }[]
  parentId: string | null
  publishedStoryCount?: number
  children?: PublicIssue[]
  parent?: { id: string; name: string; slug: string } | null
}

export interface RegionStat {
  region: string
  label: string
  feedCount: number
  storyCount: number
  avgRelevance: number | null
}

export interface CoverageStats {
  periodDays: number
  since: string
  byRegion: RegionStat[]
  totalStories: number
  totalFeeds: number
}

export interface HomepageData {
  issues: PublicIssue[]
  storiesByIssue: Record<string, { uplifting: PublicStory[]; calm: PublicStory[]; negative: PublicStory[] }>
  activeCases?: CaseListItem[]
}

// --- Member auth helpers ---
// Auth is cookie-based: the httpOnly `member_token` cookie carries the JWT (set by the
// magic-link verify endpoint). The non-httpOnly `member_email` cookie is an indicator
// that JS can read to know whether a session exists — it contains no sensitive data.

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

export const memberAuth = {
  /** Email of the authenticated member, or null if not authenticated */
  getEmail(): string | null {
    try {
      return getCookieValue('member_email')
    } catch {
      return null
    }
  },
  isAuthenticated(): boolean {
    try {
      return !!getCookieValue('member_email')
    } catch {
      return false
    }
  },
  /** Clear the indicator cookie client-side and call the logout endpoint to clear httpOnly cookie */
  async logout(): Promise<void> {
    try {
      document.cookie = 'member_email=; Max-Age=0; path=/; SameSite=None; Secure'
      await fetch(`${API_BASE}/auth/magic/logout`, { method: 'POST', credentials: 'include' })
    } catch {
      // best-effort
    }
  },
  // Kept for backward-compat — no-ops since auth is now cookie-based
  setToken(_token: string): void {},
  clearToken(): void { void memberAuth.logout() },
  getToken(): string | null { return null },
}

function memberRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return request<T>(path, {
    ...options,
    credentials: 'include', // send member_token httpOnly cookie automatically
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
}

export const publicApi = {
  homepage: () => request<HomepageData>('/homepage'),

  stories: {
    list: (params?: { page?: number; pageSize?: number; issueSlug?: string; search?: string; emotionTags?: string }) =>
      request<PaginatedResponse<PublicStory>>(`/stories${toQueryString((params || {}) as Record<string, unknown>)}`),
    get: (slug: string) => request<PublicStory>(`/stories/${slug}`),
    related: (slug: string, limit = 4) =>
      request<PublicStory[]>(`/stories/${slug}/related?limit=${limit}`),
    cluster: (slug: string) =>
      request<{ sources: { feedTitle: string; sourceUrl: string }[] }>(`/stories/${slug}/cluster`),
  },

  issues: {
    list: () => request<PublicIssue[]>(`/issues`),
    get: (slug: string) => request<PublicIssue>(`/issues/${slug}`),
  },

  communities: {
    list: () => request<Community[]>(`/communities`),
    get: (slug: string) => request<Community>(`/communities/${slug}`),
    stories: (slug: string, params?: { page?: number; pageSize?: number }) =>
      request<PaginatedResponse<PublicStory>>(
        `/communities/${slug}/stories${toQueryString((params || {}) as Record<string, unknown>)}`
      ),
    membership: (slug: string) =>
      memberRequest<{ isMember: boolean }>(`/communities/${slug}/membership`),
    join: (slug: string) =>
      memberRequest<{ isMember: boolean }>(`/communities/${slug}/join`, { method: 'POST' }),
    leave: (slug: string) =>
      memberRequest<{ isMember: boolean }>(`/communities/${slug}/leave`, { method: 'DELETE' }),
  },

  profile: {
    get: () => memberRequest<{ id: string; email: string; name: string; userType: string }>('/auth/me'),
    update: (name: string) =>
      memberRequest<{ name: string }>('/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),
    memberships: () =>
      memberRequest<{ communities: Array<{ id: string; slug: string; name: string; type: string }> }>('/auth/memberships'),
    digestExclusions: () =>
      memberRequest<{ excludedCommunityIds: string[] }>('/auth/digest-exclusions'),
    excludeDigest: (communityId: string) =>
      memberRequest<{ success: boolean }>(`/auth/digest-exclusions/${communityId}`, { method: 'POST' }),
    includeDigest: (communityId: string) =>
      memberRequest<{ success: boolean }>(`/auth/digest-exclusions/${communityId}`, { method: 'DELETE' }),
    subscriptionStatus: () =>
      memberRequest<{ subscribed: boolean; confirmedAt: string | null }>('/auth/subscription'),
    unsubscribe: () =>
      memberRequest<{ success: boolean }>('/auth/subscription', { method: 'DELETE' }),
  },

  auth: {
    requestMagicLink: (email: string, redirectTo?: string) =>
      request<void>(`/auth/magic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo }),
      }),
    resendMagicLink: (email: string, redirectTo?: string) =>
      request<void>(`/auth/magic/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo }),
      }),
  },

  sources: () =>
    request<{ byRegion: Record<string, string[]>; byIssue: Record<string, string[]>; totalCount: number }>('/sources'),

  sourceProfiles: () =>
    request<SourceProfile[]>('/sources/profiles'),

  coverage: () =>
    request<CoverageStats>('/coverage'),

  subscribe: (data: { email: string; firstName?: string; language?: string }) =>
    request<{ success: boolean; message: string }>('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  submitFeedback: (data: { category: string; message: string; email?: string; website?: string }) =>
    request<{ success: boolean }>('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  spotlight: () =>
    request<SpotlightResponse | null>('/spotlight'),

  contrast: () =>
    request<ContrastResponse>('/contrast'),

  newsletterArchive: () =>
    request<NewsletterListItem[]>('/newsletters'),

  newsletterById: (id: string) =>
    request<NewsletterDetail>(`/newsletters/${id}`),

  cases: () =>
    request<CaseListItem[]>('/cases'),

  caseBySlug: (slug: string) =>
    request<CaseDetail>(`/cases/${slug}`),

  subscribeAlerts: (email: string, topics: string[]) =>
    request<{ success: boolean }>('/alerts/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, topics }),
    }),

  unsubscribeAlerts: (email: string) =>
    request<{ success: boolean }>('/alerts/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }),
}

// ─── Spotlight types ──────────────────────────────────────────────────────────

export interface SpotlightStory {
  slug:          string | null
  title:         string | null
  titleLabel:    string | null
  imageUrl:      string | null
  datePublished: string | null
  issue:         { name: string; slug: string } | null
  source:        string | null
}

// ─── Contrast types ───────────────────────────────────────────────────────────

export interface ContrastOurItem {
  id: string
  title: string
  slug: string | null
  sourceTitle: string
  relevanceScore: number | null
  datePublished: string | null
  issueName: string | null
  issueSlug: string | null
}

export interface ContrastMainstreamItem {
  title: string
  url: string
  source: string | null
  datePublished: string | null
}

export interface ContrastResponse {
  our: ContrastOurItem[]
  mainstream: ContrastMainstreamItem[]
  generatedAt: string
}

export interface SourceProfile {
  id: string
  title: string
  displayTitle: string | null
  url: string | null
  language: string
  region: string | null
  regionLabel: string | null
  issueName: string | null
  issueSlug: string | null
  avgRelevance: number | null
  storyCount: number
  lastPublishedAt: string | null
}

export interface SpotlightResponse {
  spotlight: {
    id:       string
    label:    string
    startsAt: string | null
    endsAt:   string | null
  }
  stories: SpotlightStory[]
}

// ─── Newsletter archive types ─────────────────────────────────────────────────

export interface NewsletterListItem {
  id: string
  title: string
  storyCount: number
  sentAt: string | null
}

export interface NewsletterDetail {
  id: string
  title: string
  html: string
  sentAt: string | null
  storyCount: number
}

// ─── Casos en curso types ─────────────────────────────────────────────────────

export interface CaseListItem {
  id: string
  title: string
  slug: string
  description: string | null
  imageUrl: string | null
  keywords: string[]
  storyCount: number
}

export interface CaseDetail {
  id: string
  title: string
  slug: string
  description: string | null
  imageUrl: string | null
  keywords: string[]
  stories: CaseStory[]
}

export interface CaseStory {
  slug: string | null
  title: string | null
  imageUrl: string | null
  datePublished: string | null
  issueName: string | null
  issueSlug: string | null
  source: string | null
}
