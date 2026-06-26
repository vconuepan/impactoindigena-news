import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import SearchPage from './SearchPage'
import { publicApi } from '../lib/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'search.label': 'Search',
        'search.empty': 'Enter a term to search for stories.',
        'search.promptFilters': 'Enter a term or pick a date range.',
        'search.resultsFor': `Results for "${opts?.q}"`,
        'search.results_other': `${opts?.count} results`,
        'search.results_one': '1 result',
        'search.noResults': `No results found for "${opts?.q}".`,
        'search.noResultsFiltered': 'No results found for those filters.',
        'search.dateFrom': 'From',
        'search.dateTo': 'To',
        'search.clearFilters': 'Clear filters',
        'search.backToHome': '← Back to home',
        'search.defaultTitle': 'Search stories',
      }
      return map[key] ?? key
    },
    i18n: { language: 'es', changeLanguage: vi.fn() },
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}))

vi.mock('../lib/api', () => ({
  publicApi: {
    stories: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'story-1',
            title: 'Climate Change Report',
            summary: 'A summary about climate',
            sourceUrl: 'https://example.com',
            datePublished: '2024-01-15',
            feed: { title: 'Test Feed', issue: { name: 'Planet & Climate', slug: 'planet-climate' } },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      }),
    },
  },
}))

function renderSearchPage(initialEntry = '/search?q=climate') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <QueryClientProvider client={queryClient}>
          <SearchPage />
        </QueryClientProvider>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders search results heading with query', async () => {
    renderSearchPage('/search?q=climate')
    expect(await screen.findByText(/climate/)).toBeTruthy()
  })

  it('shows search input when no query provided', async () => {
    renderSearchPage('/search')
    expect(await screen.findByRole('searchbox')).toBeTruthy()
  })

  it('renders date range inputs', async () => {
    renderSearchPage('/search?q=climate')
    expect(await screen.findByLabelText('From')).toBeTruthy()
    expect(await screen.findByLabelText('To')).toBeTruthy()
  })

  it('passes the date range to the stories query (with a term)', async () => {
    renderSearchPage('/search?q=mapuche&from=2026-06-13&to=2026-06-13')
    await screen.findByText(/mapuche/)
    expect(publicApi.stories.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'mapuche', dateFrom: '2026-06-13', dateTo: '2026-06-13' }),
    )
  })

  it('filters by date range without a search term', async () => {
    renderSearchPage('/search?from=2026-06-13&to=2026-06-13')
    // Results render because a date filter is active even without a term
    expect(await screen.findByText('Climate Change Report')).toBeTruthy()
    expect(publicApi.stories.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined, dateFrom: '2026-06-13', dateTo: '2026-06-13' }),
    )
  })
})
