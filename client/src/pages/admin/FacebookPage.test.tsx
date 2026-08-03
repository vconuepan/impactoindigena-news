import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'
import FacebookPage from './FacebookPage'
import type { FacebookPost } from '@shared/types'

const mockApi = vi.hoisted(() => ({
  listPosts: vi.fn(),
  publishPost: vi.fn(),
  updateDraft: vi.fn(),
  deletePost: vi.fn(),
  refreshMetrics: vi.fn(),
  tokenStatus: vi.fn(),
}))

vi.mock('../../lib/admin-api', () => ({
  adminApi: { facebook: mockApi },
}))

// La tarjeta del token hace su propia query; se aísla para testear solo la tabla.
vi.mock('../../components/admin/FacebookTokenCard', () => ({
  FacebookTokenCard: () => null,
}))

function post(overrides: Partial<FacebookPost>): FacebookPost {
  return {
    id: 'p1',
    storyId: 's1',
    postText: 'Tres países aprobaron leyes de restitución de tierras este año.',
    status: 'draft',
    facebookPostId: null,
    permalink: null,
    error: null,
    publishedAt: null,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    metricsUpdatedAt: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    story: {
      title: 'Leyes de 3 países devuelven tierras',
      titleLabel: null,
      sourceUrl: 'https://example.org/nota',
      slug: 'leyes-devuelven-tierras',
      imageUrl: 'https://cdn.example.org/portada.webp',
      issue: null,
      relevance: 8,
      feed: { title: 'Fuente', displayTitle: 'Fuente' },
    },
    ...overrides,
  } as FacebookPost
}

function renderPage(posts: FacebookPost[]) {
  mockApi.listPosts.mockResolvedValue({ posts, total: posts.length, page: 1, limit: 25 })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <FacebookPage />
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

describe('FacebookPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ofrece editar/publicar en un borrador', async () => {
    renderPage([post({ status: 'draft' })])

    expect(await screen.findByLabelText('Editar/Publicar')).toBeInTheDocument()
  })

  // Publicar acepta `failed`, así que editar también: se corrige y se reintenta
  // sin regenerar el borrador.
  it('ofrece editar/publicar en un fallido', async () => {
    renderPage([post({ id: 'p2', status: 'failed', error: 'invalid page token' })])

    expect(await screen.findByLabelText('Editar/Publicar')).toBeInTheDocument()
  })

  it('el panel muestra la tarjeta de enlace, no una imagen subida', async () => {
    const user = userEvent.setup()
    renderPage([post({ status: 'draft' })])

    await user.click(await screen.findByLabelText('Editar/Publicar'))

    expect(await screen.findByText('Tarjeta de enlace')).toBeInTheDocument()
    expect(screen.getByText(/el clic lleva al artículo/)).toBeInTheDocument()
  })

  it('no ofrece editar uno publicado, y enlaza a la publicación', async () => {
    renderPage([
      post({
        id: 'p3',
        status: 'published',
        facebookPostId: '123_456',
        permalink: 'https://www.facebook.com/123/posts/456',
        publishedAt: '2026-08-03T10:00:00.000Z',
      }),
    ])

    expect(await screen.findByTitle('Ver en Facebook')).toBeInTheDocument()
    expect(screen.queryByLabelText('Editar/Publicar')).not.toBeInTheDocument()
  })

  it('advierte que borrar un publicado no baja la publicación', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage([
      post({
        id: 'p4',
        status: 'published',
        permalink: 'https://www.facebook.com/123/posts/457',
      }),
    ])

    await user.click(await screen.findByLabelText('Eliminar'))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('seguirá en la Página'))
    expect(mockApi.deletePost).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  // Los grupos no se pueden automatizar y la página tiene que decirlo, para que
  // nadie espere que este canal cubra donde está la audiencia real.
  it('aclara que los grupos no se pueden automatizar', async () => {
    renderPage([])

    expect(await screen.findByText(/grupos no se pueden automatizar/)).toBeInTheDocument()
  })
})
