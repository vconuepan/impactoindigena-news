import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const brandStory = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, publicApi: { ...real.publicApi, communities: { ...real.publicApi.communities, brandStory } } }
})

const { default: BrandStoryPage } = await import('./BrandStoryPage')

function renderPage(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/comunidad/:slug/n/:brandSlug" element={<BrandStoryPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('BrandStoryPage (D5)', () => {
  it('muestra la vitrina de marca, la fuente y el regreso a la vertical; sin tema ni relevancia', async () => {
    brandStory.mockResolvedValue({
      title: 'Angol inaugura su nuevo CESFAM',
      summary: 'Atenderá a tres sectores rurales.',
      brandSlug: 'angol-abc',
      date: '2026-10-13T12:00:00.000Z',
      sourceUrl: 'https://angolnoticias.cl/cesfam',
      sourceTitle: 'Crudo',
      imageUrl: null,
      publisher: 'Angol Noticias',
      origen: 'territorial',
      community: { slug: 'wallmapu-araucania', name: 'Araucanía' },
    })
    renderPage('/comunidad/wallmapu-araucania/n/angol-abc')
    expect(await screen.findByRole('heading', { name: 'Angol inaugura su nuevo CESFAM' })).toBeInTheDocument()
    expect(screen.getByText('Atenderá a tres sectores rurales.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Leer la nota completa en Angol Noticias/ })).toHaveAttribute('href', 'https://angolnoticias.cl/cesfam')
    expect(screen.getByRole('link', { name: /Araucanía/ })).toHaveAttribute('href', '/comunidad/wallmapu-araucania')
    expect(brandStory).toHaveBeenCalledWith('wallmapu-araucania', 'angol-abc')
  })

  it('si la nota ya no está en la vitrina, lo dice y lleva de vuelta a la vertical', async () => {
    brandStory.mockRejectedValue(new Error('404'))
    renderPage('/comunidad/mapuche/n/nada')
    expect(await screen.findByText('Nota no encontrada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Volver a la vertical/ })).toHaveAttribute('href', '/comunidad/mapuche')
  })
})
