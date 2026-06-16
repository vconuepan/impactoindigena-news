import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import DashboardPage from './DashboardPage'

// Mock the API module
vi.mock('../../lib/admin-api', () => ({
  adminApi: {
    stories: {
      stats: vi.fn().mockResolvedValue({
        fetched: 10,
        pre_analyzed: 5,
        analyzed: 3,
        selected: 2,
        published: 8,
        rejected: 1,
        trashed: 0,
      }),
    },
    jobs: {
      list: vi.fn().mockResolvedValue([
        {
          id: '1',
          jobName: 'crawl_feeds',
          lastStartedAt: '2025-01-01T00:00:00Z',
          lastCompletedAt: '2025-01-01T00:01:00Z',
          lastError: null,
          enabled: true,
          cronExpression: '0 */6 * * *',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ]),
      run: vi.fn().mockResolvedValue({ message: 'Job triggered' }),
    },
  },
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <DashboardPage />
        </QueryClientProvider>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title', () => {
    renderDashboard()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('shows story stats after loading', async () => {
    renderDashboard()
    expect(await screen.findByText('10')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('shows jobs table after loading', async () => {
    renderDashboard()
    expect(await screen.findByText('Crawl Feeds')).toBeInTheDocument()
  })

  it('renders run buttons for each job', async () => {
    renderDashboard()
    expect(await screen.findByRole('button', { name: 'Ejecutar Crawl Feeds' })).toBeInTheDocument()
  })
})
