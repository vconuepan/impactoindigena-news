import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'
import LinkedInPage from './LinkedInPage'
import type { LinkedInPost } from '@shared/types'

const mockApi = vi.hoisted(() => ({
  listPosts: vi.fn(),
  publishPost: vi.fn(),
  updateDraft: vi.fn(),
  deletePost: vi.fn(),
}))

vi.mock('../../lib/admin-api', () => ({
  adminApi: { linkedin: mockApi },
}))

// La tarjeta del token hace su propia query; se aísla para testear solo la tabla.
vi.mock('../../components/admin/LinkedInTokenCard', () => ({
  LinkedInTokenCard: () => null,
}))

function post(overrides: Partial<LinkedInPost>): LinkedInPost {
  return {
    id: 'p1',
    storyId: 's1',
    postText: 'Minería y tierras indígenas: no es caridad, es justicia.',
    status: 'draft',
    postUrl: null,
    slideUrls: [],
    publishedAt: null,
    likeCount: 0,
    commentCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    story: {
      title: 'Leyes de 3 países devuelven tierras',
      titleLabel: null,
      issue: null,
      relevance: 8,
      // El panel lee story.feed.displayTitle sin optional chaining sobre feed,
      // así que el fixture tiene que traerlo igual que lo hace la API real.
      feed: { title: 'Fuente', displayTitle: 'Fuente' },
    },
    ...overrides,
  } as LinkedInPost
}

function renderPage(posts: LinkedInPost[]) {
  mockApi.listPosts.mockResolvedValue({ posts, total: posts.length, page: 1, limit: 25 })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <LinkedInPage />
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

describe('LinkedInPage — acciones por estado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Regresión del 1-ago-2026: la tabla solo ofrecía eliminar, y la ficha de la
  // historia esconde el botón de generar en cuanto existe cualquier post. Un
  // borrador de LinkedIn quedaba atrapado, sin ninguna ruta para publicarlo.
  it('ofrece editar/publicar en un borrador', async () => {
    renderPage([post({ status: 'draft' })])

    expect(await screen.findByLabelText('Editar/Publicar')).toBeInTheDocument()
  })

  it('ofrece editar/publicar en un fallido, para reintentarlo', async () => {
    renderPage([post({ id: 'p2', status: 'failed' })])

    expect(await screen.findByLabelText('Editar/Publicar')).toBeInTheDocument()
  })

  it('no ofrece editar en uno ya publicado', async () => {
    renderPage([
      post({
        id: 'p3',
        status: 'published',
        postUrl: 'https://www.linkedin.com/feed/update/urn:li:share:123',
        publishedAt: '2026-08-01T10:00:00.000Z',
      }),
    ])

    expect(await screen.findByTitle('Ver en LinkedIn')).toBeInTheDocument()
    expect(screen.queryByLabelText('Editar/Publicar')).not.toBeInTheDocument()
  })

  it('abre el panel del borrador al hacer clic', async () => {
    const user = userEvent.setup()
    renderPage([post({ status: 'draft' })])

    await user.click(await screen.findByLabelText('Editar/Publicar'))

    // El panel monta su textarea con el texto del borrador, editable.
    expect(await screen.findByDisplayValue(/no es caridad, es justicia/)).toBeInTheDocument()
  })
})
