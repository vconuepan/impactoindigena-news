import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'
import TwitterPage from './TwitterPage'
import type { TwitterPost } from '@shared/types'

const mockApi = vi.hoisted(() => ({
  listPosts: vi.fn(),
  publishPost: vi.fn(),
  updateDraft: vi.fn(),
  deletePost: vi.fn(),
  refreshMetrics: vi.fn(),
}))

vi.mock('../../lib/admin-api', () => ({
  adminApi: { twitter: mockApi },
}))

function post(overrides: Partial<TwitterPost>): TwitterPost {
  return {
    id: 'p1',
    storyId: 's1',
    postText: 'Minería y tierras indígenas: no es caridad, es justicia.',
    status: 'draft',
    tweetId: null,
    tweetUrl: null,
    imageUrl: null,
    error: null,
    publishedAt: null,
    likeCount: 0,
    retweetCount: 0,
    replyCount: 0,
    quoteCount: 0,
    metricsUpdatedAt: null,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    story: {
      title: 'Leyes de 3 países devuelven tierras',
      titleLabel: null,
      sourceUrl: 'https://example.org/nota',
      slug: 'leyes-devuelven-tierras',
      issue: null,
      relevance: 8,
      feed: { title: 'Fuente', displayTitle: 'Fuente' },
    },
    ...overrides,
  } as TwitterPost
}

function renderPage(posts: TwitterPost[]) {
  mockApi.listPosts.mockResolvedValue({ posts, total: posts.length, page: 1, limit: 25 })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <TwitterPage />
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

describe('TwitterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ofrece editar/publicar en un borrador', async () => {
    renderPage([post({ status: 'draft' })])

    expect(await screen.findByLabelText('Editar/Publicar')).toBeInTheDocument()
  })

  it('abre el panel con el texto editable', async () => {
    const user = userEvent.setup()
    renderPage([post({ status: 'draft' })])

    await user.click(await screen.findByLabelText('Editar/Publicar'))

    expect(await screen.findByDisplayValue(/no es caridad, es justicia/)).toBeInTheDocument()
  })

  // X publica solo desde `draft`, así que un fallido se elimina y se regenera.
  // El panel se abre para leer el error, pero sin ofrecer publicar: prometer un
  // reintento que el backend rechaza con 400 es el bug que ya costó dos canales.
  it('en un fallido muestra el error sin ofrecer publicar', async () => {
    const user = userEvent.setup()
    renderPage([post({ id: 'p2', status: 'failed', error: 'rate limit exceeded' })])

    await user.click(await screen.findByLabelText('Ver el error'))

    // El panel explica la vía de recuperación, que es lo que la tabla no puede decir.
    expect(await screen.findByText(/elimínalo en la tabla y genera el/)).toBeInTheDocument()
    // El error sale en la fila (truncado) y en el panel (completo).
    expect(screen.getAllByText(/rate limit exceeded/).length).toBeGreaterThan(1)
    expect(screen.getByRole('button', { name: /Publicar en X/ })).toBeDisabled()
  })

  it('no ofrece editar uno ya publicado, y enlaza al tweet', async () => {
    renderPage([
      post({
        id: 'p3',
        status: 'published',
        tweetId: '123',
        tweetUrl: 'https://x.com/impactoindigena/status/123',
        publishedAt: '2026-08-02T10:00:00.000Z',
      }),
    ])

    expect(await screen.findByTitle('Ver en X')).toBeInTheDocument()
    expect(screen.queryByLabelText('Editar/Publicar')).not.toBeInTheDocument()
  })

  it('muestra vacío cuando no hay publicaciones', async () => {
    renderPage([])

    expect(await screen.findByText('Sin publicaciones')).toBeInTheDocument()
  })

  it('advierte que borrar un publicado no baja el tweet', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage([
      post({
        id: 'p4',
        status: 'published',
        tweetUrl: 'https://x.com/impactoindigena/status/124',
      }),
    ])

    await user.click(await screen.findByLabelText('Eliminar'))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('seguirá publicado en X'))
    expect(mockApi.deletePost).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
